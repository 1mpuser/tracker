// Package gtd — перенос GtdService из backend/src/gtd. Obsidian и iCloud
// вынесены интерфейсами: их реальная реализация — в следующих промптах,
// сейчас подключаются no-op стабы, чтобы поведение/контракт совпадали.
package gtd

import (
	"context"
	"errors"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/opt"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// EffectiveDue — эффективная дата задачи для напоминания (icloud.helpers).
type EffectiveDue struct {
	Date string
	Time *string
}

// ItemView — публичный образ GTD-задачи (getItems/update/getForDate).
type ItemView struct {
	ID                 int64   `json:"id"`
	Title              string  `json:"title"`
	Notes              *string `json:"notes"`
	Status             string  `json:"status"`
	ParentID           *int64  `json:"parentId"`
	ScheduledDate      *string `json:"scheduledDate"`
	ScheduledTime      *string `json:"scheduledTime"`
	PlannedDate        *string `json:"plannedDate"`
	DueDate            *string `json:"dueDate"`
	Priority           bool    `json:"priority"`
	WaitingFor         *string `json:"waitingFor"`
	AcceptanceCriteria *string `json:"acceptanceCriteria"`
	DiscussWith        *string `json:"discussWith"`
	Order              int     `json:"order"`
	CompletedAt        *string `json:"completedAt"`
	DecidedAt          *string `json:"decidedAt"`
	DeferCount         int     `json:"deferCount"`
}

// ItemRaw — полная строка GTD-задачи (как create/createForDate отдают в NestJS
// призму-сущность: даты — полные ISO, есть createdAt/updatedAt/userId).
type ItemRaw struct {
	ID                 int64   `json:"id"`
	Title              string  `json:"title"`
	Notes              *string `json:"notes"`
	Status             string  `json:"status"`
	ParentID           *int64  `json:"parentId"`
	ScheduledDate      *string `json:"scheduledDate"`
	ScheduledTime      *string `json:"scheduledTime"`
	PlannedDate        *string `json:"plannedDate"`
	DueDate            *string `json:"dueDate"`
	Priority           bool    `json:"priority"`
	WaitingFor         *string `json:"waitingFor"`
	AcceptanceCriteria *string `json:"acceptanceCriteria"`
	DiscussWith        *string `json:"discussWith"`
	Order              int     `json:"order"`
	UserID             int64   `json:"userId"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
	CompletedAt        *string `json:"completedAt"`
	DecidedAt          *string `json:"decidedAt"`
	DeferCount         int     `json:"deferCount"`
}

// RemoveResult — тело ответа DELETE /gtd/items/:id (аналог `{ id }`).
type RemoveResult struct {
	ID int64 `json:"id"`
}

// ObsidianProvider — side-effect записи/удаления Obsidian-заметки.
type ObsidianProvider interface {
	SyncNote(ctx context.Context, user model.AuthUser, item ItemView) error
	RemoveNote(ctx context.Context, user model.AuthUser, id int64) error
}

// ICloudProvider — side-effect напоминаний iCloud.
type ICloudProvider interface {
	SyncReminder(ctx context.Context, user model.AuthUser, item ItemView, due EffectiveDue) error
	CompleteReminder(ctx context.Context, user model.AuthUser, id int64, item ItemView, due EffectiveDue) error
	RemoveReminder(ctx context.Context, user model.AuthUser, id int64) error
}

// Service — GTD-задачи пользователя.
type Service struct {
	store    store.Store
	obsidian ObsidianProvider
	icloud   ICloudProvider
	now      func() time.Time
}

func NewService(st store.Store, obsidian ObsidianProvider, icloud ICloudProvider) *Service {
	return &Service{store: st, obsidian: obsidian, icloud: icloud, now: time.Now}
}

func formatShortDate(t *time.Time) *string {
	if t == nil {
		return nil
	}
	v := dateutil.FormatDate(*t)
	return &v
}

func isoTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	v := t.UTC().Format("2006-01-02T15:04:05.000Z")
	return &v
}

func (s *Service) toView(item *model.GtdItem) ItemView {
	return ItemView{
		ID:                 item.ID,
		Title:              item.Title,
		Notes:              item.Notes,
		Status:             item.Status,
		ParentID:           item.ParentID,
		ScheduledDate:      formatShortDate(item.ScheduledDate),
		ScheduledTime:      item.ScheduledTime,
		PlannedDate:        formatShortDate(item.PlannedDate),
		DueDate:            formatShortDate(item.DueDate),
		Priority:           item.Priority,
		WaitingFor:         item.WaitingFor,
		AcceptanceCriteria: item.AcceptanceCriteria,
		DiscussWith:        item.DiscussWith,
		Order:              item.Order,
		CompletedAt:        isoTime(item.CompletedAt),
		DecidedAt:          isoTime(item.DecidedAt),
		DeferCount:         item.DeferCount,
	}
}

func (s *Service) toRaw(item *model.GtdItem) ItemRaw {
	return ItemRaw{
		ID:                 item.ID,
		Title:              item.Title,
		Notes:              item.Notes,
		Status:             item.Status,
		ParentID:           item.ParentID,
		ScheduledDate:      isoTime(item.ScheduledDate),
		ScheduledTime:      item.ScheduledTime,
		PlannedDate:        isoTime(item.PlannedDate),
		DueDate:            isoTime(item.DueDate),
		Priority:           item.Priority,
		WaitingFor:         item.WaitingFor,
		AcceptanceCriteria: item.AcceptanceCriteria,
		DiscussWith:        item.DiscussWith,
		Order:              item.Order,
		UserID:             item.UserID,
		CreatedAt:          item.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:          item.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		CompletedAt:        isoTime(item.CompletedAt),
		DecidedAt:          isoTime(item.DecidedAt),
		DeferCount:         item.DeferCount,
	}
}

// GetItems возвращает задачи по фильтру status; без него — кроме done/archived.
func (s *Service) GetItems(ctx context.Context, user model.AuthUser, status *string) ([]ItemView, error) {
	items, err := s.store.ListGtdItems(ctx, user.ID, status)
	if err != nil {
		return nil, err
	}
	out := make([]ItemView, 0, len(items))
	for i := range items {
		out = append(out, s.toView(&items[i]))
	}
	return out, nil
}

// Create создаёт задачи в inbox со следующим order. Чужой родитель → 404.
func (s *Service) Create(ctx context.Context, user model.AuthUser, title string, parentID *int64) (ItemRaw, error) {
	if parentID != nil {
		parent, err := s.store.FindGtdItemByID(ctx, user.ID, *parentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ItemRaw{}, apperr.NotFound("GtdItem not found")
			}
			return ItemRaw{}, err
		}
		_ = parent
	}
	maxOrder, err := s.store.MaxGtdOrder(ctx, user.ID)
	if err != nil {
		return ItemRaw{}, err
	}
	order := 0
	if maxOrder != nil {
		order = *maxOrder + 1
	}
	item, err := s.store.CreateGtdItem(ctx, user.ID, title, "inbox", parentID, order, nil, (s.now)())
	if err != nil {
		return ItemRaw{}, err
	}
	return s.toRaw(item), nil
}

// GetForDate возвращает задачи на дату: запланированные (plannedDate) или
// календарные (status=calendar, scheduledDate).
func (s *Service) GetForDate(ctx context.Context, user model.AuthUser, dateStr string) ([]ItemView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return nil, apperr.BadRequest(err.Error())
		}
		return nil, err
	}
	items, err := s.store.ListGtdItemsForDate(ctx, user.ID, date)
	if err != nil {
		return nil, err
	}
	out := make([]ItemView, 0, len(items))
	for i := range items {
		out = append(out, s.toView(&items[i]))
	}
	return out, nil
}

// CreateForDate создаёт задачу в backlog, запланированную на дату.
func (s *Service) CreateForDate(ctx context.Context, user model.AuthUser, title, dateStr string) (ItemRaw, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return ItemRaw{}, apperr.BadRequest(err.Error())
		}
		return ItemRaw{}, err
	}
	maxOrder, err := s.store.MaxGtdOrder(ctx, user.ID)
	if err != nil {
		return ItemRaw{}, err
	}
	order := 0
	if maxOrder != nil {
		order = *maxOrder + 1
	}
	item, err := s.store.CreateGtdItem(ctx, user.ID, title, "backlog", nil, order, &date, (s.now)())
	if err != nil {
		return ItemRaw{}, err
	}
	return s.toRaw(item), nil
}

// UpdateDTO — частичное обновление GTD-задачи (опциональные nullable-поля).
type UpdateDTO struct {
	Title              *string    `json:"title"`
	Notes              opt.String `json:"notes"`
	Status             *string    `json:"status"`
	ScheduledDate      opt.String `json:"scheduledDate"`
	ScheduledTime      opt.String `json:"scheduledTime"`
	WaitingFor         opt.String `json:"waitingFor"`
	PlannedDate        opt.String `json:"plannedDate"`
	DueDate            opt.String `json:"dueDate"`
	Priority           opt.Bool   `json:"priority"`
	AcceptanceCriteria opt.String `json:"acceptanceCriteria"`
	DiscussWith        opt.String `json:"discussWith"`
}

func parseOptDate(f opt.String) (*time.Time, bool, error) {
	if !f.Set {
		return nil, false, nil
	}
	if f.Value == nil {
		return nil, true, nil
	}
	d, err := dateutil.ParseDateParam(*f.Value)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return nil, false, apperr.BadRequest(err.Error())
		}
		return nil, false, err
	}
	return &d, false, nil
}

// Update обновляет задачу и запускает side-эффекты Obsidian/iCloud.
func (s *Service) Update(ctx context.Context, user model.AuthUser, id int64, dto UpdateDTO) (ItemView, error) {
	existing, err := s.store.FindGtdItemByID(ctx, user.ID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ItemView{}, apperr.NotFound("GtdItem not found")
		}
		return ItemView{}, err
	}

	upd := store.GtdUpdate{}
	if dto.Title != nil {
		upd.Title = dto.Title
	}
	upd.Notes = dto.Notes
	upd.WaitingFor = dto.WaitingFor
	upd.AcceptanceCriteria = dto.AcceptanceCriteria
	upd.DiscussWith = dto.DiscussWith
	upd.ScheduledTime = dto.ScheduledTime
	if dto.Priority.Set {
		upd.Priority = dto.Priority.Value
	}
	if dto.ScheduledDate.Set {
		d, null, err := parseOptDate(dto.ScheduledDate)
		if err != nil {
			return ItemView{}, err
		}
		upd.ScheduledDate, upd.ScheduledDateNull = d, null
	}
	if dto.PlannedDate.Set {
		d, null, err := parseOptDate(dto.PlannedDate)
		if err != nil {
			return ItemView{}, err
		}
		upd.PlannedDate, upd.PlannedDateNull = d, null
	}
	if dto.DueDate.Set {
		d, null, err := parseOptDate(dto.DueDate)
		if err != nil {
			return ItemView{}, err
		}
		upd.DueDate, upd.DueDateNull = d, null
	}
	if dto.Status != nil {
		upd.Status = dto.Status
		now := (s.now)()
		upd.DecidedAt = &now
		if *dto.Status == "backlog" && existing.Status == "backlog" {
			dc := existing.DeferCount + 1
			upd.DeferCount = &dc
		}
		if *dto.Status == "done" && existing.Status != "done" {
			upd.CompletedAt = &now
		} else if *dto.Status != "done" && existing.Status == "done" {
			upd.CompletedAtNull = true
		}
	}

	updated, err := s.store.UpdateGtdItem(ctx, user.ID, id, upd)
	if err != nil {
		return ItemView{}, err
	}

	existingView := s.toView(existing)
	updatedView := s.toView(updated)

	if updatedView.Status == "reference" {
		if err := s.obsidian.SyncNote(ctx, user, updatedView); err != nil {
			return ItemView{}, err
		}
	} else if existingView.Status == "reference" {
		if err := s.obsidian.RemoveNote(ctx, user, id); err != nil {
			return ItemView{}, err
		}
	}

	dueBefore := effectiveDue(existingView)
	dueAfter := effectiveDue(updatedView)
	if updatedView.Status == "done" && dueBefore != nil {
		if err := s.icloud.CompleteReminder(ctx, user, id, updatedView, *dueBefore); err != nil {
			return ItemView{}, err
		}
	} else if dueAfter != nil {
		if err := s.icloud.SyncReminder(ctx, user, updatedView, *dueAfter); err != nil {
			return ItemView{}, err
		}
	} else if dueBefore != nil {
		if err := s.icloud.RemoveReminder(ctx, user, id); err != nil {
			return ItemView{}, err
		}
	}

	return updatedView, nil
}

// Remove удаляет задачу и снимает side-эффекты.
func (s *Service) Remove(ctx context.Context, user model.AuthUser, id int64) (RemoveResult, error) {
	existing, err := s.store.FindGtdItemByID(ctx, user.ID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RemoveResult{}, apperr.NotFound("GtdItem not found")
		}
		return RemoveResult{}, err
	}
	existingView := s.toView(existing)
	if existingView.Status == "reference" {
		if err := s.obsidian.RemoveNote(ctx, user, id); err != nil {
			return RemoveResult{}, err
		}
	}
	if effectiveDue(existingView) != nil || existingView.Status == "done" {
		if err := s.icloud.RemoveReminder(ctx, user, id); err != nil {
			return RemoveResult{}, err
		}
	}
	if err := s.store.DeleteGtdItem(ctx, user.ID, id); err != nil {
		return RemoveResult{}, err
	}
	return RemoveResult{ID: id}, nil
}

// effectiveDue — как icloud.helpers.effectiveDue.
func effectiveDue(item ItemView) *EffectiveDue {
	if item.Status == "archived" {
		return nil
	}
	if item.DueDate != nil {
		return &EffectiveDue{Date: *item.DueDate, Time: nil}
	}
	if item.Status == "calendar" && item.ScheduledDate != nil {
		return &EffectiveDue{Date: *item.ScheduledDate, Time: item.ScheduledTime}
	}
	return nil
}
