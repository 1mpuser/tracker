package server

import (
	"net/http"

	"github.com/1mpuser/tracker/backend-go/internal/admin"
	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/icloud"
	"github.com/1mpuser/tracker/backend-go/internal/integrations"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/routines"
	"github.com/1mpuser/tracker/backend-go/internal/settings"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/tasktemplates"
	"github.com/1mpuser/tracker/backend-go/internal/telegram"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

// Server собирает HTTP-роутер поверх chi.
type Server struct {
	cfg          config.Config
	auth         *auth.Service
	admin        *admin.Service
	categories   *categories.Service
	days         *days.Service
	routines     *routines.Service
	taskTemplate *tasktemplates.Service
	gtd          *gtd.Service
	stats        *stats.Service
	settings     *settings.Service
	sessionSync  SessionSyncer
	weekDeliver  WeekDeliverer
	telegram     *telegram.ConfigService
	integrations *integrations.Service
	icloud       *icloud.Service
	loginLimiter *loginLimiter
}

func NewServer(
	cfg config.Config,
	authSvc *auth.Service,
	adminSvc *admin.Service,
	cats *categories.Service,
	daysSvc *days.Service,
	routinesSvc *routines.Service,
	ttSvc *tasktemplates.Service,
	gtdSvc *gtd.Service,
	statsSvc *stats.Service,
	settingsSvc *settings.Service,
	sessionSync SessionSyncer,
	weekDeliver WeekDeliverer,
	telegramConfig *telegram.ConfigService,
	integrationsSvc *integrations.Service,
	icloudSvc *icloud.Service,
) *Server {
	return &Server{
		cfg:          cfg,
		auth:         authSvc,
		admin:        adminSvc,
		categories:   cats,
		days:         daysSvc,
		routines:     routinesSvc,
		taskTemplate: ttSvc,
		gtd:          gtdSvc,
		stats:        statsSvc,
		settings:     settingsSvc,
		sessionSync:  sessionSync,
		weekDeliver:  weekDeliver,
		telegram:     telegramConfig,
		integrations: integrationsSvc,
		icloud:       icloudSvc,
		loginLimiter: newLoginLimiter(loginLimitMax, loginLimitWindow),
	}
}

// Handler возвращает готовый http.Handler.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()

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

		r.Get("/categories", s.handleCategoriesList)
		r.Post("/categories", s.handleCategoriesCreate)
		r.Patch("/categories/{key}", s.handleCategoriesUpdate)

		r.Get("/days/{date}", s.handleDaysGet)
		r.Patch("/days/{date}/categories/{key}", s.handleDaysSetCategoryStatus)
		r.Patch("/days/{date}/distraction", s.handleDaysUpdateDistraction)
		r.Patch("/days/{date}/pomodoros", s.handleDaysUpdatePomodoros)
		r.Post("/days/{date}/pomodoros/sync-session", s.handleDaysSyncSession)
		r.Post("/days/{date}/weekly-summary", s.handleDaysWeeklySummary)
		r.Patch("/days/{date}", s.handleDaysUpdate)
		r.Get("/history", s.handleHistory)

		r.Get("/routines/history", s.handleRoutinesHistory)
		r.Get("/routines", s.handleRoutinesWeek)
		r.Post("/routines", s.handleRoutinesCreate)
		r.Patch("/routines/{id}", s.handleRoutinesUpdate)
		r.Delete("/routines/{id}", s.handleRoutinesArchive)
		r.Post("/routines/{id}/log", s.handleRoutinesSetLog)
		r.Delete("/routines/{id}/log/{date}", s.handleRoutinesRemoveLog)

		r.Get("/task-templates", s.handleTaskTemplatesList)
		r.Post("/task-templates", s.handleTaskTemplatesCreate)
		r.Patch("/task-templates/{id}", s.handleTaskTemplatesUpdate)
		r.Delete("/task-templates/{id}", s.handleTaskTemplatesRemove)

		r.Get("/gtd/items", s.handleGtdItems)
		r.Post("/gtd/items", s.handleGtdCreate)
		r.Post("/gtd/items/today", s.handleGtdCreateForDate)
		r.Patch("/gtd/items/{id}", s.handleGtdUpdate)
		r.Delete("/gtd/items/{id}", s.handleGtdRemove)

		r.Get("/stats/categories", s.handleStatsCategories)
		r.Get("/stats/distraction", s.handleStatsDistraction)
		r.Get("/stats/distraction-daily", s.handleStatsDistractionDaily)
		r.Get("/stats/week", s.handleStatsWeek)

		r.Get("/settings", s.handleSettingsGet)
		r.Patch("/settings", s.handleSettingsUpdate)

		// Telegram-бот и чаты.
		r.Get("/telegram/bot", s.handleTelegramBotGet)
		r.Put("/telegram/bot", s.handleTelegramBotSet)
		r.Delete("/telegram/bot", s.handleTelegramBotClear)
		r.Get("/telegram/chats", s.handleTelegramChatsList)
		r.Post("/telegram/chats", s.handleTelegramChatsCreate)
		r.Patch("/telegram/chats/{id}", s.handleTelegramChatsUpdate)
		r.Delete("/telegram/chats/{id}", s.handleTelegramChatsDelete)
		r.Post("/telegram/chats/{id}/test", s.handleTelegramChatsTest)
		r.Get("/telegram/discover", s.handleTelegramDiscover)

		// Интеграции (iCloud / Session).
		r.Get("/integrations/icloud", s.handleIntegrationsICloudGet)
		r.Put("/integrations/icloud", s.handleIntegrationsICloudSet)
		r.Delete("/integrations/icloud", s.handleIntegrationsICloudClear)
		r.Post("/integrations/icloud/resync", s.handleIntegrationsICloudResync)
		r.Get("/integrations/session", s.handleIntegrationsSessionGet)
		r.Put("/integrations/session", s.handleIntegrationsSessionSet)
		r.Delete("/integrations/session", s.handleIntegrationsSessionClear)
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
