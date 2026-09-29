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
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/server"
	"github.com/1mpuser/tracker/backend-go/internal/store"
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

	// Чистка просроченных сессий на старте и раз в сутки (см. onModuleInit в
	// auth.service.ts).
	go cleanupLoop(ctx, authSvc)

	srv := &http.Server{
		Addr:    cfg.Addr,
		Handler: server.NewServer(cfg, authSvc, adminSvc).Handler(),
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
