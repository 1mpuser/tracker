package gtd

import (
	"context"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/opt"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

var gUser = model.AuthUser{ID: 1, Email: "a@b.c", Timezone: "UTC"}

type mockObsidian struct {
	syncCalls   int
	removeCalls int
	lastItem    ItemView
	lastID      int64
}

func (m *mockObsidian) SyncNote(ctx context.Context, user model.AuthUser, item ItemView) error {
	m.syncCalls++
	m.lastItem = item
	return nil
}
func (m *mockObsidian) RemoveNote(ctx context.Context, user model.AuthUser, id int64) error {
	m.removeCalls++
	m.lastID = id
	return nil
}

type mockICloud struct {
	syncCalls     int
	completeCalls int
	removeCalls   int
	lastDue       *EffectiveDue
}

func (m *mockICloud) SyncReminder(ctx context.Context, user model.AuthUser, item ItemView, due EffectiveDue) error {
	m.syncCalls++
	m.lastDue = &due
	return nil
}
func (m *mockICloud) CompleteReminder(ctx context.Context, user model.AuthUser, id int64, item ItemView, due EffectiveDue) error {
	m.completeCalls++
	m.lastDue = &due
	return nil
}
func (m *mockICloud) RemoveReminder(ctx context.Context, user model.AuthUser, id int64) error {
	m.removeCalls++
	return nil
}

func baseRow(overrides func(*model.GtdItem)) *model.GtdItem {
	now := time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC)
	g := &model.GtdItem{
		ID: 1, Title: "T", Status: "inbox", Order: 0, UpdatedAt: now,
	}
	if overrides != nil {
		overrides(g)
	}
	return g
}

func newSvc(fake *storetest.Fake) (*Service, *mockObsidian, *mockICloud) {
	obs := &mockObsidian{}
	icl := &mockICloud{}
	svc := NewService(fake, obs, icl)
	svc.now = func() time.Time { return time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC) }
	return svc, obs, icl
}

func TestCreateNextOrder(t *testing.T) {
	fake := &storetest.Fake{}
	max := 4
	fake.MaxGtdOrderFn = func(ctx context.Context, userID int64) (*int, error) { return &max, nil }
	var got *model.GtdItem
	fake.CreateGtdItemFn = func(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error) {
		got = baseRow(func(g *model.GtdItem) { g.Title = title; g.Order = order; g.Status = status; g.DecidedAt = &decidedAt })
		return got, nil
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.Create(context.Background(), gUser, "Позвонить в банк", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Order != 5 || got.Status != "inbox" || got.DecidedAt == nil {
		t.Fatalf("got order=%d status=%s decidedAt=%v", got.Order, got.Status, got.DecidedAt)
	}
}

func TestCreateValidatesParent(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return nil, pgx.ErrNoRows
	}
	svc, _, _ := newSvc(fake)
	pid := int64(7)
	_, err := svc.Create(context.Background(), gUser, "x", &pid)
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestGetItemsExcludesDoneArchived(t *testing.T) {
	fake := &storetest.Fake{}
	var gotStatus *string
	fake.ListGtdItemsFn = func(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error) {
		gotStatus = status
		return nil, nil
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.GetItems(context.Background(), gUser, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotStatus != nil {
		t.Fatalf("expected no status filter, got %v", *gotStatus)
	}
}

func TestGetItemsSerializesDates(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListGtdItemsFn = func(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error) {
		sd := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
		return []model.GtdItem{*baseRow(func(g *model.GtdItem) { g.Status = "calendar"; g.ScheduledDate = &sd })}, nil
	}
	svc, _, _ := newSvc(fake)
	status := "calendar"
	got, err := svc.GetItems(context.Background(), gUser, &status)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got[0].ScheduledDate == nil || *got[0].ScheduledDate != "2026-07-25" {
		t.Fatalf("got %+v", got[0])
	}
}

func TestUpdateSetsCompletedAtOnDone(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog" }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "done"; g.CompletedAt = u.CompletedAt }), nil
	}
	svc, _, _ := newSvc(fake)
	status := "done"
	got, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.CompletedAt == nil {
		t.Fatalf("expected completedAt set, got %+v", got)
	}
}

func TestUpdateClearsCompletedAtOnAway(t *testing.T) {
	fake := &storetest.Fake{}
	c := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "done"; g.CompletedAt = &c }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		if !u.CompletedAtNull {
			t.Fatalf("expected CompletedAtNull")
		}
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog" }), nil
	}
	svc, _, _ := newSvc(fake)
	status := "backlog"
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateParsesScheduledDate(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "inbox" }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		if u.ScheduledDate == nil || u.ScheduledDate.UTC().Format("2006-01-02") != "2026-07-30" {
			t.Fatalf("scheduledDate wrong: %v", u.ScheduledDate)
		}
		sd := time.Date(2026, 7, 30, 0, 0, 0, 0, time.UTC)
		return baseRow(func(g *model.GtdItem) { g.Status = "calendar"; g.ScheduledDate = &sd }), nil
	}
	svc, _, _ := newSvc(fake)
	status := "calendar"
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status, ScheduledDate: oStr("2026-07-30")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateRejectsInvalidDate(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "inbox" }), nil
	}
	svc, _, _ := newSvc(fake)
	status := "calendar"
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status, ScheduledDate: oStr("2026-02-30")})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindBadRequest {
		t.Fatalf("expected bad request, got %v", err)
	}
}

func TestUpdateNotFoundWhenMissing(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return nil, pgx.ErrNoRows
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.Update(context.Background(), gUser, 999, UpdateDTO{})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestRemoveDeletesExisting(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(nil), nil
	}
	var deleted int64
	fake.DeleteGtdItemFn = func(ctx context.Context, userID int64, id int64) error { deleted = id; return nil }
	svc, _, _ := newSvc(fake)
	res, err := svc.Remove(context.Background(), gUser, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.ID != 5 || deleted != 5 {
		t.Fatalf("got res=%+v deleted=%d", res, deleted)
	}
}

func TestRemoveNotFoundWhenMissing(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return nil, pgx.ErrNoRows
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.Remove(context.Background(), gUser, 999)
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestCreateForDateBacklogPlanned(t *testing.T) {
	fake := &storetest.Fake{}
	max := 2
	fake.MaxGtdOrderFn = func(ctx context.Context, userID int64) (*int, error) { return &max, nil }
	fake.CreateGtdItemFn = func(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) {
			g.Title = title
			g.Status = status
			g.Order = order
			g.PlannedDate = plannedDate
		}), nil
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.CreateForDate(context.Background(), gUser, "Сделать презу", "2026-07-23")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	fake.MaxGtdOrderFn = func(ctx context.Context, userID int64) (*int, error) { return &max, nil } // no-op
}

func TestGetForDateQueryExcludesArchived(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListGtdItemsForDateFn = func(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error) {
		if date.UTC().Format("2006-01-02") != "2026-07-23" {
			t.Fatalf("wrong date: %v", date)
		}
		return nil, nil
	}
	svc, _, _ := newSvc(fake)
	_, err := svc.GetForDate(context.Background(), gUser, "2026-07-23")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateReferenceSyncsObsidian(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "inbox" }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "reference"; g.Notes = &[]string{"x"}[0] }), nil
	}
	svc, obs, _ := newSvc(fake)
	status := "reference"
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if obs.syncCalls != 1 || obs.lastItem.Status != "reference" {
		t.Fatalf("obsidian sync calls=%d", obs.syncCalls)
	}
}

func TestUpdateReminderOnDueDate(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog" }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		d := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog"; g.DueDate = &d }), nil
	}
	svc, _, icl := newSvc(fake)
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{DueDate: oStr("2026-08-01")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if icl.syncCalls != 1 || icl.lastDue == nil || icl.lastDue.Date != "2026-08-01" {
		t.Fatalf("icloud sync calls=%d due=%+v", icl.syncCalls, icl.lastDue)
	}
}

func TestUpdateRemovesReminderWhenDueDisappears(t *testing.T) {
	fake := &storetest.Fake{}
	d := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog"; g.DueDate = &d }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		if !u.DueDateNull {
			t.Fatalf("expected DueDateNull")
		}
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog"; g.DueDate = nil }), nil
	}
	svc, _, icl := newSvc(fake)
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{DueDate: oNull()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if icl.removeCalls != 1 {
		t.Fatalf("expected removeReminder, got %d", icl.removeCalls)
	}
}

func TestUpdateDeferCountBacklogToBacklog(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindGtdItemByIDFn = func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog"; g.DeferCount = 2 }), nil
	}
	fake.UpdateGtdItemFn = func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
		if u.DeferCount == nil || *u.DeferCount != 3 {
			t.Fatalf("deferCount not incremented: %v", u.DeferCount)
		}
		return baseRow(func(g *model.GtdItem) { g.Status = "backlog"; g.DeferCount = 3 }), nil
	}
	svc, _, _ := newSvc(fake)
	status := "backlog"
	_, err := svc.Update(context.Background(), gUser, 1, UpdateDTO{Status: &status})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func oStr(s string) opt.String {
	v := s
	return opt.String{Set: true, Value: &v}
}

func oNull() opt.String {
	return opt.String{Set: true, Value: nil}
}
