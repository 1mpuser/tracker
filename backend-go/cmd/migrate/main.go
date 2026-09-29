package main

import (
	"errors"
	"log"
	"net/url"
	"os"

	"github.com/1mpuser/tracker/backend-go/migrations"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// Накатывает все up-миграции на базу из DATABASE_URL через golang-migrate.
// Использование: DATABASE_URL=... go run ./cmd/migrate
func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL не задан")
	}

	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		log.Fatalf("migration source: %v", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, ensureNoSSL(dsn))
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}
	if err := m.Up(); err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			log.Println("База уже актуальна, изменений нет")
			return
		}
		log.Fatalf("up: %v", err)
	}
	v, _, err := m.Version()
	if err != nil {
		log.Fatalf("version: %v", err)
	}
	log.Printf("миграции применены, версия %d", v)
}

// ensureNoSSL гарантирует sslmode=disable для либpq-драйвера golang-migrate
// (DATABASE_URL локальных баз sslmode не задаёт, а lib/pq по умолчанию
// требует SSL). pgx-клиент к этому не чувствителен.
func ensureNoSSL(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
		u.RawQuery = q.Encode()
	}
	return u.String()
}
