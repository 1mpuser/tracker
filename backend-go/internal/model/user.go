package model

import "time"

// User соответствует строке таблицы "User". passwordHash / blockedAt — nullable.
type User struct {
	ID           int64
	Email        string
	PasswordHash *string
	Timezone     string
	IsAdmin      bool
	BlockedAt    *time.Time
	CreatedAt    time.Time
}

// Session соответствует строке таблицы "Session".
type Session struct {
	ID         int64
	UserID     int64
	TokenHash  string
	ExpiresAt  time.Time
	LastSeenAt time.Time
	UserAgent  *string
}

// AuthUser — публичный образ пользователя, который несут cookie-сессии и
// возвращают /auth-эндпоинты (аналог AuthUser из backend/src/auth/auth-user.ts).
type AuthUser struct {
	ID       int64
	Email    string
	Timezone string
}
