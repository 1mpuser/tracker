// Package storetest предоставляет тестовый store.Store для unit-тестов сервисов
// (аналог мока PrismaService в NestJS-спеках).
package storetest

import (
	"context"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// Fake — реализация store.Store, где каждую операцию можно подменить функцией.
// Не подставленные операции возвращают нулевые значения (поиск — pgx.ErrNoRows).
type Fake struct {
	FindUserByEmailFn        func(ctx context.Context, email string) (*model.User, error)
	FindUserByIDFn           func(ctx context.Context, id int64) (*model.User, error)
	ListUsersFn              func(ctx context.Context) ([]model.User, error)
	UpdateUserPasswordHashFn func(ctx context.Context, id int64, hash string) error
	UpdateUserTimezoneFn     func(ctx context.Context, id int64, timezone string) error
	UpdateUserBlockedAtFn    func(ctx context.Context, id int64, blockedAt *time.Time) error
	UpdateUserAdminFn        func(ctx context.Context, id int64, isAdmin bool) error
	DeleteUserFn             func(ctx context.Context, id int64) error

	CreateSessionFn              func(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error
	FindSessionByTokenHashFn     func(ctx context.Context, tokenHash string) (*model.Session, error)
	UpdateSessionFn              func(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error
	DeleteSessionByTokenHashFn   func(ctx context.Context, tokenHash string) error
	DeleteSessionsByUserFn       func(ctx context.Context, userID int64) error
	DeleteSessionsByUserExceptFn func(ctx context.Context, userID int64, tokenHash string) error
	DeleteExpiredSessionsFn      func(ctx context.Context, now time.Time) error

	CreateUserWithDefaultsFn func(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error)
}

func (f *Fake) FindUserByEmail(ctx context.Context, email string) (*model.User, error) {
	if f.FindUserByEmailFn != nil {
		return f.FindUserByEmailFn(ctx, email)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) FindUserByID(ctx context.Context, id int64) (*model.User, error) {
	if f.FindUserByIDFn != nil {
		return f.FindUserByIDFn(ctx, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) ListUsers(ctx context.Context) ([]model.User, error) {
	if f.ListUsersFn != nil {
		return f.ListUsersFn(ctx)
	}
	return nil, nil
}

func (f *Fake) UpdateUserPasswordHash(ctx context.Context, id int64, hash string) error {
	if f.UpdateUserPasswordHashFn != nil {
		return f.UpdateUserPasswordHashFn(ctx, id, hash)
	}
	return nil
}

func (f *Fake) UpdateUserTimezone(ctx context.Context, id int64, timezone string) error {
	if f.UpdateUserTimezoneFn != nil {
		return f.UpdateUserTimezoneFn(ctx, id, timezone)
	}
	return nil
}

func (f *Fake) UpdateUserBlockedAt(ctx context.Context, id int64, blockedAt *time.Time) error {
	if f.UpdateUserBlockedAtFn != nil {
		return f.UpdateUserBlockedAtFn(ctx, id, blockedAt)
	}
	return nil
}

func (f *Fake) UpdateUserAdmin(ctx context.Context, id int64, isAdmin bool) error {
	if f.UpdateUserAdminFn != nil {
		return f.UpdateUserAdminFn(ctx, id, isAdmin)
	}
	return nil
}

func (f *Fake) DeleteUser(ctx context.Context, id int64) error {
	if f.DeleteUserFn != nil {
		return f.DeleteUserFn(ctx, id)
	}
	return nil
}

func (f *Fake) CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error {
	if f.CreateSessionFn != nil {
		return f.CreateSessionFn(ctx, userID, tokenHash, expiresAt, userAgent)
	}
	return nil
}

func (f *Fake) FindSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error) {
	if f.FindSessionByTokenHashFn != nil {
		return f.FindSessionByTokenHashFn(ctx, tokenHash)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) UpdateSession(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error {
	if f.UpdateSessionFn != nil {
		return f.UpdateSessionFn(ctx, id, lastSeenAt, expiresAt)
	}
	return nil
}

func (f *Fake) DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error {
	if f.DeleteSessionByTokenHashFn != nil {
		return f.DeleteSessionByTokenHashFn(ctx, tokenHash)
	}
	return nil
}

func (f *Fake) DeleteSessionsByUser(ctx context.Context, userID int64) error {
	if f.DeleteSessionsByUserFn != nil {
		return f.DeleteSessionsByUserFn(ctx, userID)
	}
	return nil
}

func (f *Fake) DeleteSessionsByUserExcept(ctx context.Context, userID int64, tokenHash string) error {
	if f.DeleteSessionsByUserExceptFn != nil {
		return f.DeleteSessionsByUserExceptFn(ctx, userID, tokenHash)
	}
	return nil
}

func (f *Fake) DeleteExpiredSessions(ctx context.Context, now time.Time) error {
	if f.DeleteExpiredSessionsFn != nil {
		return f.DeleteExpiredSessionsFn(ctx, now)
	}
	return nil
}

func (f *Fake) CreateUserWithDefaults(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error) {
	if f.CreateUserWithDefaultsFn != nil {
		return f.CreateUserWithDefaultsFn(ctx, email, passwordHash, timezone, distractionBudget)
	}
	return nil, nil
}

var _ store.Store = (*Fake)(nil)
