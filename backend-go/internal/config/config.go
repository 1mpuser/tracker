package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// AuthConfig — настройки аутентификации/сессий, аналог AuthConfig из
// backend/src/auth/auth.config.ts (cookieSecure, sessionDays).
type AuthConfig struct {
	CookieSecure bool
	SessionDays  int
}

// SessionLifetime возвращает срок жизни сессии.
func (a AuthConfig) SessionLifetime() time.Duration {
	return time.Duration(a.SessionDays) * 24 * time.Hour
}

// Config — окружение HTTP-сервера и соединения с БД.
type Config struct {
	// DATABASE_URL
	DatabaseURL string
	// PORT (http.Server Addr), по умолчанию 3001
	Addr string
	// CORS_ORIGINS через запятую
	CORSOrigins []string
	// DISTRACTION_BUDGET_DEFAULT — бюджет по умолчанию для новых учёток
	DistractionBudgetDefault int
	// NODE_ENV — 'production' включает обязательность APP_ENCRYPTION_KEY
	IsProduction bool

	Auth AuthConfig
}

// Load собирает конфигурацию из окружения. Повторяет поведение
// backend/src/bootstrap.ts + auth.config.ts:
//   - COOKIE_SECURE: явное значение, иначе true в production, false иначе;
//   - SESSION_DAYS: по умолчанию 30;
//   - в production без APP_ENCRYPTION_KEY — ошибка при старте.
func Load() (Config, error) {
	isProd := os.Getenv("NODE_ENV") == "production"

	if isProd && os.Getenv("APP_ENCRYPTION_KEY") == "" {
		return Config{}, fmt.Errorf("нет обязательных переменных окружения в production: APP_ENCRYPTION_KEY")
	}

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "3001"
	}
	if !strings.HasPrefix(addr, ":") {
		addr = ":" + addr
	}

	sessionDays := 30
	if v := os.Getenv("SESSION_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			sessionDays = n
		}
	}

	cookieSecure := isProd
	if v, ok := os.LookupEnv("COOKIE_SECURE"); ok {
		cookieSecure = v == "true"
	}

	budget := 60
	if v := os.Getenv("DISTRACTION_BUDGET_DEFAULT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			budget = n
		}
	}

	origins := strings.Split(os.Getenv("CORS_ORIGINS"), ",")
	if len(origins) == 1 && origins[0] == "" {
		origins = []string{"http://localhost:4887", "https://tracker.performance:4888"}
	}

	return Config{
		DatabaseURL:              os.Getenv("DATABASE_URL"),
		Addr:                     addr,
		CORSOrigins:              origins,
		DistractionBudgetDefault: budget,
		IsProduction:             isProd,
		Auth: AuthConfig{
			CookieSecure: cookieSecure,
			SessionDays:  sessionDays,
		},
	}, nil
}
