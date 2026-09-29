package server

import (
	"net/http"

	"github.com/1mpuser/tracker/backend-go/internal/admin"
	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Server собирает HTTP-роутер поверх chi.
type Server struct {
	cfg   config.Config
	auth  *auth.Service
	admin *admin.Service
}

func NewServer(cfg config.Config, authSvc *auth.Service, adminSvc *admin.Service) *Server {
	return &Server{cfg: cfg, auth: authSvc, admin: adminSvc}
}

// Handler возвращает готовый http.Handler.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(s.bodyLimit(2 << 20))

	// Публичные эндпоинты: @Public() в NestJS.
	r.Get("/health", s.handleHealth)
	r.Post("/auth/login", s.handleLogin)
	r.Post("/auth/logout", s.handleLogout)

	// Требуют валидную cookie-сессию.
	r.Group(func(r chi.Router) {
		r.Use(s.sessionGuard)

		r.Get("/auth/me", s.handleMe)
		r.Patch("/auth/me", s.handleUpdateMe)
		r.Post("/auth/password", s.handleChangePassword)
		r.Post("/auth/logout-all", s.handleLogoutAll)
	})

	// Требуют сессию + права администратора (не-админ → 404).
	r.Group(func(r chi.Router) {
		r.Use(s.sessionGuard)
		r.Use(s.adminGuard)

		r.Get("/admin/users", s.handleAdminList)
		r.Post("/admin/users", s.handleAdminCreate)
		r.Post("/admin/users/{id}/password", s.handleAdminChangePassword)
		r.Post("/admin/users/{id}/block", s.handleAdminBlock)
		r.Post("/admin/users/{id}/unblock", s.handleAdminUnblock)
		r.Delete("/admin/users/{id}", s.handleAdminRemove)
	})

	return r
}

// bodyLimit ограничивает размер тела запроса (аналог useBodyParser('json', {limit:'2mb'})).
func (s *Server) bodyLimit(max int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, max)
			next.ServeHTTP(w, r)
		})
	}
}

// withUser является обёрткой для группового middleware (SessionGuard).
func (s *Server) sessionGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("sid")
		if err != nil || cookie.Value == "" {
			writeError(w, apperr.Unauthorized("Unauthorized"))
			return
		}
		resolved, err := s.auth.ResolveSession(r.Context(), cookie.Value)
		if err != nil {
			writeError(w, err)
			return
		}
		if resolved == nil {
			writeError(w, apperr.Unauthorized("Unauthorized"))
			return
		}
		if resolved.RenewExpiresAt {
			setSessionCookie(w, s.cfg.Auth, cookie.Value)
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), resolved.User)))
	})
}

// adminGuard — поверх SessionGuard: права по базе, не-админ получает 404.
func (s *Server) adminGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := CurrentUser(r.Context())
		if !ok {
			writeError(w, apperr.Unauthorized("Unauthorized"))
			return
		}
		isAdmin, err := s.admin.IsAdmin(r.Context(), u.ID)
		if err != nil {
			writeError(w, err)
			return
		}
		if !isAdmin {
			writeError(w, apperr.NotFound("Not Found"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) (model.AuthUser, bool) {
	u, ok := CurrentUser(r.Context())
	if !ok {
		writeError(w, apperr.Unauthorized("Unauthorized"))
		return model.AuthUser{}, false
	}
	return u, true
}
