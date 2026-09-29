package days

import (
	"context"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

var dUser = model.AuthUser{ID: 1, Email: "a@b.c", Timezone: "UTC"}

type fakeDeliverer struct {
	dayCalls   int
	weekCalls  int
	weekReport TelegramReport
	weekErr    error
	lastUserID int64
	lastDayID  int64
	lastText   string
	lastPNG    *string
	lastView   DayView
}

func (f *fakeDeliverer) DeliverDay(ctx context.Context, userID, dayID int64, view DayView) error {
	f.dayCalls++
	f.lastUserID, f.lastDayID, f.lastView = userID, dayID, view
	return nil
}
func (f *fakeDeliverer) DeliverWeek(ctx context.Context, userID, dayID int64, text string, png *string) (TelegramReport, error) {
	f.weekCalls++
	f.lastUserID, f.lastDayID, f.lastText, f.lastPNG = userID, dayID, text, png
	return f.weekReport, f.weekErr
}

type noopObsidian struct{}

func (noopObsidian) SyncNote(context.Context, model.AuthUser, gtd.ItemView) error { return nil }
func (noopObsidian) RemoveNote(context.Context, model.AuthUser, int64) error      { return nil }

type noopICloud struct{}

func (noopICloud) SyncReminder(context.Context, model.AuthUser, gtd.ItemView, gtd.EffectiveDue) error {
	return nil
}
func (noopICloud) CompleteReminder(context.Context, model.AuthUser, int64, gtd.ItemView, gtd.EffectiveDue) error {
	return nil
}
func (noopICloud) RemoveReminder(context.Context, model.AuthUser, int64) error { return nil }

func newDaysSvc(fake *storetest.Fake, catFn func([]model.Category, error)) *Service {
	cs := categories.NewService(fake)
	gs := gtd.NewService(fake, noopObsidian{}, noopICloud{})
	ss := stats.NewService(fake)
	svc := NewService(fake, cs, gs, ss, &fakeDeliverer{})
	svc.now = func() time.Time { return time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC) }
	return svc
}

func dayRow(dateStr string, overrides func(*model.Day)) *model.Day {
	d, _ := time.Parse("2006-01-02", dateStr)
	dd := &model.Day{ID: 1, Date: d, DistractionMinutes: 0, Pomodoros: 0}
	if overrides != nil {
		overrides(dd)
	}
	return dd
}

func TestGetDayExposesPomodoros(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
		return dayRow("2026-07-15", func(d *model.Day) { d.Pomodoros = 2 }), nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetDay(context.Background(), dUser, "2026-07-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Pomodoros != 2 {
		t.Fatalf("got pomodoros=%d", got.Pomodoros)
	}
}

func TestGetDayReturnsTodaySlice(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
		return dayRow("2026-07-15", nil), nil
	}
	fake.ListGtdItemsForDateFn = func(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error) {
		title := "Из бэклога"
		return []model.GtdItem{{ID: 9, Title: title, Status: "backlog", Order: 0}}, nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetDay(context.Background(), dUser, "2026-07-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got.Today) != 1 || got.Today[0].ID != 9 || got.Today[0].Title != "Из бэклога" {
		t.Fatalf("got today %+v", got.Today)
	}
}

func TestGetHistoryNoRecord(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return nil, nil
	}
	fake.ListCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return []model.Category{{ID: 1, Key: "sport", Archived: false}, {ID: 2, Key: "family", Archived: false}}, nil
	}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetHistory(context.Background(), dUser, 1, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Completed != 0 || got[0].Total != 2 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestGetHistoryCountsArchivedWhenTracked(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return []model.Category{{ID: 1, Key: "sport", Archived: false}, {ID: 3, Key: "old", Archived: true}}, nil
	}
	d := dayRow("2026-07-15", func(dd *model.Day) { dd.DistractionMinutes = 10 })
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{*d}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return []model.DayCategoryStatus{{DayID: 1, CategoryID: 3, Done: true}}, nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetHistory(context.Background(), dUser, 1, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Total != 2 || got[0].Completed != 1 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestGetHistoryExcludesArchivedWhenNeverTracked(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		return []model.Category{{ID: 1, Key: "sport", Archived: false}, {ID: 3, Key: "old", Archived: true}}, nil
	}
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) { return nil, nil }
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetHistory(context.Background(), dUser, 1, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Total != 1 {
		t.Fatalf("got %+v", got[0])
	}
}

func TestGetHistoryFlagsDistractionOver(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) { return nil, nil }
	d := dayRow("2026-07-15", func(dd *model.Day) { dd.DistractionMinutes = 90 })
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
		return []model.Day{*d}, nil
	}
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	got, err := svc.GetHistory(context.Background(), dUser, 1, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got[0].DistractionOver {
		t.Fatalf("expected distractionOver")
	}
}

func TestGetHistoryAnchorsOnGivenEnd(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) { return nil, nil }
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) { return nil, nil }
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	end := "2026-07-20"
	got, err := svc.GetHistory(context.Background(), dUser, 1, &end)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].Date != "2026-07-20" {
		t.Fatalf("got %+v", got[0])
	}
}

func TestUpdateDayDeliversWhenClosed(t *testing.T) {
	fake := &storetest.Fake{}
	day := dayRow("2026-08-01", func(d *model.Day) { d.Pomodoros = 7 })
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) { return day, nil }
	fake.UpdateDayFn = func(ctx context.Context, userID int64, date time.Time, u store.DayUpdate) (*model.Day, error) {
		return day, nil
	}
	svc := &Service{store: fake, categories: categories.NewService(fake), gtd: gtd.NewService(fake, noopObsidian{}, noopICloud{}), stats: stats.NewService(fake), now: time.Now}
	fd := &fakeDeliverer{}
	svc.deliverer = fd
	closed := true
	_, err := svc.UpdateDay(context.Background(), dUser, "2026-08-01", UpdateDayData{EveningClosed: &closed})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fd.dayCalls != 1 || fd.lastDayID != 1 {
		t.Fatalf("deliver calls=%d", fd.dayCalls)
	}
}

func TestUpdateDayDoesNotDeliverOnRatingOnly(t *testing.T) {
	fake := &storetest.Fake{}
	day := dayRow("2026-08-01", nil)
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) { return day, nil }
	fake.UpdateDayFn = func(ctx context.Context, userID int64, date time.Time, u store.DayUpdate) (*model.Day, error) {
		return day, nil
	}
	svc := &Service{store: fake, categories: categories.NewService(fake), gtd: gtd.NewService(fake, noopObsidian{}, noopICloud{}), stats: stats.NewService(fake), now: time.Now}
	fd := &fakeDeliverer{}
	svc.deliverer = fd
	rating := 9
	_, err := svc.UpdateDay(context.Background(), dUser, "2026-08-01", UpdateDayData{Rating: &rating})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fd.dayCalls != 0 {
		t.Fatalf("expected 0 deliver calls, got %d", fd.dayCalls)
	}
}

func TestUpdatePomodorosIncrementsAndClamps(t *testing.T) {
	fake := &storetest.Fake{}
	day := dayRow("2026-07-18", func(d *model.Day) { d.Pomodoros = 3 })
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) { return day, nil }
	var captured int
	fake.UpdateDayPomodorosFn = func(ctx context.Context, userID int64, date time.Time, count int) error { captured = count; return nil }
	svc := newDaysSvc(fake, nil)
	delta := 1
	_, _ = svc.UpdatePomodoros(context.Background(), dUser, "2026-07-18", &delta, false)
	if captured != 4 {
		t.Fatalf("captured=%d", captured)
	}
	// clamp at zero
	day.Pomodoros = 0
	v := -1
	_, _ = svc.UpdatePomodoros(context.Background(), dUser, "2026-07-18", &v, false)
	if captured != 0 {
		t.Fatalf("clamp captured=%d", captured)
	}
	// reset
	day.Pomodoros = 3
	_, _ = svc.UpdatePomodoros(context.Background(), dUser, "2026-07-18", nil, true)
	if captured != 0 {
		t.Fatalf("reset captured=%d", captured)
	}
}

func TestSetPomodorosAbsoluteAndClampsNegative(t *testing.T) {
	fake := &storetest.Fake{}
	day := dayRow("2026-08-04", func(d *model.Day) { d.Pomodoros = 7 })
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) { return day, nil }
	var captured int
	fake.UpdateDayPomodorosFn = func(ctx context.Context, userID int64, date time.Time, count int) error { captured = count; return nil }
	svc := newDaysSvc(fake, nil)
	_, _ = svc.SetPomodoros(context.Background(), dUser, "2026-08-04", 3)
	if captured != 3 {
		t.Fatalf("captured=%d", captured)
	}
	_, _ = svc.SetPomodoros(context.Background(), dUser, "2026-08-04", -1)
	if captured != 0 {
		t.Fatalf("clamp captured=%d", captured)
	}
}

func TestPostWeeklySummaryRejectsNotClosed(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
		return nil, pgx.ErrNoRows
	}
	svc := newDaysSvc(fake, nil)
	_, err := svc.PostWeeklySummary(context.Background(), dUser, "2026-08-02", strPtr("AAAA"))
	if err == nil || err.(*apperr.Error).Kind != apperr.KindBadRequest {
		t.Fatalf("expected bad request, got %v", err)
	}
}

func TestPostWeeklySummaryReportsPosted(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
		return dayRow("2026-08-02", func(d *model.Day) { d.EveningClosed = true }), nil
	}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) { return nil, nil }
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) { return nil, nil }
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	fd := &fakeDeliverer{weekReport: TelegramReport{Sent: 1}}
	svc.deliverer = fd
	res, err := svc.PostWeeklySummary(context.Background(), dUser, "2026-08-02", strPtr("AAAA"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Posted || !res.WithChart {
		t.Fatalf("got %+v", res)
	}
	if fd.weekCalls != 1 || fd.lastText == "" {
		t.Fatalf("week calls=%d", fd.weekCalls)
	}
}

func TestPostWeeklySummaryReportsAlreadyPosted(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindDayFn = func(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
		return dayRow("2026-08-02", func(d *model.Day) { d.EveningClosed = true }), nil
	}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, DistractionBudget: 60}, nil
	}
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) { return nil, nil }
	fake.ListDaysInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) { return nil, nil }
	fake.ListDayCategoryStatusesInRangeFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
		return nil, nil
	}
	svc := newDaysSvc(fake, nil)
	fd := &fakeDeliverer{weekReport: TelegramReport{Sent: 0, Skipped: 2}}
	svc.deliverer = fd
	res, err := svc.PostWeeklySummary(context.Background(), dUser, "2026-08-02", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Posted || res.Reason != "already-posted" {
		t.Fatalf("got %+v", res)
	}
}

func strPtr(s string) *string { return &s }
