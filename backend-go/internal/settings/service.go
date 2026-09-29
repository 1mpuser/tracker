// Package settings — перенос SettingsService из backend/src/settings.
package settings

import (
	"context"
	"errors"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// FlagsProvider — источник флагов интеграций per-user (аналог IntegrationsService),
// вынесен интерфейсом, чтобы настройки тестировались без CalDAV.
type FlagsProvider interface {
	ICloudConfigured(ctx context.Context, userID int64) (bool, error)
	SessionSyncEnabled(ctx context.Context, userID int64) (bool, error)
}

// View — ответ GET/PATCH /settings.
type View struct {
	ID                   int64  `json:"id"`
	UserID               int64  `json:"userId"`
	DistractionBudget    int    `json:"distractionBudget"`
	DistractionLabel     string `json:"distractionLabel"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
	IcloudEnabled        bool   `json:"icloudEnabled"`
	SessionSyncEnabled   bool   `json:"sessionSyncEnabled"`
	ObsidianEnabled      bool   `json:"obsidianEnabled"`
}

// Service — настройки пользователя.
type Service struct {
	store           store.Store
	flags           FlagsProvider
	obsidianEnabled bool
}

func NewService(st store.Store, flags FlagsProvider, obsidianEnabled bool) *Service {
	return &Service{store: st, flags: flags, obsidianEnabled: obsidianEnabled}
}

func (s *Service) row(ctx context.Context, userID int64) (*model.Settings, error) {
	row, err := s.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s.store.CreateSettings(ctx, userID)
		}
		return nil, err
	}
	return row, nil
}

func (s *Service) withFlags(ctx context.Context, userID int64, row *model.Settings) (View, error) {
	icloud, err := s.flags.ICloudConfigured(ctx, userID)
	if err != nil {
		return View{}, err
	}
	session, err := s.flags.SessionSyncEnabled(ctx, userID)
	if err != nil {
		return View{}, err
	}
	return View{
		ID:                   row.ID,
		UserID:               row.UserID,
		DistractionBudget:    row.DistractionBudget,
		DistractionLabel:     row.DistractionLabel,
		NotificationsEnabled: row.NotificationsEnabled,
		IcloudEnabled:        icloud,
		SessionSyncEnabled:   session,
		ObsidianEnabled:      s.obsidianEnabled,
	}, nil
}

// Get возвращает настройки, создавая строку с дефолтами при отсутствии.
func (s *Service) Get(ctx context.Context, userID int64) (View, error) {
	row, err := s.row(ctx, userID)
	if err != nil {
		return View{}, err
	}
	return s.withFlags(ctx, userID, row)
}

// UpdateDTO — частичное обновление настроек (PATCH /settings).
type UpdateDTO struct {
	DistractionBudget    *int
	DistractionLabel     *string
	NotificationsEnabled *bool
}

// Update обновляет настройки и возвращает их с флагами.
func (s *Service) Update(ctx context.Context, userID int64, dto UpdateDTO) (View, error) {
	if _, err := s.row(ctx, userID); err != nil {
		return View{}, err
	}
	updated, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{
		DistractionBudget:    dto.DistractionBudget,
		DistractionLabel:     dto.DistractionLabel,
		NotificationsEnabled: dto.NotificationsEnabled,
	})
	if err != nil {
		return View{}, err
	}
	return s.withFlags(ctx, userID, updated)
}

// Resolver — реальный FlagsProvider: читает Settings и пытается расшифровать
// секрет iCloud (как IntegrationsService). Неудачная расшифровка считается
// «интеграция не настроена».
type Resolver struct {
	store   store.Store
	encKey  string
	decrypt func(stored, key string) (string, error)
}

func NewResolver(st store.Store, encKey string, decrypt func(stored, key string) (string, error)) *Resolver {
	return &Resolver{store: st, encKey: encKey, decrypt: decrypt}
}

func (r *Resolver) ICloudConfigured(ctx context.Context, userID int64) (bool, error) {
	row, err := r.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if row.IcloudAppleID == nil || *row.IcloudAppleID == "" || row.IcloudAppPasswordEnc == nil || *row.IcloudAppPasswordEnc == "" {
		return false, nil
	}
	if r.decrypt == nil {
		return false, nil
	}
	if _, err := r.decrypt(*row.IcloudAppPasswordEnc, r.encKey); err != nil {
		return false, nil
	}
	return true, nil
}

func (r *Resolver) SessionSyncEnabled(ctx context.Context, userID int64) (bool, error) {
	row, err := r.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if row.SessionCalendarName == nil || *row.SessionCalendarName == "" {
		return false, nil
	}
	return r.ICloudConfigured(ctx, userID)
}
