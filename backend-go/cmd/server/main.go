package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/admin"
	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/bootstrap"
	"github.com/1mpuser/tracker/backend-go/internal/caldav"
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/icloud"
	"github.com/1mpuser/tracker/backend-go/internal/integrations"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/obsidian"
	"github.com/1mpuser/tracker/backend-go/internal/routines"
	"github.com/1mpuser/tracker/backend-go/internal/server"
	"github.com/1mpuser/tracker/backend-go/internal/session"
	"github.com/1mpuser/tracker/backend-go/internal/settings"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/tasktemplates"
	"github.com/1mpuser/tracker/backend-go/internal/telegram"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL не задан")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping: %v", err)
	}

	st := store.NewPGStore(pool)
	authSvc := auth.NewService(st, cfg.Auth)
	bootstrapSvc := bootstrap.NewService(st, cfg.DistractionBudgetDefault)
	adminSvc := admin.NewService(st, bootstrapSvc)

	categoriesSvc := categories.NewService(st)
	statsSvc := stats.NewService(st)

	// Интеграции: учётные данные из Settings пользователя, секрет — AES-256-GCM
	// ключом APP_ENCRYPTION_KEY (enc:v1:...). Env-фоллбэков нет.
	caldavPool := caldav.NewPool(nil)
	integrationsSvc := integrations.NewService(st, caldavPool, cfg.EncryptionKey, crypto.EncryptSecret, crypto.DecryptSecret)
	icloudSvc := icloud.NewService(caldavPool, integrationsSvc)
	sessionSvc := session.NewService(caldavPool, integrationsSvc)
	obsidianSvc := obsidian.NewService(cfg.ObsidianExportDir)

	telegramClient := telegram.NewClient(nil)
	telegramConfig := telegram.NewConfigService(st, telegramClient, cfg.EncryptionKey, crypto.EncryptSecret, crypto.DecryptSecret)
	telegramDelivery := telegram.NewDeliveryService(st, telegramConfig, telegramClient)

	settingsSvc := settings.NewService(st, integrationsSvc, obsidianSvc.Enabled())
	gtdSvc := gtd.NewService(st, obsidianSvc, icloudSvc)
	daysSvc := days.NewService(st, categoriesSvc, gtdSvc, statsSvc, telegramDelivery)
	routinesSvc := routines.NewService(st, daysSvc)
	taskTemplateSvc := tasktemplates.NewService(st)

	// Чистка просроченных сессий на старте и раз в сутки (см. onModuleInit в
	// auth.service.ts).
	go cleanupLoop(ctx, authSvc)

	// Стартовый синк интеграций: best-effort по всем пользователям; ошибка
	// одного не блокирует остальных и не блокирует старт сервера. Аналог блока
	// в backend/src/main.ts.
	go startupSync(ctx, st, gtdSvc, obsidianSvc, icloudSvc, telegramConfig)

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: server.NewServer(
			cfg, authSvc, adminSvc,
			categoriesSvc, daysSvc, routinesSvc, taskTemplateSvc, gtdSvc, statsSvc, settingsSvc,
			sessionSvc, telegramDelivery, telegramConfig, integrationsSvc, icloudSvc,
		).Handler(),
	}

	go func() {
		log.Printf("backend-go listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

func cleanupLoop(ctx context.Context, authSvc *auth.Service) {
	for {
		if err := authSvc.CleanupExpired(ctx); err != nil {
			log.Printf("cleanup expired sessions: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(24 * time.Hour):
		}
	}
}

func startupSync(ctx context.Context, st store.Store, gtdSvc *gtd.Service, obsidianSvc *obsidian.Service, icloudSvc *icloud.Service, telegramConfig *telegram.ConfigService) {
	// Одноразовая миграция открытых Telegram-токенов (если их оставила
	// однопользовательская версия) в зашифрованный вид. Логируем только факт.
	if err := telegramConfig.MigratePlainTokens(ctx); err != nil {
		log.Printf("telegram token migration: %v", err)
	}

	users, err := st.ListUsers(ctx)
	if err != nil {
		log.Printf("startup sync: list users: %v", err)
		return
	}
	for _, u := range users {
		au := model.AuthUser{ID: u.ID, Email: u.Email, Timezone: u.Timezone}
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("startup sync user #%d panicked: %v", u.ID, r)
				}
			}()
			if refItems, err := gtdSvc.GetItems(ctx, au, strPtr("reference")); err == nil {
				obsidianSvc.SyncAllReference(ctx, au, refItems)
			} else {
				log.Printf("startup sync user #%d obsidian items: %v", u.ID, err)
			}
			if allItems, err := gtdSvc.GetItems(ctx, au, nil); err == nil {
				icloudSvc.SyncAllOnStartup(ctx, au, allItems)
			} else {
				log.Printf("startup sync user #%d icloud items: %v", u.ID, err)
			}
		}()
	}
}

func strPtr(s string) *string { return &s }
