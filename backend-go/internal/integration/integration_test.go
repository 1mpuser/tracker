// Package integration — интеграционные тесты модулей days/categories/stats
// против реальной тестовой БД. Запускать явно с DATABASE_URL=...tracker_test;
// без переменной тесты пропускаются.
package integration

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

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

type noopDeliverer struct{}

func (noopDeliverer) DeliverDay(context.Context, int64, int64, days.DayView) error { return nil }
func (noopDeliverer) DeliverWeek(context.Context, int64, int64, string, *string) (days.TelegramReport, error) {
	return days.TelegramReport{}, nil
}

func setupPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL не задан — интеграционные тесты пропущены")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newUser(t *testing.T, st *store.PGStore) model.User {
	t.Helper()
	ctx := context.Background()
	email := "it-" + time.Now().Format("150405.000000000") + "-" + randSuffix() + "@test.local"
	u, err := st.CreateUserWithDefaults(ctx, email, nil, "UTC", 60)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { _ = st.DeleteUser(ctx, u.ID) })
	return *u
}

func randSuffix() string {
	return time.Now().UTC().Format("20060102150405.999999999")
}

func TestCategoriesIntegration(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)
	svc := categories.NewService(st)

	// создаём сферу и квартире
	cat, err := svc.Create(ctx, u.ID, categories.CreateDTO{Key: "reading", Label: "Чтение"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if cat.Order != 5 { // после дефолтных 5 сфер order = 5
		t.Fatalf("order=%d, want 5", cat.Order)
	}
	// занятый ключ → 409
	if _, err := svc.Create(ctx, u.ID, categories.CreateDTO{Key: "reading", Label: "X"}); err == nil {
		t.Fatal("expected conflict on duplicate key")
	}
	// активные: есть reading, нет archived
	archived := true
	if _, err := svc.Update(ctx, u.ID, "sport", categories.UpdateDTO{Archived: &archived}); err != nil {
		t.Fatalf("archive: %v", err)
	}
	active, err := svc.FindActive(ctx, u.ID)
	if err != nil {
		t.Fatalf("findActive: %v", err)
	}
	for _, c := range active {
		if c.Key == "sport" {
			t.Fatalf("archived sport still active")
		}
		if c.Key == "reading" {
			return
		}
	}
	t.Fatalf("reading not in active categories")
}

func TestDaysIntegration(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	catSvc := categories.NewService(st)
	gtdSvc := gtd.NewService(st, noopObsidian{}, noopICloud{})
	statsSvc := stats.NewService(st)
	daysSvc := days.NewService(st, catSvc, gtdSvc, statsSvc, noopDeliverer{})

	au := model.AuthUser{ID: u.ID, Email: u.Email, Timezone: "UTC"}

	// создаём сферу, отмечаем её в конкретный день
	if _, err := catSvc.Create(ctx, u.ID, categories.CreateDTO{Key: "reading", Label: "Чтение"}); err != nil {
		t.Fatalf("create category: %v", err)
	}
	view, err := daysSvc.GetDay(ctx, au, "2026-07-15")
	if err != nil {
		t.Fatalf("getDay: %v", err)
	}
	if view.Date != "2026-07-15" {
		t.Fatalf("date=%s", view.Date)
	}
	if _, err := daysSvc.SetCategoryStatus(ctx, au, "2026-07-15", "reading", true); err != nil {
		t.Fatalf("setCategoryStatus: %v", err)
	}
	if _, err := daysSvc.UpdatePomodoros(ctx, au, "2026-07-15", nil, false); err != nil {
		t.Fatalf("updatePomodoros: %v", err)
	}
	// снова получить день — галочка и помидор выставлены
	view, err = daysSvc.GetDay(ctx, au, "2026-07-15")
	if err != nil {
		t.Fatalf("getDay2: %v", err)
	}
	for _, c := range view.Categories {
		if c.Key == "reading" && !c.Done {
			t.Fatalf("reading should be done")
		}
	}
	// история за день должна посчитать сферу
	end := "2026-07-15"
	history, err := daysSvc.GetHistory(ctx, au, 1, &end)
	if err != nil {
		t.Fatalf("getHistory: %v", err)
	}
	if history[0].Completed != 1 || history[0].Total < 1 {
		t.Fatalf("history[0]=%+v", history[0])
	}
}

func TestStatsIntegration(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	catSvc := categories.NewService(st)
	statsSvc := stats.NewService(st)
	au := model.AuthUser{ID: u.ID, Email: u.Email, Timezone: "UTC"}

	if _, err := catSvc.Create(ctx, u.ID, categories.CreateDTO{Key: "reading", Label: "Чтение"}); err != nil {
		t.Fatalf("create category: %v", err)
	}
	// отмечаем чтение в паре дней на этой неделе (воскресная неделя, содержащая 2026-08-02)
	daysSvc := days.NewService(st, catSvc, gtd.NewService(st, noopObsidian{}, noopICloud{}), statsSvc, noopDeliverer{})
	for _, d := range []string{"2026-07-27", "2026-07-28"} {
		if _, err := daysSvc.SetCategoryStatus(ctx, au, d, "reading", true); err != nil {
			t.Fatalf("status %s: %v", d, err)
		}
	}
	// недельная сводка
	week, err := statsSvc.WeekStats(ctx, au, "2026-08-02")
	if err != nil {
		t.Fatalf("weekStats: %v", err)
	}
	if week.WeekStart != "2026-07-27" || week.WeekEnd != "2026-08-02" {
		t.Fatalf("week range = %s..%s", week.WeekStart, week.WeekEnd)
	}
	found := false
	for _, c := range week.Categories {
		if c.Label == "Чтение" {
			found = true
			if c.DoneCount != 2 {
				t.Fatalf("doneCount=%d, want 2", c.DoneCount)
			}
		}
	}
	if !found {
		t.Fatal("reading category absent from weekStats")
	}
}
