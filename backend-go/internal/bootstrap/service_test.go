package bootstrap

import (
	"context"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestCreateUserPassesDefaults(t *testing.T) {
	f := &storetest.Fake{}
	var gotEmail, gotTZ string
	var gotHash *string
	var gotBudget int
	f.CreateUserWithDefaultsFn = func(_ context.Context, email string, hash *string, timezone string, budget int) (*model.User, error) {
		gotEmail, gotTZ, gotHash, gotBudget = email, timezone, hash, budget
		return &model.User{ID: 1, Email: email, Timezone: timezone}, nil
	}
	svc := NewService(f, 60)

	hash := "scrypt$32768$8$1$salt$hash"
	user, err := svc.CreateUser(context.Background(), CreateUserInput{Email: "a@b.c", PasswordHash: &hash, Timezone: "UTC"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if gotEmail != "a@b.c" || gotTZ != "UTC" || *gotHash != hash {
		t.Fatalf("неверные аргументы: email=%q tz=%q hash=%v", gotEmail, gotTZ, gotHash)
	}
	if gotBudget != 60 {
		t.Fatalf("бюджет должен быть 60, got %d", gotBudget)
	}
	if user.ID != 1 {
		t.Fatalf("user: %+v", user)
	}
}

func TestCreateUserEnvDefaultBudget(t *testing.T) {
	f := &storetest.Fake{}
	var gotBudget int
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, budget int) (*model.User, error) {
		gotBudget = budget
		return &model.User{ID: 2, Email: "a@b.c"}, nil
	}
	svc := NewService(f, 90)
	if _, err := svc.CreateUser(context.Background(), CreateUserInput{Email: "a@b.c", Timezone: "UTC"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if gotBudget != 90 {
		t.Fatalf("бюджет должен быть 90, got %d", gotBudget)
	}
}

func TestCreateUserBudgetFallback(t *testing.T) {
	f := &storetest.Fake{}
	var gotBudget int
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, budget int) (*model.User, error) {
		gotBudget = budget
		return &model.User{ID: 3, Email: "a@b.c"}, nil
	}
	// 0 — невалидный бюджет, должен откатиться на дефолт 60.
	svc := NewService(f, 0)
	if _, err := svc.CreateUser(context.Background(), CreateUserInput{Email: "a@b.c", Timezone: "UTC"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if gotBudget != 60 {
		t.Fatalf("бюджет должен откатиться на 60, got %d", gotBudget)
	}
}

func TestCreateUserRollsBackOnDuplicate(t *testing.T) {
	f := &storetest.Fake{}
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, _ int) (*model.User, error) {
		return nil, &pgconn.PgError{Code: "23505"}
	}
	svc := NewService(f, 60)
	if _, err := svc.CreateUser(context.Background(), CreateUserInput{Email: "taken@b.c", Timezone: "UTC"}); err == nil {
		t.Fatal("занятая почта должна возвращать ошибку")
	}
}
