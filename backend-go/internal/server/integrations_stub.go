package server

import (
	"context"

	"github.com/1mpuser/tracker/backend-go/internal/model"
)

// SessionSyncer — синхронизация помидоров с календарём Session (контроллер
// days-модуля). Реализация интеграции — в следующих промптах; пока в prod
// подключён NotConfiguredSession, дающий 409 «не настроено».
type SessionSyncer interface {
	IsEnabledFor(ctx context.Context, user model.AuthUser) bool
	SyncDate(ctx context.Context, user model.AuthUser, date string) (*int, error)
}

// WeekDeliverer — проверка настроенности Telegram-рассылки недельной сводки.
type WeekDeliverer interface {
	IsConfigured(ctx context.Context, userID int64, kind string) bool
}

// NotConfiguredSession — интеграция Session не настроена всегда.
type NotConfiguredSession struct{}

func (NotConfiguredSession) IsEnabledFor(ctx context.Context, user model.AuthUser) bool {
	return false
}
func (NotConfiguredSession) SyncDate(ctx context.Context, user model.AuthUser, date string) (*int, error) {
	return nil, nil
}

// NotConfiguredTelegram — Telegram-рассылка не настроена всегда.
type NotConfiguredTelegram struct{}

func (NotConfiguredTelegram) IsConfigured(ctx context.Context, userID int64, kind string) bool {
	return false
}
