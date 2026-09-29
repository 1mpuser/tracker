package store

import (
	"context"
	"errors"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrUniqueViolation = errors.New("unique violation")

// Store — набор операций с БД, нужных auth/admin/bootstrap. Реализована на
// pgx (PGStore), мокается в unit-тестах. userId всегда первым аргументом, где
// речь о чужой записи.
type Store interface {
	// ---- users ----
	FindUserByEmail(ctx context.Context, email string) (*model.User, error)
	FindUserByID(ctx context.Context, id int64) (*model.User, error)
	ListUsers(ctx context.Context) ([]model.User, error)
	UpdateUserPasswordHash(ctx context.Context, id int64, hash string) error
	UpdateUserTimezone(ctx context.Context, id int64, timezone string) error
	UpdateUserBlockedAt(ctx context.Context, id int64, blockedAt *time.Time) error
	UpdateUserAdmin(ctx context.Context, id int64, isAdmin bool) error
	DeleteUser(ctx context.Context, id int64) error

	// ---- sessions ----
	CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error
	FindSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error)
	UpdateSession(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error
	DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error
	DeleteSessionsByUser(ctx context.Context, userID int64) error
	DeleteSessionsByUserExcept(ctx context.Context, userID int64, tokenHash string) error
	DeleteExpiredSessions(ctx context.Context, now time.Time) error

	// ---- создание учётки одной транзакцией (UserBootstrapService) ----
	CreateUserWithDefaults(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error)
}

// IsUniqueViolation проверяет, что ошибка — нарушение уникальности в Postgres
// (код 23505, аналог Prisma P2002).
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return errors.Is(err, ErrUniqueViolation)
}
