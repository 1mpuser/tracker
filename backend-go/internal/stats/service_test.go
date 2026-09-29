package stats

import (
	"context"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

var user = model.AuthUser{ID: 1, Email: "a@b.c", Timezone: "UTC"}

func fixedNow() func() time.Time {
	return func() time.Time { return time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC) }
}

func p(i int) *int { return &i }

func TestCategoryStatsPct(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return []model.Category{{ID: 1, Key: "sport", Label: "Спорт", Order: 0}}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return []model.DayCategoryStatus{
			{CategoryID: 1, Done: true}, {CategoryID: 1, Done: true}, {CategoryID: 1, Done: false},
		}, nil
	}
	svc := NewService(fake)
	svc.now = fixedNow()
	got, err := svc.CategoryStats(context.Background(), user, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].DoneCount != 2 || got[0].TotalDays != 10 || got[0].Pct != 20 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestDistractionDailyStatsPct(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 50}, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{{Date: time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC), DistractionMinutes: 25}}, nil
	}
	svc := NewService(fake)
	svc.now = fixedNow()
	got, err := svc.DistractionDailyStats(context.Background(), user, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2, got %d", len(got))
	}
	if got[1].Minutes != 25 || got[1].Pct != 50 || got[0].Minutes != 0 || got[0].Pct != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestDistractionWeeklyStatsAlignsMonday(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return nil, nil
	}
	svc := NewService(fake)
	svc.now = fixedNow()
	got, err := svc.DistractionWeeklyStats(context.Background(), user, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].WeekStart != "2026-07-13" || got[0].AvgMinutes != 0 || got[0].Budget != 60 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestWeekStatsSpansMondaySunday(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return nil, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return nil, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.WeekStart != "2026-07-27" || got.WeekEnd != "2026-08-02" || len(got.Days) != 7 {
		t.Fatalf("got %+v", got)
	}
	if got.Days[0].Weekday != "Пн" || got.Days[6].Weekday != "Вс" {
		t.Fatalf("weekdays wrong: %+v", got.Days)
	}
	if got.AvgRating != nil || got.BestDay != nil || got.RatedDays != 0 {
		t.Fatalf("empty week should be zero-rated: %+v", got)
	}
}

func TestWeekStatsFillsMissingDaysWithZeros(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return nil, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{{Date: time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC), Pomodoros: 5, Rating: p(8), EveningClosed: true}}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []int{0, 0, 5, 0, 0, 0, 0}
	for i, v := range want {
		if got.Days[i].Pomodoros != v {
			t.Fatalf("day %d pomodoros = %d, want %d", i, got.Days[i].Pomodoros, v)
		}
	}
	if got.Days[0].Closed {
		t.Fatalf("day[0] should be open")
	}
}

func TestWeekStatsAveragesPomodorosOverSevenDays(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return nil, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{
			{Date: time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC), Pomodoros: 7},
			{Date: time.Date(2026, 7, 28, 0, 0, 0, 0, time.UTC), Pomodoros: 7},
		}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.TotalPomodoros != 14 || got.AvgPomodoros != 2 {
		t.Fatalf("got total=%d avg=%v", got.TotalPomodoros, got.AvgPomodoros)
	}
}

func TestWeekStatsPicksEarliestOnTie(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return nil, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{
			{Date: time.Date(2026, 7, 28, 0, 0, 0, 0, time.UTC), Pomodoros: 9},
			{Date: time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC), Pomodoros: 9},
		}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.BestDay == nil || got.BestDay.Date != "2026-07-28" || got.BestDay.Weekday != "Вт" || got.BestDay.Pomodoros != 9 {
		t.Fatalf("got bestDay %+v", got.BestDay)
	}
}

func TestWeekStatsCountsCategoryCompletions(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return []model.Category{{ID: 1, Label: "Спорт", Order: 0}}, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return nil, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return []model.DayCategoryStatus{{CategoryID: 1, Done: true}, {CategoryID: 1, Done: true}, {CategoryID: 1, Done: false}}, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Categories) != 1 || got.Categories[0].Label != "Спорт" || got.Categories[0].DoneCount != 2 {
		t.Fatalf("got %+v", got.Categories)
	}
}

func TestWeekStatsUsesConfiguredLabelDefault(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60, DistractionLabel: "Шортсы"}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return nil, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return nil, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := NewService(fake)
	got, err := svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.DistractionLabel != "Шортсы" {
		t.Fatalf("got %q", got.DistractionLabel)
	}
	// отсутствие настроек → дефолт
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return nil, pgx.ErrNoRows
	}
	got, err = svc.WeekStats(context.Background(), user, "2026-08-02")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.DistractionLabel != "Залипание" {
		t.Fatalf("got %q", got.DistractionLabel)
	}
}
