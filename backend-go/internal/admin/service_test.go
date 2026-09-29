package admin

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/bootstrap"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func mkCtx(t *testing.T) (*storetest.Fake, *Service) {
	t.Helper()
	f := &storetest.Fake{}
	bootstrapSvc := bootstrap.NewService(f, 60)
	return f, NewService(f, bootstrapSvc)
}

func mkUser(id int64, email string, opts ...func(*model.User)) *model.User {
	u := &model.User{ID: id, Email: email, Timezone: "Europe/Moscow"}
	for _, o := range opts {
		o(u)
	}
	return u
}

func TestIsAdmin(t *testing.T) {
	f, svc := mkCtx(t)
	ctx := context.Background()

	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c", func(u *model.User) { u.IsAdmin = true }), nil
	}
	if ok, err := svc.IsAdmin(ctx, 1); err != nil || !ok {
		t.Fatalf("админ должен быть админом: ok=%v err=%v", ok, err)
	}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(2, "b@c.d"), nil
	}
	if ok, _ := svc.IsAdmin(ctx, 2); ok {
		t.Fatal("обычный юзер не должен быть админом")
	}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return nil, pgx.ErrNoRows
	}
	if ok, _ := svc.IsAdmin(ctx, 3); ok {
		t.Fatal("несуществующий юзер не должен быть админом")
	}
}

func TestCreateNormalizesAndDefaults(t *testing.T) {
	f, svc := mkCtx(t)
	ctx := context.Background()
	var receivedEmail, receivedTZ string
	var receivedHash *string
	f.CreateUserWithDefaultsFn = func(_ context.Context, email string, hash *string, timezone string, _ int) (*model.User, error) {
		receivedEmail = email
		receivedHash = hash
		receivedTZ = timezone
		u := mkUser(1, email)
		u.Timezone = timezone
		return u, nil
	}

	view, err := svc.Create(ctx, CreateDTO{Email: "  NEW@EXAMPLE.COM ", Password: "password123"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if receivedEmail != "new@example.com" {
		t.Fatalf("почта должна нормализоваться, got %q", receivedEmail)
	}
	if receivedTZ != "Europe/Moscow" {
		t.Fatalf("дефолтный пояс должен быть Europe/Moscow, got %q", receivedTZ)
	}
	if receivedHash == nil || len(*receivedHash) == 0 || (*receivedHash)[:7] != "scrypt$" {
		t.Fatalf("пароль должен быть захэширован: %v", receivedHash)
	}
	if view.Email != "new@example.com" || view.Timezone != "Europe/Moscow" {
		t.Fatalf("неверный view: %+v", view)
	}
}

func TestCreateDuplicateEmail(t *testing.T) {
	f, svc := mkCtx(t)
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, _ int) (*model.User, error) {
		return nil, &pgconn.PgError{Code: "23505"}
	}
	_, err := svc.Create(context.Background(), CreateDTO{Email: "taken@b.c", Password: "password123"})
	if !isKind(err, apperr.KindConflict) {
		t.Fatalf("занятая почта должна давать 409, got %v", err)
	}
}

func TestCreateInvalidTimezone(t *testing.T) {
	f, svc := mkCtx(t)
	called := false
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, _ int) (*model.User, error) {
		called = true
		return nil, nil
	}
	tz := "Europe/Moskow"
	_, err := svc.Create(context.Background(), CreateDTO{Email: "a@b.c", Password: "password123", Timezone: &tz})
	if !isKind(err, apperr.KindBadRequest) {
		t.Fatalf("неизвестный пояс должен давать 400, got %v", err)
	}
	if called {
		t.Fatal("пользователь не должен создаваться при неверном поясе")
	}
}

func TestCreateOtherErrorPropagates(t *testing.T) {
	f, svc := mkCtx(t)
	f.CreateUserWithDefaultsFn = func(_ context.Context, _ string, _ *string, _ string, _ int) (*model.User, error) {
		return nil, errors.New("boom")
	}
	if _, err := svc.Create(context.Background(), CreateDTO{Email: "a@b.c", Password: "password123"}); err == nil {
		t.Fatal("прочие ошибки должны пробрасываться")
	}
}

func TestChangePassword(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(5, "a@b.c"), nil
	}
	var updatedHash string
	f.UpdateUserPasswordHashFn = func(_ context.Context, _ int64, hash string) error {
		updatedHash = hash
		return nil
	}
	var deletedUser int64
	f.DeleteSessionsByUserFn = func(_ context.Context, userID int64) error {
		deletedUser = userID
		return nil
	}
	if err := svc.ChangePassword(context.Background(), 5, "brandnew789"); err != nil {
		t.Fatalf("changePassword: %v", err)
	}
	if updatedHash == "" || updatedHash[:7] != "scrypt$" {
		t.Fatalf("пароль не обновлён: %q", updatedHash)
	}
	if deletedUser != 5 {
		t.Fatalf("должны удалиться сессии учётки 5, got %d", deletedUser)
	}
}

func TestChangePasswordNotFound(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return nil, pgx.ErrNoRows
	}
	if err := svc.ChangePassword(context.Background(), 99, "brandnew789"); !isKind(err, apperr.KindNotFound) {
		t.Fatalf("несуществующий id должен давать 404, got %v", err)
	}
}

func TestBlock(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(5, "a@b.c"), nil
	}
	var blockedSet bool
	f.UpdateUserBlockedAtFn = func(_ context.Context, _ int64, blockedAt *time.Time) error {
		blockedSet = blockedAt != nil
		return nil
	}
	if err := svc.Block(context.Background(), 1, 5); err != nil {
		t.Fatalf("block: %v", err)
	}
	if !blockedSet {
		t.Fatal("blockedAt должен быть установлен")
	}
}

func TestBlockSelf(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c"), nil
	}
	var updated, deleted bool
	f.UpdateUserBlockedAtFn = func(_ context.Context, _ int64, _ *time.Time) error {
		updated = true
		return nil
	}
	f.DeleteSessionsByUserFn = func(_ context.Context, _ int64) error {
		deleted = true
		return nil
	}
	if err := svc.Block(context.Background(), 1, 1); !isKind(err, apperr.KindBadRequest) {
		t.Fatalf("себя заблокировать нельзя, got %v", err)
	}
	if updated || deleted {
		t.Fatal("ничего не должно писаться при блокировке себя")
	}
}

func TestUnblock(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(5, "a@b.c"), nil
	}
	var cleared bool
	f.UpdateUserBlockedAtFn = func(_ context.Context, _ int64, blockedAt *time.Time) error {
		cleared = blockedAt == nil
		return nil
	}
	if err := svc.Unblock(context.Background(), 5); err != nil {
		t.Fatalf("unblock: %v", err)
	}
	if !cleared {
		t.Fatal("blockedAt должен быть обнулён")
	}
}

func TestRemove(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(5, "a@b.c"), nil
	}
	var deleted int64
	f.DeleteUserFn = func(_ context.Context, id int64) error {
		deleted = id
		return nil
	}
	if err := svc.Remove(context.Background(), 1, 5); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if deleted != 5 {
		t.Fatalf("должен удалиться юзер 5, got %d", deleted)
	}
}

func TestRemoveSelf(t *testing.T) {
	f, svc := mkCtx(t)
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c"), nil
	}
	var deleted bool
	f.DeleteUserFn = func(_ context.Context, _ int64) error {
		deleted = true
		return nil
	}
	if err := svc.Remove(context.Background(), 1, 1); !isKind(err, apperr.KindBadRequest) {
		t.Fatalf("себя удалить нельзя, got %v", err)
	}
	if deleted {
		t.Fatal("пользователь не должен удалиться")
	}
}

func isKind(err error, kind apperr.Kind) bool {
	if err == nil {
		return false
	}
	ae, ok := err.(*apperr.Error)
	return ok && ae.Kind == kind
}
