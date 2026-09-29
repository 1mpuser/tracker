package categories

import (
	"context"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

func TestCreateAssignsNextOrder(t *testing.T) {
	fake := &storetest.Fake{}
	max := 3
	fake.MaxCategoryOrderFn = func(ctx context.Context, userID int64) (*int, error) {
		return &max, nil
	}
	fake.FindCategoryByKeyFn = func(ctx context.Context, userID int64, key string) (*model.Category, error) {
		return nil, nil
	}
	var gotKey, gotLabel string
	var gotOrder int
	fake.CreateCategoryFn = func(ctx context.Context, userID int64, key, label string, order int) (*model.Category, error) {
		gotKey, gotLabel, gotOrder = key, label, order
		return &model.Category{ID: 1, Key: key, Label: label, Order: order, UserID: userID}, nil
	}
	svc := NewService(fake)
	_, err := svc.Create(context.Background(), 1, CreateDTO{Key: "reading", Label: "Чтение"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotKey != "reading" || gotLabel != "Чтение" || gotOrder != 4 {
		t.Fatalf("got %q %q order=%d", gotKey, gotLabel, gotOrder)
	}
}

func TestCreateConflictOnExistingKey(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindCategoryByKeyFn = func(ctx context.Context, userID int64, key string) (*model.Category, error) {
		return &model.Category{ID: 1, Key: key}, nil
	}
	svc := NewService(fake)
	_, err := svc.Create(context.Background(), 1, CreateDTO{Key: "sport", Label: "Спорт"})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindConflict {
		t.Fatalf("expected conflict, got %v", err)
	}
}

func TestUpdateNotFoundWhenUnknown(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindCategoryByKeyFn = func(ctx context.Context, userID int64, key string) (*model.Category, error) {
		return nil, pgx.ErrNoRows
	}
	svc := NewService(fake)
	_, err := svc.Update(context.Background(), 1, "ghost", UpdateDTO{Label: strPtr("x")})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestFindActiveScopesAndExcludesArchived(t *testing.T) {
	fake := &storetest.Fake{}
	var gotUserID int64
	fake.ListActiveCategoriesFn = func(ctx context.Context, userID int64) ([]model.Category, error) {
		gotUserID = userID
		return []model.Category{{ID: 1, Key: "sport"}}, nil
	}
	svc := NewService(fake)
	got, err := svc.FindActive(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotUserID != 1 || len(got) != 1 {
		t.Fatalf("got userID=%d len=%d", gotUserID, len(got))
	}
}

func strPtr(s string) *string { return &s }
