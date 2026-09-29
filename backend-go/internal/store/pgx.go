package store

import (
	"context"
	"fmt"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PGStore struct {
	pool *pgxpool.Pool
}

func NewPGStore(pool *pgxpool.Pool) *PGStore {
	return &PGStore{pool: pool}
}

const userCols = `"id", "email", "passwordHash", "timezone", "isAdmin", "blockedAt", "createdAt"`

func scanUser(row pgx.Row) (*model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Timezone, &u.IsAdmin, &u.BlockedAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *PGStore) FindUserByEmail(ctx context.Context, email string) (*model.User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM "User" WHERE "email" = $1`, email))
}

func (s *PGStore) FindUserByID(ctx context.Context, id int64) (*model.User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM "User" WHERE "id" = $1`, id))
}

func (s *PGStore) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+userCols+` FROM "User" ORDER BY "createdAt" ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Timezone, &u.IsAdmin, &u.BlockedAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *PGStore) UpdateUserPasswordHash(ctx context.Context, id int64, hash string) error {
	_, err := s.pool.Exec(ctx, `UPDATE "User" SET "passwordHash" = $1 WHERE "id" = $2`, hash, id)
	return err
}

func (s *PGStore) UpdateUserTimezone(ctx context.Context, id int64, timezone string) error {
	_, err := s.pool.Exec(ctx, `UPDATE "User" SET "timezone" = $1 WHERE "id" = $2`, timezone, id)
	return err
}

func (s *PGStore) UpdateUserBlockedAt(ctx context.Context, id int64, blockedAt *time.Time) error {
	_, err := s.pool.Exec(ctx, `UPDATE "User" SET "blockedAt" = $1 WHERE "id" = $2`, blockedAt, id)
	return err
}

func (s *PGStore) UpdateUserAdmin(ctx context.Context, id int64, isAdmin bool) error {
	_, err := s.pool.Exec(ctx, `UPDATE "User" SET "isAdmin" = $1 WHERE "id" = $2`, isAdmin, id)
	return err
}

func (s *PGStore) DeleteUser(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "User" WHERE "id" = $1`, id)
	return err
}

func (s *PGStore) CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO "Session" ("userId", "tokenHash", "expiresAt", "userAgent") VALUES ($1, $2, $3, $4)`,
		userID, tokenHash, expiresAt, userAgent)
	return err
}

func scanSession(row pgx.Row) (*model.Session, error) {
	var s model.Session
	err := row.Scan(&s.ID, &s.UserID, &s.TokenHash, &s.ExpiresAt, &s.LastSeenAt, &s.UserAgent)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *PGStore) FindSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error) {
	return scanSession(s.pool.QueryRow(ctx,
		`SELECT "id", "userId", "tokenHash", "expiresAt", "lastSeenAt", "userAgent" FROM "Session" WHERE "tokenHash" = $1`,
		tokenHash))
}

func (s *PGStore) UpdateSession(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE "Session" SET "lastSeenAt" = $1, "expiresAt" = $2 WHERE "id" = $3`,
		lastSeenAt, expiresAt, id)
	return err
}

func (s *PGStore) DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "Session" WHERE "tokenHash" = $1`, tokenHash)
	return err
}

func (s *PGStore) DeleteSessionsByUser(ctx context.Context, userID int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "Session" WHERE "userId" = $1`, userID)
	return err
}

func (s *PGStore) DeleteSessionsByUserExcept(ctx context.Context, userID int64, tokenHash string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "Session" WHERE "userId" = $1 AND "tokenHash" <> $2`, userID, tokenHash)
	return err
}

func (s *PGStore) DeleteExpiredSessions(ctx context.Context, now time.Time) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "Session" WHERE "expiresAt" < $1`, now)
	return err
}

// CreateUserWithDefaults создаёт учётку одной транзакцией: пользователь +
// дефолтные настройки + дефолтные сферы. Не может остаться пользователь без
// настроек или сфер, а занятая почта (unique) откатывает создание целиком.
func (s *PGStore) CreateUserWithDefaults(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var u model.User
	err = tx.QueryRow(ctx,
		`INSERT INTO "User" ("email", "passwordHash", "timezone") VALUES ($1, $2, $3)
		 RETURNING "id", "email", "passwordHash", "timezone", "isAdmin", "blockedAt", "createdAt"`,
		email, passwordHash, timezone,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Timezone, &u.IsAdmin, &u.BlockedAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO "Settings" ("userId", "distractionBudget") VALUES ($1, $2)`,
		u.ID, distractionBudget)
	if err != nil {
		return nil, fmt.Errorf("create settings: %w", err)
	}

	for _, c := range defaultCategories {
		_, err = tx.Exec(ctx,
			`INSERT INTO "Category" ("key", "label", "order", "userId") VALUES ($1, $2, $3, $4)`,
			c.Key, c.Label, c.Order, u.ID)
		if err != nil {
			return nil, fmt.Errorf("create category %q: %w", c.Key, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &u, nil
}

type defaultCategory struct {
	Key   string
	Label string
	Order int
}

// Дефолтные сферы новой учётки — ровно те же, что DEFAULT_CATEGORIES в
// backend/src/auth/default-categories.ts.
var defaultCategories = []defaultCategory{
	{Key: "sport", Label: "Спорт", Order: 0},
	{Key: "personal", Label: "Общение / свидания", Order: 1},
	{Key: "family", Label: "Семья", Order: 2},
	{Key: "learning", Label: "Обучение", Order: 3},
	{Key: "work", Label: "Работа / финансы", Order: 4},
}

var _ Store = (*PGStore)(nil)
