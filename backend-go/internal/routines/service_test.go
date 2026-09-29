package routines

import (
	"context"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

var rUser = model.AuthUser{ID: 1, Email: "a@b.c", Timezone: "UTC"}

type fakeDayGetter struct {
	id int64
}

func (f *fakeDayGetter) GetOrCreateDayID(ctx context.Context, userID int64, dateStr string) (int64, error) {
	return f.id, nil
}

func newRoutinesSvc(fake *storetest.Fake, days DayGetter) *Service {
	svc := NewService(fake, days)
	svc.now = func() time.Time { return time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC) }
	return svc
}

func TestGetWeekSpansMondaySunday(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListRoutinesWithLogsFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
		if start.UTC().Format("2006-01-02") != "2026-08-10" || end.UTC().Format("2006-01-02") != "2026-08-16" {
			t.Fatalf("wrong range %v .. %v", start, end)
		}
		return nil, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	week := "2026-08-16"
	v, err := svc.GetWeek(context.Background(), rUser, &week)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.WeekStart != "2026-08-10" || v.WeekEnd != "2026-08-16" {
		t.Fatalf("got %+v", v)
	}
}

func TestGetWeekCountsClosedDays(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListRoutinesWithLogsFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
		return []model.RoutineWithLogs{{
			Routine: model.Routine{ID: 1, Title: "Гигиена", TimesPerDay: 2, DaysPerWeek: 7, Order: 0},
			Logs: []model.RoutineLog{
				{Date: time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC), Count: 2},
				{Date: time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC), Count: 1},
			},
		}}, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	week := "2026-08-12"
	v, err := svc.GetWeek(context.Background(), rUser, &week)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.Routines[0].Done != 1 || v.Routines[0].TimesPerDay != 2 || v.Routines[0].DaysPerWeek != 7 {
		t.Fatalf("got %+v", v.Routines[0])
	}
	if len(v.Routines[0].Days) != 2 || v.Routines[0].Days[0].Date != "2026-08-10" || v.Routines[0].Days[0].Count != 2 {
		t.Fatalf("got days %+v", v.Routines[0].Days)
	}
}

func TestCreateDefaultsAndNextOrder(t *testing.T) {
	fake := &storetest.Fake{}
	max := 4
	fake.MaxRoutineOrderFn = func(ctx context.Context, userID int64) (*int, error) { return &max, nil }
	var got *model.Routine
	fake.CreateRoutineFn = func(ctx context.Context, userID int64, title string, timesPerDay, daysPerWeek int, categoryID *int64, order int) (*model.Routine, error) {
		got = &model.Routine{Title: title, TimesPerDay: timesPerDay, DaysPerWeek: daysPerWeek, Order: order}
		return got, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	_, err := svc.Create(context.Background(), 1, CreateDTO{Title: "Растяжка"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.TimesPerDay != 1 || got.DaysPerWeek != 3 || got.Order != 5 {
		t.Fatalf("got %+v", got)
	}
}

func TestCreateForeignCategoryNotFound(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindCategoryByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Category, error) {
		return nil, pgx.ErrNoRows
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	cat := int64(99)
	_, err := svc.Create(context.Background(), 1, CreateDTO{Title: "x", CategoryID: &cat})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestUpdateOnlyProvidedFields(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 1}, nil
	}
	fake.UpdateRoutineFn = func(ctx context.Context, userID int64, id int64, u store.RoutineUpdate) (*model.Routine, error) {
		if u.DaysPerWeek == nil || u.TimesPerDay != nil {
			t.Fatalf("provided fields wrong: %+v", u)
		}
		return &model.Routine{ID: 1, DaysPerWeek: *u.DaysPerWeek}, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	dw := 5
	_, err := svc.Update(context.Background(), 1, 1, UpdateDTO{DaysPerWeek: &dw})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateUnlinkCategoryAllowed(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 1, CategoryID: &[]int64{5}[0]}, nil
	}
	fake.UpdateRoutineFn = func(ctx context.Context, userID int64, id int64, u store.RoutineUpdate) (*model.Routine, error) {
		if !u.CategorySet || u.CategoryID != nil {
			t.Fatalf("expected unlink category")
		}
		return &model.Routine{ID: 1}, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	_, err := svc.Update(context.Background(), 1, 1, UpdateDTO{CategorySet: true, CategoryID: nil})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestArchiveSoftDeletes(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 3}, nil
	}
	var archived bool
	fake.ArchiveRoutineFn = func(ctx context.Context, userID int64, id int64) error { archived = true; return nil }
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	res, err := svc.Archive(context.Background(), 1, 3)
	if err != nil || res.ID != 3 || !archived {
		t.Fatalf("got res=%+v archived=%v err=%v", res, archived, err)
	}
}

func TestSetLogWritesAbsoluteCount(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 1, TimesPerDay: 2, CategoryID: nil}, nil
	}
	fake.ListRoutinesWithLogsFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
		return nil, nil
	}
	var upserted int
	fake.UpsertRoutineLogFn = func(ctx context.Context, routineID int64, date time.Time, count int) error {
		upserted = count
		return nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	_, err := svc.SetLog(context.Background(), rUser, 1, "2026-08-12", 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if upserted != 2 {
		t.Fatalf("upserted=%d", upserted)
	}
}

func TestSetLogZeroDeletesRow(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 1, TimesPerDay: 2, CategoryID: nil}, nil
	}
	fake.ListRoutinesWithLogsFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
		return nil, nil
	}
	fake.UpsertRoutineLogFn = func(ctx context.Context, routineID int64, date time.Time, count int) error {
		t.Fatalf("should not upsert on zero")
		return nil
	}
	var deleted bool
	fake.DeleteRoutineLogFn = func(ctx context.Context, routineID int64, date time.Time) error { deleted = true; return nil }
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	_, err := svc.SetLog(context.Background(), rUser, 1, "2026-08-12", 0)
	if err != nil || !deleted {
		t.Fatalf("deleted=%v err=%v", deleted, err)
	}
}

func TestSetLogRejectsCountOverNorm(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		return &model.Routine{ID: 1, TimesPerDay: 2}, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	_, err := svc.SetLog(context.Background(), rUser, 1, "2026-08-12", 3)
	if err == nil || err.(*apperr.Error).Kind != apperr.KindBadRequest {
		t.Fatalf("expected bad request, got %v", err)
	}
}

func TestSetLogSetsSphereOnFirstMark(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindRoutineByIDFn = func(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
		cat := int64(5)
		return &model.Routine{ID: 1, TimesPerDay: 2, CategoryID: &cat}, nil
	}
	fake.ListRoutinesWithLogsFn = func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
		return nil, nil
	}
	fake.UpsertRoutineLogFn = func(ctx context.Context, routineID int64, date time.Time, count int) error { return nil }
	var gotDay, gotCat int64
	fake.UpsertDayCategoryStatusFn = func(ctx context.Context, dayID, categoryID int64, done bool) error {
		gotDay, gotCat = dayID, categoryID
		return nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{id: 42})
	_, err := svc.SetLog(context.Background(), rUser, 1, "2026-08-12", 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotDay != 42 || gotCat != 5 {
		t.Fatalf("got day=%d cat=%d", gotDay, gotCat)
	}
}

func TestGetHistoryBucketsByWeek(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListRoutinesFn = func(ctx context.Context, userID int64) ([]model.Routine, error) {
		return []model.Routine{{ID: 1, TimesPerDay: 2, DaysPerWeek: 7}}, nil
	}
	fake.ListRoutineLogsFn = func(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error) {
		return []model.RoutineLog{
			{RoutineID: 1, Date: time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC), Count: 2},
			{RoutineID: 1, Date: time.Date(2026, 8, 13, 0, 0, 0, 0, time.UTC), Count: 1},
			{RoutineID: 1, Date: time.Date(2026, 8, 5, 0, 0, 0, 0, time.UTC), Count: 2},
		}, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	anchor := "2026-08-16"
	h, err := svc.GetHistory(context.Background(), rUser, 2, &anchor)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(h) != 2 {
		t.Fatalf("want 2, got %d", len(h))
	}
	if h[0].WeekStart != "2026-08-03" || h[0].Items[0].Done != 1 {
		t.Fatalf("got %+v", h[0])
	}
	if h[1].WeekStart != "2026-08-10" || h[1].Items[0].Done != 1 {
		t.Fatalf("got %+v", h[1])
	}
}

func TestGetHistoryClampsAndDefaults(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListRoutinesFn = func(ctx context.Context, userID int64) ([]model.Routine, error) { return nil, nil }
	fake.ListRoutineLogsFn = func(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error) {
		return nil, nil
	}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	anchor := "2026-08-12"
	h, err := svc.GetHistory(context.Background(), rUser, 1000, &anchor)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(h) != 52 {
		t.Fatalf("want 52, got %d", len(h))
	}
	h, err = svc.GetHistory(context.Background(), rUser, -5, &anchor)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(h) != 1 {
		t.Fatalf("want 1, got %d", len(h))
	}
}

func TestGetHistoryRejectsBadAnchor(t *testing.T) {
	fake := &storetest.Fake{}
	svc := newRoutinesSvc(fake, &fakeDayGetter{})
	bad := "вчера"
	_, err := svc.GetHistory(context.Background(), rUser, 2, &bad)
	if err == nil || err.(*apperr.Error).Kind != apperr.KindBadRequest {
		t.Fatalf("expected bad request, got %v", err)
	}
}
