// Package stats — перенос StatsService из backend/src/stats.
package stats

import (
	"context"
	"errors"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// WeekDayStat — точка недели.
type WeekDayStat struct {
	Date      string `json:"date"`
	Weekday   string `json:"weekday"`
	Pomodoros int    `json:"pomodoros"`
	Rating    *int   `json:"rating"`
	Closed    bool   `json:"closed"`
}

// BestDay — лучший день недели.
type BestDay struct {
	Date      string `json:"date"`
	Weekday   string `json:"weekday"`
	Pomodoros int    `json:"pomodoros"`
}

// WeekStats — ответ GET /stats/week.
type WeekStats struct {
	WeekStart         string          `json:"weekStart"`
	WeekEnd           string          `json:"weekEnd"`
	Days              []WeekDayStat   `json:"days"`
	TotalPomodoros    int             `json:"totalPomodoros"`
	AvgPomodoros      float64         `json:"avgPomodoros"`
	BestDay           *BestDay        `json:"bestDay"`
	AvgRating         *float64        `json:"avgRating"`
	RatedDays         int             `json:"ratedDays"`
	Categories        []CategoryCount `json:"categories"`
	DistractionAvgMin float64         `json:"distractionAvgMinutes"`
	DistractionBudget int             `json:"distractionBudget"`
	DistractionLabel  string          `json:"distractionLabel"`
}

// CategoryCount — счётчик выполнений сферы за неделю.
type CategoryCount struct {
	Label     string `json:"label"`
	DoneCount int    `json:"doneCount"`
}

// CategoryStat — GET /stats/categories элемент.
type CategoryStat struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	DoneCount int    `json:"doneCount"`
	TotalDays int    `json:"totalDays"`
	Pct       int    `json:"pct"`
}

// DistractionWeekly — GET /stats/distraction элемент.
type DistractionWeekly struct {
	WeekStart  string  `json:"weekStart"`
	AvgMinutes float64 `json:"avgMinutes"`
	Budget     int     `json:"budget"`
}

// DistractionDaily — GET /stats/distraction-daily элемент.
type DistractionDaily struct {
	Date    string `json:"date"`
	Minutes int    `json:"minutes"`
	Budget  int    `json:"budget"`
	Pct     int    `json:"pct"`
}

// Service — статистика пользователя.
type Service struct {
	store store.Store
	now   func() time.Time
}

func NewService(st store.Store) *Service {
	return &Service{store: st, now: time.Now}
}

// todayFor — «сегодня» в поясе пользователя на основе инжектируемого now
// (в проде time.Now, в тестах фиксировано).
func (s *Service) todayFor(timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	now := (s.now)().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
}

// CategoryStats возвращает выполнение сфер за последние days дней.
func (s *Service) CategoryStats(ctx context.Context, user model.AuthUser, days int) ([]CategoryStat, error) {
	end, err := s.todayFor(user.Timezone)
	if err != nil {
		return nil, err
	}
	start := dateutil.AddDays(end, -(days - 1))

	categories, err := s.store.ListActiveCategories(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	statuses, err := s.store.ListDayCategoryStatusesInRange(ctx, user.ID, start, end)
	if err != nil {
		return nil, err
	}

	doneByCategory := map[int64]int{}
	for _, st := range statuses {
		if st.Done {
			doneByCategory[st.CategoryID]++
		}
	}

	out := make([]CategoryStat, 0, len(categories))
	for _, c := range categories {
		done := doneByCategory[c.ID]
		out = append(out, CategoryStat{
			Key:       c.Key,
			Label:     c.Label,
			DoneCount: done,
			TotalDays: days,
			Pct:       roundPct(done, days),
		})
	}
	return out, nil
}

// DistractionWeeklyStats — среднее отвлечение по неделям.
func (s *Service) DistractionWeeklyStats(ctx context.Context, user model.AuthUser, weeks int) ([]DistractionWeekly, error) {
	settings, err := s.findSettingsDefault(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	budget := distractionBudget(settings)

	today, err := s.todayFor(user.Timezone)
	if err != nil {
		return nil, err
	}
	todayMonday := dateutil.MondayOf(today)
	firstMonday := dateutil.AddDays(todayMonday, -(weeks-1)*7)

	days, err := s.store.ListDaysInRange(ctx, user.ID, firstMonday, dateutil.AddDays(todayMonday, 6))
	if err != nil {
		return nil, err
	}
	minutesByDate := map[string]int{}
	for _, d := range days {
		minutesByDate[dateutil.FormatDate(d.Date)] = d.DistractionMinutes
	}

	out := make([]DistractionWeekly, 0, weeks)
	for w := 0; w < weeks; w++ {
		weekStart := dateutil.AddDays(firstMonday, w*7)
		sum := 0
		for i := 0; i < 7; i++ {
			sum += minutesByDate[dateutil.FormatDate(dateutil.AddDays(weekStart, i))]
		}
		out = append(out, DistractionWeekly{
			WeekStart:  dateutil.FormatDate(weekStart),
			AvgMinutes: round1(float64(sum) / 7),
			Budget:     budget,
		})
	}
	return out, nil
}

// DistractionDailyStats — отвлечение по дням.
func (s *Service) DistractionDailyStats(ctx context.Context, user model.AuthUser, days int) ([]DistractionDaily, error) {
	end, err := s.todayFor(user.Timezone)
	if err != nil {
		return nil, err
	}
	start := dateutil.AddDays(end, -(days - 1))

	settings, err := s.findSettingsDefault(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	budget := distractionBudget(settings)

	dayRows, err := s.store.ListDaysInRange(ctx, user.ID, start, end)
	if err != nil {
		return nil, err
	}
	minutesByDate := map[string]int{}
	for _, d := range dayRows {
		minutesByDate[dateutil.FormatDate(d.Date)] = d.DistractionMinutes
	}

	out := make([]DistractionDaily, 0, days)
	for i := 0; i < days; i++ {
		date := dateutil.FormatDate(dateutil.AddDays(start, i))
		minutes := minutesByDate[date]
		out = append(out, DistractionDaily{
			Date:    date,
			Minutes: minutes,
			Budget:  budget,
			Pct:     roundPct(minutes, budget),
		})
	}
	return out, nil
}

// WeekStats — недельная сводка за неделю, содержащую endDateStr.
func (s *Service) WeekStats(ctx context.Context, user model.AuthUser, endDateStr string) (WeekStats, error) {
	endDate, err := dateutil.ParseDateParam(endDateStr)
	if err != nil {
		return WeekStats{}, err
	}
	monday := dateutil.MondayOf(endDate)
	sunday := dateutil.AddDays(monday, 6)

	settings, err := s.findSettingsDefault(ctx, user.ID)
	if err != nil {
		return WeekStats{}, err
	}
	categories, err := s.store.ListActiveCategories(ctx, user.ID)
	if err != nil {
		return WeekStats{}, err
	}
	dayRows, err := s.store.ListDaysInRange(ctx, user.ID, monday, sunday)
	if err != nil {
		return WeekStats{}, err
	}
	statuses, err := s.store.ListDayCategoryStatusesInRange(ctx, user.ID, monday, sunday)
	if err != nil {
		return WeekStats{}, err
	}

	rowByDate := map[string]model.Day{}
	for _, d := range dayRows {
		rowByDate[dateutil.FormatDate(d.Date)] = d
	}

	days := make([]WeekDayStat, 0, 7)
	for i := 0; i < 7; i++ {
		date := dateutil.AddDays(monday, i)
		key := dateutil.FormatDate(date)
		row, ok := rowByDate[key]
		stat := WeekDayStat{
			Date:    key,
			Weekday: dateutil.WeekdayShort[date.Weekday()],
		}
		if ok {
			stat.Pomodoros = row.Pomodoros
			stat.Rating = row.Rating
			stat.Closed = row.EveningClosed
		}
		days = append(days, stat)
	}

	totalPomodoros := 0
	for _, d := range days {
		totalPomodoros += d.Pomodoros
	}
	rated := 0
	var ratingSum int
	for _, d := range days {
		if d.Rating != nil {
			rated++
			ratingSum += *d.Rating
		}
	}

	var bestDay *BestDay
	for _, d := range days {
		if d.Pomodoros > 0 && (bestDay == nil || d.Pomodoros > bestDay.Pomodoros) {
			bestDay = &BestDay{Date: d.Date, Weekday: d.Weekday, Pomodoros: d.Pomodoros}
		}
	}

	doneByCategory := map[int64]int{}
	for _, st := range statuses {
		if st.Done {
			doneByCategory[st.CategoryID]++
		}
	}
	catCounts := make([]CategoryCount, 0, len(categories))
	for _, c := range categories {
		catCounts = append(catCounts, CategoryCount{Label: c.Label, DoneCount: doneByCategory[c.ID]})
	}

	distractionTotal := 0
	for _, d := range dayRows {
		distractionTotal += d.DistractionMinutes
	}

	var avgRating *float64
	if rated > 0 {
		v := round1(float64(ratingSum) / float64(rated))
		avgRating = &v
	}

	return WeekStats{
		WeekStart:         dateutil.FormatDate(monday),
		WeekEnd:           dateutil.FormatDate(sunday),
		Days:              days,
		TotalPomodoros:    totalPomodoros,
		AvgPomodoros:      round1(float64(totalPomodoros) / 7),
		BestDay:           bestDay,
		AvgRating:         avgRating,
		RatedDays:         rated,
		Categories:        catCounts,
		DistractionAvgMin: round1(float64(distractionTotal) / 7),
		DistractionBudget: distractionBudget(settings),
		DistractionLabel:  distractionLabel(settings),
	}, nil
}

func distractionBudget(s *model.Settings) int {
	if s == nil {
		return 60
	}
	return s.DistractionBudget
}

func distractionLabel(s *model.Settings) string {
	if s == nil || s.DistractionLabel == "" {
		return "Залипание"
	}
	return s.DistractionLabel
}

// findSettingsDefault возвращает настройки, считая отсутствие строки дефолтом.
func (s *Service) findSettingsDefault(ctx context.Context, userID int64) (*model.Settings, error) {
	st, err := s.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return st, nil
}

// roundPct считает целый процент (0 если бюджет 0), как Math.round в JS.
func roundPct(n, denominator int) int {
	if denominator <= 0 {
		return 0
	}
	return roundDiv(n*100, denominator)
}

func roundDiv(a, b int) int {
	if b == 0 {
		return 0
	}
	// Math.round: +0.5, банковского округления избегаем
	return int(float64(a)/float64(b) + 0.5)
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
