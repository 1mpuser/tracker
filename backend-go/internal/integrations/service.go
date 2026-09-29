// Package integrations — перенос IntegrationsService из backend/src/integrations:
// пер-пользовательские учётные данные iCloud и настройки Session в Settings.
// Пароль приложения всегда зашифрован (enc:v1:...); ни один метод не отдаёт
// его наружу. Нет env-фоллбэков: всё из Settings пользователя.
package integrations

import (
	"context"
	"errors"
	"log"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/caldav"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// CalDAVClient — операции CalDAV, нужные интеграциям (проверка живой учётки,
// поиск списка/календаря, сброс кэша).
type CalDAVClient interface {
	ClientFor(ctx context.Context, userID int64, creds caldav.Credentials) (*caldav.Client, error)
	FindCalendar(ctx context.Context, userID int64, creds caldav.Credentials, name string) (*caldav.Calendar, error)
	Forget(userID int64)
}

// ICloudView — ответ GET /integrations/icloud.
type ICloudView struct {
	Configured    bool    `json:"configured"`
	AppleID       *string `json:"appleId"`
	RemindersList string  `json:"remindersList"`
}

// SessionView — ответ GET /integrations/session.
type SessionView struct {
	Configured       bool    `json:"configured"`
	CalendarName     *string `json:"calendarName"`
	MinMinutes       int     `json:"minMinutes"`
	ICloudConfigured bool    `json:"icloudConfigured"`
}

const defaultRemindersList = "GTD"
const defaultSessionMinMinutes = 20

// Service — интеграции пользователя.
type Service struct {
	store   store.Store
	caldav  CalDAVClient
	encKey  string
	encrypt func(plain, key string) (string, error)
	decrypt func(stored, key string) (string, error)
}

// NewService создаёт сервис. encrypt/decrypt — crypto.EncryptSecret/DecryptSecret
// или их тестовые двойники.
func NewService(st store.Store, cal CalDAVClient, encKey string, encrypt, decrypt func(string, string) (string, error)) *Service {
	return &Service{store: st, caldav: cal, encKey: encKey, encrypt: encrypt, decrypt: decrypt}
}

func (s *Service) settingsRow(ctx context.Context, userID int64) (*model.Settings, error) {
	row, err := s.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s.store.CreateSettings(ctx, userID)
		}
		return nil, err
	}
	return row, nil
}

// ICloudCredentials возвращает расшифрованные учётные данные для внутреннего
// использования. Неудачная расшифровка (сменённый APP_ENCRYPTION_KEY) →
// нил, интеграция считается ненастроенной.
func (s *Service) ICloudCredentials(ctx context.Context, userID int64) (*caldav.Credentials, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return nil, err
	}
	if row.IcloudAppleID == nil || *row.IcloudAppleID == "" ||
		row.IcloudAppPasswordEnc == nil || *row.IcloudAppPasswordEnc == "" {
		return nil, nil
	}
	pw, err := s.decrypt(*row.IcloudAppPasswordEnc, s.encKey)
	if err != nil {
		// Без секрета в логе: только факт. Следующие запросы не роняются.
		log.Printf("iCloud-пароль пользователя #%d не расшифровывается, интеграция считается ненастроенной", userID)
		return nil, nil
	}
	return &caldav.Credentials{Username: *row.IcloudAppleID, Password: pw}, nil
}

// RemindersList — имя списка напоминаний (по умолчанию «GTD»).
func (s *Service) RemindersList(ctx context.Context, userID int64) (string, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return "", err
	}
	if row.IcloudRemindersList == "" {
		return defaultRemindersList, nil
	}
	return row.IcloudRemindersList, nil
}

// GetICloud — публичный образ iCloud-интеграции.
func (s *Service) GetICloud(ctx context.Context, userID int64) (ICloudView, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return ICloudView{}, err
	}
	creds, err := s.ICloudCredentials(ctx, userID)
	if err != nil {
		return ICloudView{}, err
	}
	listName := row.IcloudRemindersList
	if listName == "" {
		listName = defaultRemindersList
	}
	var appleID *string
	if creds != nil {
		appleID = &creds.Username
	}
	return ICloudView{Configured: creds != nil, AppleID: appleID, RemindersList: listName}, nil
}

// SetICloud проверяет учётку живым CalDAV-запросом, сохраняет и шифрует пароль.
func (s *Service) SetICloud(ctx context.Context, userID int64, appleID, appPassword, remindersList string) (ICloudView, error) {
	appleID = trim(appleID)
	listName := trim(remindersList)
	if listName == "" {
		listName = defaultRemindersList
	}
	if _, err := s.settingsRow(ctx, userID); err != nil {
		return ICloudView{}, err
	}
	creds := caldav.Credentials{Username: appleID, Password: appPassword}
	if _, err := s.caldav.ClientFor(ctx, userID, creds); err != nil {
		return ICloudView{}, apperr.BadRequest("Не удалось войти в iCloud: проверьте Apple ID и пароль приложения")
	}
	if _, err := s.caldav.FindCalendar(ctx, userID, creds, listName); err != nil {
		if errors.Is(err, caldav.ErrCalendarNotFound) {
			return ICloudView{}, apperr.BadRequest("В iCloud нет списка «" + listName + "» — создайте его в «Напоминаниях» или укажите другое имя")
		}
		return ICloudView{}, err
	}
	enc, err := s.encrypt(appPassword, s.encKey)
	if err != nil {
		return ICloudView{}, err
	}
	if _, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{
		IcloudAppleID:        &appleID,
		IcloudAppPasswordEnc: &enc,
		IcloudRemindersList:  &listName,
	}); err != nil {
		return ICloudView{}, err
	}
	s.caldav.Forget(userID)
	return s.GetICloud(ctx, userID)
}

// ClearICloud глушит и Session: без iCloud-учётки он не работает. Напоминания
// в iCloud НЕ удаляются.
func (s *Service) ClearICloud(ctx context.Context, userID int64) (ICloudView, error) {
	if _, err := s.settingsRow(ctx, userID); err != nil {
		return ICloudView{}, err
	}
	if _, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{
		IcloudAppleID:        ptr(""),
		IcloudAppPasswordEnc: ptr(""),
		SessionCalendarName:  ptr(""),
	}); err != nil {
		return ICloudView{}, err
	}
	s.caldav.Forget(userID)
	return s.GetICloud(ctx, userID)
}

// GetSession — публичный образ Session-интеграции.
func (s *Service) GetSession(ctx context.Context, userID int64) (SessionView, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return SessionView{}, err
	}
	creds, err := s.ICloudCredentials(ctx, userID)
	if err != nil {
		return SessionView{}, err
	}
	calendarName := row.SessionCalendarName
	if calendarName != nil && *calendarName == "" {
		// после ClearSession/clearICloud мы пишем пустую строку, а не NULL —
		// наружу отдаём null, как это делает Node.
		calendarName = nil
	}
	configured := creds != nil && calendarName != nil
	return SessionView{
		Configured:       configured,
		CalendarName:     calendarName,
		MinMinutes:       row.SessionMinMinutes,
		ICloudConfigured: creds != nil,
	}, nil
}

// SetSession проверяет календарь в iCloud и сохраняет имя/мин.
func (s *Service) SetSession(ctx context.Context, userID int64, calendarName string, minMinutes *int) (SessionView, error) {
	creds, err := s.ICloudCredentials(ctx, userID)
	if err != nil {
		return SessionView{}, err
	}
	if creds == nil {
		return SessionView{}, apperr.Conflict("Сначала подключите iCloud во вкладке «iCloud»")
	}
	calendarName = trim(calendarName)
	if _, err := s.caldav.FindCalendar(ctx, userID, *creds, calendarName); err != nil {
		if errors.Is(err, caldav.ErrCalendarNotFound) {
			return SessionView{}, apperr.BadRequest("Календарь «" + calendarName + "» не найден в iCloud")
		}
		return SessionView{}, err
	}
	if err := s.ensureRow(ctx, userID); err != nil {
		return SessionView{}, err
	}
	upd := store.SettingsUpdate{SessionCalendarName: &calendarName}
	if minMinutes != nil && *minMinutes > 0 {
		mm := *minMinutes
		upd.SessionMinMinutes = &mm
	}
	if _, err := s.store.UpdateSettings(ctx, userID, upd); err != nil {
		return SessionView{}, err
	}
	return s.GetSession(ctx, userID)
}

// ClearSession убирает имя календаря Session.
func (s *Service) ClearSession(ctx context.Context, userID int64) (SessionView, error) {
	if err := s.ensureRow(ctx, userID); err != nil {
		return SessionView{}, err
	}
	if _, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{SessionCalendarName: ptr("")}); err != nil {
		return SessionView{}, err
	}
	return s.GetSession(ctx, userID)
}

// ICloudConfigured — настроена ли iCloud-интеграция (для флага GET /settings).
func (s *Service) ICloudConfigured(ctx context.Context, userID int64) (bool, error) {
	creds, err := s.ICloudCredentials(ctx, userID)
	if err != nil {
		return false, err
	}
	return creds != nil, nil
}

// SessionSyncEnabled — включён ли Session (имя календаря + учётка iCloud).
func (s *Service) SessionSyncEnabled(ctx context.Context, userID int64) (bool, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return false, err
	}
	if row.SessionCalendarName == nil || *row.SessionCalendarName == "" {
		return false, nil
	}
	return s.ICloudConfigured(ctx, userID)
}

// SessionCalendarName — имя календаря Session (nil — не настроен).
func (s *Service) SessionCalendarName(ctx context.Context, userID int64) (*string, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return nil, err
	}
	return row.SessionCalendarName, nil
}

// SessionMinMinutes — минимальная длительность сессии в минутах.
func (s *Service) SessionMinMinutes(ctx context.Context, userID int64) (int, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return 0, err
	}
	return row.SessionMinMinutes, nil
}

func (s *Service) ensureRow(ctx context.Context, userID int64) error {
	_, err := s.settingsRow(ctx, userID)
	return err
}

func trim(v string) string {
	return strings.TrimSpace(v)
}

func ptr(v string) *string { return &v }
