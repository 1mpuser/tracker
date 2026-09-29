// Package days — перенос DaysService из backend/src/days.
package days

import (
	"context"
	"errors"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// DayCategoryView — сфера в дне.
type DayCategoryView struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Done  bool   `json:"done"`
}

// DayView — ответ GET/PATCH /days/:date.
type DayView struct {
	Date               string            `json:"date"`
	DistractionMinutes int               `json:"distractionMinutes"`
	Pomodoros          int               `json:"pomodoros"`
	EveningClosed      bool              `json:"eveningClosed"`
	Rating             *int              `json:"rating"`
	Comment            *string           `json:"comment"`
	Categories         []DayCategoryView `json:"categories"`
	Today              []gtd.ItemView    `json:"today"`
}

// HistoryEntry — элемент GET /history.
type HistoryEntry struct {
	Date            string `json:"date"`
	Completed       int    `json:"completed"`
	Total           int    `json:"total"`
	Pomodoros       int    `json:"pomodoros"`
	DistractionOver bool   `json:"distractionOver"`
	Rating          *int   `json:"rating"`
}

// UpdateDayData — частичное обновление дня.
type UpdateDayData struct {
	EveningClosed *bool
	Rating        *int
	Comment       *string
}

// TelegramReport — результат рассылки сводки.
type TelegramReport struct {
	Sent    int
	Failed  int
	Skipped int
}

// Deliverer — side-effect публикации сводки в Telegram (реализация — в
// следующем промпте, сейчас no-op на HTTP-уровне).
type Deliverer interface {
	DeliverDay(ctx context.Context, userID, dayID int64, view DayView) error
	DeliverWeek(ctx context.Context, userID, dayID int64, text string, chartPNG *string) (TelegramReport, error)
}

// PostWeeklyResult — результат публикации недельной сводки.
type PostWeeklyResult struct {
	Posted    bool   `json:"posted"`
	WithChart bool   `json:"withChart,omitempty"`
	Reason    string `json:"reason,omitempty"`
}

// Service — дни пользователя.
type Service struct {
	store      store.Store
	categories *categories.Service
	gtd        *gtd.Service
	stats      *stats.Service
	deliverer  Deliverer
	now        func() time.Time
}

func NewService(st store.Store, cats *categories.Service, gtdSvc *gtd.Service, statsSvc *stats.Service, deliverer Deliverer) *Service {
	return &Service{store: st, categories: cats, gtd: gtdSvc, stats: statsSvc, deliverer: deliverer, now: time.Now}
}

func (s *Service) todayFor(timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	now := (s.now)().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
}

// GetOrCreateDayID возвращает id дня, создавая строку при отсутствии (нужен
// routines.SetLog).
func (s *Service) GetOrCreateDayID(ctx context.Context, userID int64, dateStr string) (int64, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return 0, apperr.BadRequest(err.Error())
		}
		return 0, err
	}
	day, err := s.store.FindDay(ctx, userID, date)
	if err == nil {
		return day.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	created, err := s.store.CreateDay(ctx, userID, date)
	if err != nil {
		return 0, err
	}
	return created.ID, nil
}

func (s *Service) getOrCreateDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
	day, err := s.store.FindDay(ctx, userID, date)
	if err == nil {
		return day, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return s.store.CreateDay(ctx, userID, date)
}

// GetDay возвращает день со сферами и сегодняшним срезом GTD.
func (s *Service) GetDay(ctx context.Context, user model.AuthUser, dateStr string) (DayView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return DayView{}, apperr.BadRequest(err.Error())
		}
		return DayView{}, err
	}
	day, err := s.getOrCreateDay(ctx, user.ID, date)
	if err != nil {
		return DayView{}, err
	}
	active, err := s.categories.FindActive(ctx, user.ID)
	if err != nil {
		return DayView{}, err
	}
	statuses, err := s.store.ListCategoryStatuses(ctx, day.ID)
	if err != nil {
		return DayView{}, err
	}
	statusByCat := map[int64]bool{}
	for _, st := range statuses {
		statusByCat[st.CategoryID] = st.Done
	}
	today, err := s.gtd.GetForDate(ctx, user, dateutil.FormatDate(day.Date))
	if err != nil {
		return DayView{}, err
	}
	cats := make([]DayCategoryView, 0, len(active))
	for _, c := range active {
		cats = append(cats, DayCategoryView{Key: c.Key, Label: c.Label, Done: statusByCat[c.ID]})
	}
	return DayView{
		Date:               dateutil.FormatDate(day.Date),
		DistractionMinutes: day.DistractionMinutes,
		Pomodoros:          day.Pomodoros,
		EveningClosed:      day.EveningClosed,
		Rating:             day.Rating,
		Comment:            day.Comment,
		Categories:         cats,
		Today:              today,
	}, nil
}

// SetCategoryStatus включает/выключает сферу в день.
func (s *Service) SetCategoryStatus(ctx context.Context, user model.AuthUser, dateStr, key string, done bool) (DayView, error) {
	dayID, err := s.GetOrCreateDayID(ctx, user.ID, dateStr)
	if err != nil {
		return DayView{}, err
	}
	cat, err := s.store.FindCategoryByKey(ctx, user.ID, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DayView{}, apperr.NotFound("Category \"" + key + "\" not found")
		}
		return DayView{}, err
	}
	if err := s.store.UpsertDayCategoryStatus(ctx, dayID, cat.ID, done); err != nil {
		return DayView{}, err
	}
	return s.GetDay(ctx, user, dateStr)
}

// UpdateDistraction — delta/reset по минутам отвлечения.
func (s *Service) UpdateDistraction(ctx context.Context, user model.AuthUser, dateStr string, delta *int, reset bool) (DayView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return DayView{}, apperr.BadRequest(err.Error())
		}
		return DayView{}, err
	}
	day, err := s.getOrCreateDay(ctx, user.ID, date)
	if err != nil {
		return DayView{}, err
	}
	next := 0
	if reset {
		next = 0
	} else {
		d := 0
		if delta != nil {
			d = *delta
		}
		next = day.DistractionMinutes + d
		if next < 0 {
			next = 0
		}
	}
	if err := s.store.UpdateDayDistraction(ctx, user.ID, date, next); err != nil {
		return DayView{}, err
	}
	return s.GetDay(ctx, user, dateStr)
}

// UpdatePomodoros — delta/reset по помидорам.
func (s *Service) UpdatePomodoros(ctx context.Context, user model.AuthUser, dateStr string, delta *int, reset bool) (DayView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return DayView{}, apperr.BadRequest(err.Error())
		}
		return DayView{}, err
	}
	day, err := s.getOrCreateDay(ctx, user.ID, date)
	if err != nil {
		return DayView{}, err
	}
	next := 0
	if reset {
		next = 0
	} else {
		d := 0
		if delta != nil {
			d = *delta
		}
		next = day.Pomodoros + d
		if next < 0 {
			next = 0
		}
	}
	if err := s.store.UpdateDayPomodoros(ctx, user.ID, date, next); err != nil {
		return DayView{}, err
	}
	return s.GetDay(ctx, user, dateStr)
}

// SetPomodoros — абсолютная запись числа помидоров.
func (s *Service) SetPomodoros(ctx context.Context, user model.AuthUser, dateStr string, count int) (DayView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return DayView{}, apperr.BadRequest(err.Error())
		}
		return DayView{}, err
	}
	if _, err := s.getOrCreateDay(ctx, user.ID, date); err != nil {
		return DayView{}, err
	}
	if count < 0 {
		count = 0
	}
	if err := s.store.UpdateDayPomodoros(ctx, user.ID, date, count); err != nil {
		return DayView{}, err
	}
	return s.GetDay(ctx, user, dateStr)
}

// UpdateDay обновляет вечернюю отметку/оценку/комментарий.
func (s *Service) UpdateDay(ctx context.Context, user model.AuthUser, dateStr string, data UpdateDayData) (DayView, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return DayView{}, apperr.BadRequest(err.Error())
		}
		return DayView{}, err
	}
	day, err := s.getOrCreateDay(ctx, user.ID, date)
	if err != nil {
		return DayView{}, err
	}
	if _, err := s.store.UpdateDay(ctx, user.ID, date, store.DayUpdate{
		EveningClosed: data.EveningClosed,
		Rating:        data.Rating,
		Comment:       data.Comment,
	}); err != nil {
		return DayView{}, err
	}
	view, err := s.GetDay(ctx, user, dateStr)
	if err != nil {
		return DayView{}, err
	}
	if data.EveningClosed != nil && *data.EveningClosed {
		if err := s.deliverer.DeliverDay(ctx, user.ID, day.ID, view); err != nil {
			return DayView{}, err
		}
	}
	return view, nil
}

// PostWeeklySummary публикует недельную сводку за воскресную дату.
func (s *Service) PostWeeklySummary(ctx context.Context, user model.AuthUser, dateStr string, chartPNG *string) (PostWeeklyResult, error) {
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		if dateutil.IsInvalidDate(err) {
			return PostWeeklyResult{}, apperr.BadRequest(err.Error())
		}
		return PostWeeklyResult{}, err
	}
	day, err := s.store.FindDay(ctx, user.ID, date)
	if err != nil {
		return PostWeeklyResult{}, apperr.BadRequest("Недельная сводка публикуется только для закрытого дня")
	}
	if !day.EveningClosed {
		return PostWeeklyResult{}, apperr.BadRequest("Недельная сводка публикуется только для закрытого дня")
	}
	withChart := chartPNG != nil

	weekStats, err := s.stats.WeekStats(ctx, user, dateStr)
	if err != nil {
		return PostWeeklyResult{}, err
	}
	text := BuildWeekSummary(weekStats)

	report, err := s.deliverer.DeliverWeek(ctx, user.ID, day.ID, text, chartPNG)
	if err != nil {
		return PostWeeklyResult{}, err
	}
	if report.Sent > 0 {
		return PostWeeklyResult{Posted: true, WithChart: withChart}, nil
	}
	if report.Failed > 0 {
		return PostWeeklyResult{Posted: false, WithChart: withChart, Reason: "send-failed"}, nil
	}
	return PostWeeklyResult{Posted: false, WithChart: false, Reason: "already-posted"}, nil
}

// GetHistory — история за последние limit дней (или до endDateStr).
func (s *Service) GetHistory(ctx context.Context, user model.AuthUser, limit int, endDateStr *string) ([]HistoryEntry, error) {
	var end time.Time
	var err error
	if endDateStr != nil {
		end, err = dateutil.ParseDateParam(*endDateStr)
		if err != nil {
			if dateutil.IsInvalidDate(err) {
				return nil, apperr.BadRequest(err.Error())
			}
			return nil, err
		}
	} else {
		end, err = s.todayFor(user.Timezone)
		if err != nil {
			return nil, err
		}
	}
	start := dateutil.AddDays(end, -(limit - 1))

	days, err := s.store.ListDaysInRange(ctx, user.ID, start, end)
	if err != nil {
		return nil, err
	}
	cats, err := s.store.ListCategories(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	settings, err := s.store.FindSettings(ctx, user.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	budget := 60
	if settings != nil {
		budget = settings.DistractionBudget
	}

	dayByDate := map[string]model.Day{}
	dateByDayID := map[int64]string{}
	for _, d := range days {
		f := dateutil.FormatDate(d.Date)
		dayByDate[f] = d
		dateByDayID[d.ID] = f
	}
	statuses, err := s.store.ListDayCategoryStatusesInRange(ctx, user.ID, start, end)
	if err != nil {
		return nil, err
	}
	statusByDate := map[string][]model.DayCategoryStatus{}
	for _, st := range statuses {
		d := dateByDayID[st.DayID]
		statusByDate[d] = append(statusByDate[d], st)
	}

	result := make([]HistoryEntry, 0, limit)
	for i := 0; i < limit; i++ {
		date := dateutil.FormatDate(dateutil.AddDays(start, i))
		day, hasDay := dayByDate[date]
		statusSet := map[int64]bool{}
		for _, st := range statusByDate[date] {
			statusSet[st.CategoryID] = st.Done
		}
		activeSet := make([]model.Category, 0, len(cats))
		for _, c := range cats {
			_, tracked := statusSet[c.ID]
			if !c.Archived || tracked {
				activeSet = append(activeSet, c)
			}
		}
		completed := 0
		for _, c := range activeSet {
			if statusSet[c.ID] {
				completed++
			}
		}
		distractionMinutes := 0
		pomodoros := 0
		var rating *int
		if hasDay {
			distractionMinutes = day.DistractionMinutes
			pomodoros = day.Pomodoros
			rating = day.Rating
		}
		result = append(result, HistoryEntry{
			Date:            date,
			Completed:       completed,
			Total:           len(activeSet),
			Pomodoros:       pomodoros,
			DistractionOver: distractionMinutes > budget,
			Rating:          rating,
		})
	}
	return result, nil
}
