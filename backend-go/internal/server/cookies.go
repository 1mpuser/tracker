package server

import (
	"net/http"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/config"
)

// sessionCookieOptions — общие опции cookie сессии, единые для выдачи при входе
// (login) и перевыдачи при продлении срока (SessionGuard) — как в
// backend/src/auth/auth.config.ts.
func sessionCookieOptions(cfg config.AuthConfig) *http.Cookie {
	return &http.Cookie{
		Name:     "sid",
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   cfg.SessionDays * 86_400,
		Expires:  time.Now().Add(time.Duration(cfg.SessionDays) * 24 * time.Hour),
	}
}

func setSessionCookie(w http.ResponseWriter, cfg config.AuthConfig, token string) {
	c := sessionCookieOptions(cfg)
	c.Value = token
	http.SetCookie(w, c)
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "sid",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
	})
}
