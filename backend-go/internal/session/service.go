package session

import (
	"context"
	"log"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/caldav"
	"github.com/1mpuser/tracker/backend-go/internal/model"
)

const defaultMinMinutes = 20

// Config — источник учётных данных и настроек Session у IntegrationsService.
type Config interface {
	ICloudCredentials(ctx context.Context, userID int64) (*caldav.Credentials, error)
	SessionCalendarName(ctx context.Context, userID int64) (*string, error)
	SessionMinMinutes(ctx context.Context, userID int64) (int, error)
}

// Service — подсчёт помидоров по CalDAV-календарю Session.
type Service struct {
	caldav *caldav.Pool
	config Config
}

// NewService создаёт сервис Session.
func NewService(pool *caldav.Pool, config Config) *Service {
	return &Service{caldav: pool, config: config}
}

// IsEnabledFor — есть ли и учётка iCloud, и имя календаря Session.
func (s *Service) IsEnabledFor(ctx context.Context, user model.AuthUser) bool {
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return false
	}
	name, err := s.config.SessionCalendarName(ctx, user.ID)
	if err != nil || name == nil || *name == "" {
		return false
	}
	return true
}

// SyncDate возвращает число помидоров в день: календарь ответил — число,
// не удалось прочитать — nil (вызывающий не трогает счётчик).
func (s *Service) SyncDate(ctx context.Context, user model.AuthUser, date string) (*int, error) {
	if !s.IsEnabledFor(ctx, user) {
		return nil, nil
	}
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return nil, nil
	}
	name, err := s.config.SessionCalendarName(ctx, user.ID)
	if err != nil || name == nil || *name == "" {
		return nil, nil
	}
	minMinutes, err := s.config.SessionMinMinutes(ctx, user.ID)
	if err != nil {
		return nil, nil
	}
	if minMinutes <= 0 {
		minMinutes = defaultMinMinutes
	}
	calendar, err := s.caldav.FindCalendar(ctx, user.ID, *creds, *name)
	if err != nil {
		return nil, nil
	}
	client, err := s.caldav.ClientFor(ctx, user.ID, *creds)
	if err != nil {
		return nil, nil
	}
	start, end, err := DayWindow(date, user.Timezone)
	if err != nil {
		return nil, nil
	}
	objects, err := client.FetchObjects(ctx, calendar.URL, start, end)
	if err != nil {
		log.Printf("Session syncDate(%s) failed: %v", date, err)
		return nil, nil
	}
	var events []CalendarEvent
	totalVevents := 0
	for _, o := range objects {
		totalVevents += strings.Count(o.Data, "BEGIN:VEVENT")
		events = append(events, ParseEvents(o.Data, user.Timezone)...)
	}
	skipped := totalVevents - len(events)
	if skipped > 0 {
		log.Printf("Session syncDate(%s): пропущено %d нераспознанных VEVENT", date, skipped)
	}
	count := CountPomodoros(events, start, end, minMinutes)
	return &count, nil
}
