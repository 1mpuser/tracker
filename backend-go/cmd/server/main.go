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
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/routines"
	"github.com/1mpuser/tracker/backend-go/internal/server"
	"github.com/1mpuser/tracker/backend-go/internal/settings"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/tasktemplates"
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
	settingsFlags := settings.NewResolver(st, cfg.EncryptionKey, crypto.DecryptSecret)
	settingsSvc := settings.NewService(st, settingsFlags, cfg.ObsidianExportDir != "")
	statsSvc := stats.NewService(st)
	gtdSvc := gtd.NewService(st, noopObsidian{}, noopICloud{})
	daysSvc := days.NewService(st, categoriesSvc, gtdSvc, statsSvc, noopDeliverer{})
	routinesSvc := routines.NewService(st, daysSvc)
	taskTemplateSvc := tasktemplates.NewService(st)

	// Чистка просроченных сессий на старте и раз в сутки (см. onModuleInit в
	// auth.service.ts).
	go cleanupLoop(ctx, authSvc)

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: server.NewServer(
			cfg, authSvc, adminSvc,
			categoriesSvc, daysSvc, routinesSvc, taskTemplateSvc, gtdSvc, statsSvc, settingsSvc,
			server.NotConfiguredSession{},
			server.NotConfiguredTelegram{},
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

// noopObsidian/noopICloud — Obsidian/ iCloud-интеграции в следующих промптах;
// пока side-эффекты GTD-задач выключены, контракт API сохраняется.
type noopObsidian struct{}

func (noopObsidian) SyncNote(context.Context, model.AuthUser, gtd.ItemView) error { return nil }
func (noopObsidian) RemoveNote(context.Context, model.AuthUser, int64) error      { return nil }

type noopICloud struct{}

func (noopICloud) SyncReminder(context.Context, model.AuthUser, gtd.ItemView, gtd.EffectiveDue) error {
	return nil
}
func (noopICloud) CompleteReminder(context.Context, model.AuthUser, int64, gtd.ItemView, gtd.EffectiveDue) error {
	return nil
}
func (noopICloud) RemoveReminder(context.Context, model.AuthUser, int64) error { return nil }

// noopDeliverer — Telegram-рассылка сводок в следующем промпте.
type noopDeliverer struct{}

func (noopDeliverer) DeliverDay(context.Context, int64, int64, days.DayView) error {
	return nil
}
func (noopDeliverer) DeliverWeek(context.Context, int64, int64, string, *string) (days.TelegramReport, error) {
	return days.TelegramReport{Sent: 0, Failed: 0, Skipped: 0}, nil
}
