package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/bootstrap"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

// bootstrap-скрипт создания учётки: единственный путь завести пользователя
// в обход админки (аналог create-admin.ts / UserBootstrapService). Без
// публичной регистрации. Пароль — из --password-stdin или из промпта не
// поддерживаем здесь (неинтерактивно); берите из stdin.
func main() {
	var email, timezone string
	var adminFlag bool
	var passwordStdin bool
	flag.StringVar(&email, "email", "", "почта (логин)")
	flag.StringVar(&timezone, "timezone", "Europe/Moscow", "часовой пояс")
	flag.BoolVar(&adminFlag, "admin", false, "сделать учётку администратором")
	flag.BoolVar(&passwordStdin, "password-stdin", false, "читать пароль из stdin")
	flag.Parse()

	if email == "" {
		log.Fatal("использование: createuser --email you@example.com [--timezone Europe/Moscow] [--admin] [--password-stdin]")
	}
	email = strings.ToLower(strings.TrimSpace(email))

	password, err := readPassword(passwordStdin)
	if err != nil {
		log.Fatal(err)
	}
	if len(password) < 8 || len(password) > 128 {
		log.Fatal("Пароль должен быть от 8 до 128 символов")
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		log.Fatalf("Неизвестный часовой пояс: %s", timezone)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	st := store.NewPGStore(pool)
	bootstrapSvc := bootstrap.NewService(st, cfg.DistractionBudgetDefault)

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("hash: %v", err)
	}
	user, err := bootstrapSvc.CreateUser(ctx, bootstrap.CreateUserInput{
		Email:        email,
		PasswordHash: &hash,
		Timezone:     timezone,
	})
	if err != nil {
		if store.IsUniqueViolation(err) {
			log.Fatalf("Адрес %s уже занят", email)
		}
		log.Fatalf("create user: %v", err)
	}

	if adminFlag {
		if err := st.UpdateUserAdmin(ctx, user.ID, true); err != nil {
			log.Fatalf("promote: %v", err)
		}
	}
	fmt.Printf("Пользователь создан: %s (%s), id=%d, admin=%v\n", email, timezone, user.ID, adminFlag)
}

func readPassword(stdin bool) (string, error) {
	if stdin {
		sc := bufio.NewScanner(os.Stdin)
		if sc.Scan() {
			return strings.TrimSpace(sc.Text()), nil
		}
		return "", fmt.Errorf("нет пароля в stdin")
	}
	return "", fmt.Errorf("задайте --password-stdin (неинтерактивно)")
}
