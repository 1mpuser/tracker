package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

const SESSION_REFRESH_MS = 24 * 3600 * 1000

// Meta — контекст создания сессии (пока только userAgent).
type Meta struct {
	UserAgent *string
}

// SessionResult — результат входа (аналог SessionResult в auth.service.ts).
type SessionResult struct {
	SessionToken string
	User         model.AuthUser
}

// ResolvedSession — разрешённая сессия (аналог ResolvedSession).
type ResolvedSession struct {
	User           model.AuthUser
	RenewExpiresAt bool
}

// Service — аутентификация и серверные сессии.
type Service struct {
	store           store.Store
	sessionLifetime time.Duration
}

func NewService(st store.Store, cfg config.AuthConfig) *Service {
	return &Service{store: st, sessionLifetime: cfg.SessionLifetime()}
}

func sha256Hex(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}

func isExpired(expiresAt time.Time) bool {
	return expiresAt.Before(time.Now())
}

func (s *Service) normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// CleanupExpired удаляет просроченные сессии (вызывается на старте и по таймеру).
func (s *Service) CleanupExpired(ctx context.Context) error {
	return s.store.DeleteExpiredSessions(ctx, time.Now())
}

// Login — вход email+пароль. Одинаковое 401 независимо от причины, а
// verifyPassword выполняется всегда — по времени ответа нельзя понять,
// существует ли адрес (см. auth.service.ts).
func (s *Service) Login(ctx context.Context, email, password string, meta Meta) (*SessionResult, error) {
	normalized := s.normalizeEmail(email)
	user, err := s.store.FindUserByEmail(ctx, normalized)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	var storedHash string
	if user != nil && user.PasswordHash != nil {
		storedHash = *user.PasswordHash
	} else {
		storedHash = DUMMY_HASH
	}
	ok := VerifyPassword(password, storedHash)

	if user == nil || !ok || user.PasswordHash == nil {
		return nil, apperr.Unauthorized("Неверная почта или пароль")
	}
	if user.BlockedAt != nil {
		return nil, apperr.Unauthorized("Неверная почта или пароль")
	}

	if NeedsRehash(storedHash) {
		newHash, err := HashPassword(password)
		if err != nil {
			return nil, err
		}
		if err := s.store.UpdateUserPasswordHash(ctx, user.ID, newHash); err != nil {
			return nil, err
		}
	}

	return s.createSession(ctx, user, meta)
}

func (s *Service) createSession(ctx context.Context, user *model.User, meta Meta) (*SessionResult, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)

	if err := s.store.CreateSession(ctx, user.ID, sha256Hex(token), time.Now().Add(s.sessionLifetime), meta.UserAgent); err != nil {
		return nil, err
	}

	return &SessionResult{
		SessionToken: token,
		User:         model.AuthUser{ID: user.ID, Email: user.Email, Timezone: user.Timezone},
	}, nil
}

// ChangePassword меняет пароль и закрывает все сессии, кроме текущей.
func (s *Service) ChangePassword(ctx context.Context, userID int64, current, next, currentSessionToken string) error {
	user, err := s.store.FindUserByID(ctx, userID)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	storedHash := DUMMY_HASH
	if user != nil && user.PasswordHash != nil {
		storedHash = *user.PasswordHash
	}
	if user == nil || user.PasswordHash == nil || !VerifyPassword(current, storedHash) {
		return apperr.BadRequest("Текущий пароль неверный")
	}
	nextHash, err := HashPassword(next)
	if err != nil {
		return err
	}
	if err := s.store.UpdateUserPasswordHash(ctx, userID, nextHash); err != nil {
		return err
	}
	return s.store.DeleteSessionsByUserExcept(ctx, userID, sha256Hex(currentSessionToken))
}

// ResolveSession разрешает cookie-токен в пользователя, продлевая срок сессии
// не чаще раза в сутки (см. auth.service.ts).
func (s *Service) ResolveSession(ctx context.Context, sessionToken string) (*ResolvedSession, error) {
	session, err := s.store.FindSessionByTokenHash(ctx, sha256Hex(sessionToken))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if isExpired(session.ExpiresAt) {
		return nil, nil
	}

	renew := time.Now().UnixMilli()-session.LastSeenAt.UnixMilli() > SESSION_REFRESH_MS
	if renew {
		if err := s.store.UpdateSession(ctx, session.ID, time.Now(), time.Now().Add(s.sessionLifetime)); err != nil {
			return nil, err
		}
	}

	user, err := s.store.FindUserByID(ctx, session.UserID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if user.BlockedAt != nil {
		return nil, nil
	}
	return &ResolvedSession{
		User:           model.AuthUser{ID: user.ID, Email: user.Email, Timezone: user.Timezone},
		RenewExpiresAt: renew,
	}, nil
}

// Me — полная идентичность пользователя с признаком админа (GET /auth/me).
func (s *Service) Me(ctx context.Context, userID int64) (*model.User, error) {
	user, err := s.store.FindUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// Logout удаляет текущую сессию по токену.
func (s *Service) Logout(ctx context.Context, sessionToken string) error {
	return s.store.DeleteSessionByTokenHash(ctx, sha256Hex(sessionToken))
}

// LogoutAll закрывает все сессии пользователя.
func (s *Service) LogoutAll(ctx context.Context, userID int64) error {
	return s.store.DeleteSessionsByUser(ctx, userID)
}

// UpdateTimezone обновляет часовой пояс. Неизвестный пояс → 400.
func (s *Service) UpdateTimezone(ctx context.Context, userID int64, timezone string) (*model.AuthUser, error) {
	if _, err := time.LoadLocation(timezone); err != nil {
		return nil, apperr.BadRequest("Неизвестный часовой пояс")
	}
	if err := s.store.UpdateUserTimezone(ctx, userID, timezone); err != nil {
		return nil, err
	}
	user, err := s.store.FindUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &model.AuthUser{ID: user.ID, Email: user.Email, Timezone: user.Timezone}, nil
}
