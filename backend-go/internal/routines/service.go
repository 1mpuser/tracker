package routines

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// DayGetter — геттер дня, нужный для отметки сферы (реализуется days.Service).
type DayGetter interface {
	GetOrCreateDayID(ctx context.Context, userID int64, dateStr string) (int64, error)
}

// RoutineView — строка рутины в недельном срезе.
type RoutineView struct {
	ID          int64             `json:"id"`
	Title       string            `json:"title"`
	TimesPerDay int               `json:"timesPerDay"`
	DaysPerWeek int               `json:"daysPerWeek"`
	CategoryID  *int64            `json:"categoryId"`
	Done        int               `json:"done"`
	Days        []RoutineLogEntry `json:"days"`
	Order       int               `json:"order"`
}

// RoutineLogEntry — отметка выполнения в конкретный день.
type RoutineLogEntry struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// RoutinesWeekView — ответ GET /routines.
type RoutinesWeekView struct {
	WeekStart string        `json:"weekStart"`
	WeekEnd   string        `json:"weekEnd"`
	Routines  []RoutineView `json:"routines"`
}

// RoutineHistoryWeek — неделя истории.
type RoutineHistoryWeek struct {
	WeekStart string               `json:"weekStart"`
	Items     []RoutineHistoryItem `json:"items"`
}

// RoutineHistoryItem — выполнение рутины в неделю.
type RoutineHistoryItem struct {
	RoutineID   int64 `json:"routineId"`
	Done        int   `json:"done"`
	DaysPerWeek int   `json:"daysPerWeek"`
}

// CreateDTO — данные создания рутины.
type CreateDTO struct {
	Title       string
	TimesPerDay *int
	DaysPerWeek *int
	CategoryID  *int64
}

// UpdateDTO — частичное обновление рутины.
type UpdateDTO struct {
	Title       *string
	TimesPerDay *int
	DaysPerWeek *int
	CategoryID  *int64
	CategorySet bool
	Archived    *bool
}

// ArchiveResult — тело ответа DELETE /routines/:id.
type ArchiveResult struct {
	ID int64 `json:"id"`
}

// Service — рутины пользователя.
type Service struct {
	store store.Store
	days  DayGetter
	now   func() time.Time
}

func NewService(st store.Store, days DayGetter) *Service {
	return &Service{store: st, days: days, now: time.Now}
}

func (s *Service) todayFor(timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	now := (s.now)().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
}

// GetWeek возвращает неделю пн–вс, содержащую weekParam (или «сегодня»).
func (s *Service) GetWeek(ctx context.Context, user model.AuthUser, weekParam *string) (RoutinesWeekView, error) {
	var anchor time.Time
	var err error
	if weekParam != nil {
		anchor, err = dateutil.ParseDateParam(*weekParam)
		if err != nil {
			if dateutil.IsInvalidDate(err) {
				return RoutinesWeekView{}, apperr.BadRequest(err.Error())
			}
			return RoutinesWeekView{}, err
		}
	} else {
		anchor, err = s.todayFor(user.Timezone)
		if err != nil {
			return RoutinesWeekView{}, err
		}
	}
	weekStart := dateutil.MondayOf(anchor)
	weekEnd := dateutil.AddDays(weekStart, 6)

	items, err := s.store.ListRoutinesWithLogs(ctx, user.ID, weekStart, weekEnd)
	if err != nil {
		return RoutinesWeekView{}, err
	}
	routines := make([]RoutineView, 0, len(items))
	for _, r := range items {
		counts := make([]int, 0, len(r.Logs))
		days := make([]RoutineLogEntry, 0, len(r.Logs))
		for _, l := range r.Logs {
			counts = append(counts, l.Count)
			days = append(days, RoutineLogEntry{Date: dateutil.FormatDate(l.Date), Count: l.Count})
		}
		routines = append(routines, RoutineView{
			ID:          r.ID,
			Title:       r.Title,
			TimesPerDay: r.TimesPerDay,
			DaysPerWeek: r.DaysPerWeek,
			CategoryID:  r.CategoryID,
			Done:        ClosedDays(counts, r.TimesPerDay),
			Days:        days,
			Order:       r.Order,
		})
	}
	return RoutinesWeekView{
		WeekStart: dateutil.FormatDate(weekStart),
		WeekEnd:   dateutil.FormatDate(weekEnd),
		Routines:  routines,
	}, nil
}

// Create создаёт рутину. Чужая сфера → 404.
func (s *Service) Create(ctx context.Context, userID int64, dto CreateDTO) (*model.Routine, error) {
	if dto.CategoryID != nil {
		if _, err := s.store.FindCategoryByID(ctx, userID, *dto.CategoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, apperr.NotFound("Category not found")
			}
			return nil, err
		}
	}
	maxOrder, err := s.store.MaxRoutineOrder(ctx, userID)
	if err != nil {
		return nil, err
	}
	order := 0
	if maxOrder != nil {
		order = *maxOrder + 1
	}
	timesPerDay := 1
	if dto.TimesPerDay != nil {
		timesPerDay = *dto.TimesPerDay
	}
	daysPerWeek := 3
	if dto.DaysPerWeek != nil {
		daysPerWeek = *dto.DaysPerWeek
	}
	return s.store.CreateRoutine(ctx, userID, dto.Title, timesPerDay, daysPerWeek, dto.CategoryID, order)
}

// Update частично обновляет рутину. Чужая/неизвестная → 404.
func (s *Service) Update(ctx context.Context, userID int64, id int64, dto UpdateDTO) (*model.Routine, error) {
	if _, err := s.store.FindRoutineByID(ctx, userID, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Routine not found")
		}
		return nil, err
	}
	if dto.CategorySet && dto.CategoryID != nil {
		if _, err := s.store.FindCategoryByID(ctx, userID, *dto.CategoryID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, apperr.NotFound("Category not found")
			}
			return nil, err
		}
	}
	return s.store.UpdateRoutine(ctx, userID, id, store.RoutineUpdate{
		Title:       dto.Title,
		TimesPerDay: dto.TimesPerDay,
		DaysPerWeek: dto.DaysPerWeek,
		CategoryID:  dto.CategoryID,
		CategorySet: dto.CategorySet,
		Archived:    dto.Archived,
	})
}

// Archive мягко архивирует рутину (без жёсткого удаления — логи ценны).
func (s *Service) Archive(ctx context.Context, userID int64, id int64) (ArchiveResult, error) {
	if _, err := s.store.FindRoutineByID(ctx, userID, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ArchiveResult{}, apperr.NotFound("Routine not found")
		}
		return ArchiveResult{}, err
	}
	if err := s.store.ArchiveRoutine(ctx, userID, id); err != nil {
		return ArchiveResult{}, err
	}
	return ArchiveResult{ID: id}, nil
}

// SetLog пишет абсолютное число отметок за день и возвращает неделю.
func (s *Service) SetLog(ctx context.Context, user model.AuthUser, id int64, dateStr string, count int) (RoutinesWeekView, error) {
	routine, err := s.store.FindRoutineByID(ctx, user.ID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RoutinesWeekView{}, apperr.NotFound("Routine not found")
		}
		return RoutinesWeekView{}, err
	}
	if routine.Archived {
		return RoutinesWeekView{}, apperr.NotFound("Routine not found")
	}
	if count < 0 || count > routine.TimesPerDay {
		return RoutinesWeekView{}, apperr.BadRequest("count must be an integer between 0 and " + strconv.Itoa(routine.TimesPerDay))
	}
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return RoutinesWeekView{}, apperr.BadRequest(err.Error())
		}
		return RoutinesWeekView{}, err
	}

	if count == 0 {
		if err := s.store.DeleteRoutineLog(ctx, id, date); err != nil {
			return RoutinesWeekView{}, err
		}
		return s.GetWeek(ctx, user, &dateStr)
	}

	if err := s.store.UpsertRoutineLog(ctx, id, date, count); err != nil {
		return RoutinesWeekView{}, err
	}
	if routine.CategoryID != nil {
		dayID, err := s.days.GetOrCreateDayID(ctx, user.ID, dateStr)
		if err != nil {
			return RoutinesWeekView{}, err
		}
		if err := s.store.UpsertDayCategoryStatus(ctx, dayID, *routine.CategoryID, true); err != nil {
			return RoutinesWeekView{}, err
		}
	}
	return s.GetWeek(ctx, user, &dateStr)
}

// RemoveLog снимает отметку за дату. Галочку сферы намеренно не снимает.
func (s *Service) RemoveLog(ctx context.Context, user model.AuthUser, id int64, dateStr string) (RoutinesWeekView, error) {
	routine, err := s.store.FindRoutineByID(ctx, user.ID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RoutinesWeekView{}, apperr.NotFound("Routine not found")
		}
		return RoutinesWeekView{}, err
	}
	if routine.Archived {
		return RoutinesWeekView{}, apperr.NotFound("Routine not found")
	}
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return RoutinesWeekView{}, apperr.BadRequest(err.Error())
		}
		return RoutinesWeekView{}, err
	}
	if err := s.store.DeleteRoutineLog(ctx, id, date); err != nil {
		return RoutinesWeekView{}, err
	}
	return s.GetWeek(ctx, user, &dateStr)
}

// GetHistory возвращает недели истории, последняя — текущая (по anchor или «сегодня»).
func (s *Service) GetHistory(ctx context.Context, user model.AuthUser, weeks int, anchor *string) ([]RoutineHistoryWeek, error) {
	count := weeks
	if count > 52 {
		count = 52
	}
	if count < 1 {
		count = 1
	}
	var lastMonday time.Time
	var err error
	if anchor != nil {
		a, perr := dateutil.ParseDateParam(*anchor)
		if perr != nil {
			if dateutil.IsInvalidDate(perr) {
				return nil, apperr.BadRequest(perr.Error())
			}
			return nil, perr
		}
		lastMonday = dateutil.MondayOf(a)
	} else {
		today, terr := s.todayFor(user.Timezone)
		if terr != nil {
			return nil, terr
		}
		lastMonday = dateutil.MondayOf(today)
	}
	firstMonday := dateutil.AddDays(lastMonday, -(count-1)*7)

	routines, err := s.store.ListRoutines(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(routines))
	for _, r := range routines {
		ids = append(ids, r.ID)
	}
	logs, err := s.store.ListRoutineLogs(ctx, ids, firstMonday, dateutil.AddDays(lastMonday, 6))
	if err != nil {
		return nil, err
	}

	type bucket struct{ counts []int }
	byWeek := map[string]map[int64]*bucket{}
	for _, l := range logs {
		key := dateutil.FormatDate(dateutil.MondayOf(l.Date))
		m, ok := byWeek[key]
		if !ok {
			m = map[int64]*bucket{}
			byWeek[key] = m
		}
		b, ok := m[l.RoutineID]
		if !ok {
			b = &bucket{}
			m[l.RoutineID] = b
		}
		b.counts = append(b.counts, l.Count)
	}

	result := make([]RoutineHistoryWeek, 0, count)
	for w := 0; w < count; w++ {
		weekStart := dateutil.FormatDate(dateutil.AddDays(firstMonday, w*7))
		items := make([]RoutineHistoryItem, 0, len(routines))
		for _, r := range routines {
			var done int
			if m, ok := byWeek[weekStart]; ok {
				if b, ok := m[r.ID]; ok {
					done = ClosedDays(b.counts, r.TimesPerDay)
				}
			}
			items = append(items, RoutineHistoryItem{RoutineID: r.ID, Done: done, DaysPerWeek: r.DaysPerWeek})
		}
		result = append(result, RoutineHistoryWeek{WeekStart: weekStart, Items: items})
	}
	return result, nil
}
