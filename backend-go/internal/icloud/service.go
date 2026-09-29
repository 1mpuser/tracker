package icloud

import (
	"context"
	"log"

	"github.com/1mpuser/tracker/backend-go/internal/caldav"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
)

// Config — источник учётных данных и настроек iCloud у IntegrationsService.
// Вынесен интерфейсом, чтобы сервис тестировался без реальной интеграции.
type Config interface {
	ICloudCredentials(ctx context.Context, userID int64) (*caldav.Credentials, error)
	RemindersList(ctx context.Context, userID int64) (string, error)
}

// Service — напоминания iCloud (CalDAV Reminders). Реализует gtd.ICloudProvider.
type Service struct {
	caldav *caldav.Pool
	config Config
}

// NewService создаёт сервис напоминаний.
func NewService(pool *caldav.Pool, config Config) *Service {
	return &Service{caldav: pool, config: config}
}

func (s *Service) upsert(ctx context.Context, user model.AuthUser, filename, ics string) {
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return
	}
	listName, err := s.config.RemindersList(ctx, user.ID)
	if err != nil || listName == "" {
		return
	}
	calendar, err := s.caldav.FindCalendar(ctx, user.ID, *creds, listName)
	if err != nil {
		if err != caldav.ErrCalendarNotFound {
			log.Printf("iCloud upsert(%s): найти календарь: %v", filename, err)
		}
		return
	}
	client, err := s.caldav.ClientFor(ctx, user.ID, *creds)
	if err != nil {
		log.Printf("iCloud upsert(%s): login: %v", filename, err)
		return
	}
	// Как в Node: delete-then-create, чтобы при повторном синке не копились
	// дубликаты. Ошибку удаления игнорируем (объекта может ещё не быть).
	_ = client.DeleteObject(ctx, calendar.URL, filename)
	if err := client.PutObject(ctx, calendar.URL, filename, ics); err != nil {
		log.Printf("iCloud upsert(%s) failed: %v", filename, err)
	}
}

// SyncReminder создаёт/обновляет напоминание для задачи.
func (s *Service) SyncReminder(ctx context.Context, user model.AuthUser, item gtd.ItemView, due gtd.EffectiveDue) error {
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return nil
	}
	uid := ReminderUID(item.ID)
	ics := BuildReminderICS(uid, "GTD: "+item.Title, &due, item.Priority, false)
	s.upsert(ctx, user, uid+".ics", ics)
	return nil
}

// CompleteReminder помечает напоминание выполненным.
func (s *Service) CompleteReminder(ctx context.Context, user model.AuthUser, id int64, item gtd.ItemView, due gtd.EffectiveDue) error {
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return nil
	}
	uid := ReminderUID(id)
	ics := BuildReminderICS(uid, "GTD: "+item.Title, &due, item.Priority, true)
	s.upsert(ctx, user, uid+".ics", ics)
	return nil
}

// RemoveReminder удаляет напоминание.
func (s *Service) RemoveReminder(ctx context.Context, user model.AuthUser, id int64) error {
	creds, err := s.config.ICloudCredentials(ctx, user.ID)
	if err != nil || creds == nil {
		return nil
	}
	listName, err := s.config.RemindersList(ctx, user.ID)
	if err != nil || listName == "" {
		return nil
	}
	calendar, err := s.caldav.FindCalendar(ctx, user.ID, *creds, listName)
	if err != nil {
		return nil
	}
	client, err := s.caldav.ClientFor(ctx, user.ID, *creds)
	if err != nil {
		return nil
	}
	if err := client.DeleteObject(ctx, calendar.URL, ReminderUID(id)+".ics"); err != nil {
		log.Printf("iCloud removeReminder(%d) failed: %v", id, err)
	}
	return nil
}

// SyncAllOnStartup синхронизирует напоминания по всем задачам на старте сервиса.
func (s *Service) SyncAllOnStartup(ctx context.Context, user model.AuthUser, items []gtd.ItemView) {
	for _, item := range items {
		due := EffectiveDueOf(item)
		if due != nil {
			_ = s.SyncReminder(ctx, user, item, *due)
		}
	}
}

// EffectiveDueOf — как effectiveDue в icloud.helpers.ts (нужен в integrations
// и стартовом синке, поэтому живёт здесь).
func EffectiveDueOf(item gtd.ItemView) *gtd.EffectiveDue {
	if item.Status == "archived" {
		return nil
	}
	if item.DueDate != nil {
		return &gtd.EffectiveDue{Date: *item.DueDate}
	}
	if item.Status == "calendar" && item.ScheduledDate != nil {
		return &gtd.EffectiveDue{Date: *item.ScheduledDate, Time: item.ScheduledTime}
	}
	return nil
}

var _ gtd.ICloudProvider = (*Service)(nil)
