package tasktemplates

import (
	"context"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

func TestCreateAssignsNextOrder(t *testing.T) {
	fake := &storetest.Fake{}
	zero := 0
	fake.MaxTaskTemplateOrderFn = func(ctx context.Context, userID int64) (*int, error) {
		return &zero, nil
	}
	var gotText string
	var gotOrder int
	fake.CreateTaskTemplateFn = func(ctx context.Context, userID int64, text string, order int) (*model.TaskTemplate, error) {
		gotText, gotOrder = text, order
		return &model.TaskTemplate{ID: 1, Text: text, Order: order}, nil
	}
	svc := NewService(fake)
	_, err := svc.Create(context.Background(), 1, "Тренировка")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotText != "Тренировка" || gotOrder != 1 {
		t.Fatalf("got text=%q order=%d", gotText, gotOrder)
	}
}

func TestUpdateNotFoundWhenMissing(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindTaskTemplateByIDFn = func(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error) {
		return nil, pgx.ErrNoRows
	}
	svc := NewService(fake)
	_, err := svc.Update(context.Background(), 1, 999, store.TaskTemplateUpdate{})
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestRemoveNotFoundWhenMissing(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindTaskTemplateByIDFn = func(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error) {
		return nil, pgx.ErrNoRows
	}
	svc := NewService(fake)
	_, err := svc.Remove(context.Background(), 1, 999)
	if err == nil || err.(*apperr.Error).Kind != apperr.KindNotFound {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestFindAllScopesToUser(t *testing.T) {
	fake := &storetest.Fake{}
	var got int64
	fake.ListTaskTemplatesFn = func(ctx context.Context, userID int64) ([]model.TaskTemplate, error) {
		got = userID
		return nil, nil
	}
	svc := NewService(fake)
	_, err := svc.FindAll(context.Background(), 1)
	if err != nil || got != 1 {
		t.Fatalf("got userID=%d err=%v", got, err)
	}
}
