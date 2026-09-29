package auth

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"golang.org/x/crypto/scrypt"
)

func makeCfg() config.AuthConfig {
	return config.AuthConfig{CookieSecure: false, SessionDays: 30}
}

func mkUser(id int64, email string, hash string, opts ...func(*model.User)) *model.User {
	u := &model.User{ID: id, Email: email, Timezone: "UTC"}
	if hash != "" {
		h := hash
		u.PasswordHash = &h
	}
	for _, o := range opts {
		o(u)
	}
	return u
}

func blocked(u *model.User) {
	t := time.Now()
	u.BlockedAt = &t
}

func newService(f *storetest.Fake) *Service {
	return NewService(f, makeCfg())
}

func TestLoginUnauthorizedCases(t *testing.T) {
	f := &storetest.Fake{}
	svc := newService(f)
	ctx := context.Background()

	// Несуществующий адрес.
	if _, err := svc.Login(ctx, "a@b.c", "password123", Meta{}); !isKind(err, apperr.KindUnauthorized) {
		t.Fatalf("ожидался 401 на несуществующий адрес, got %v", err)
	}

	// Неверный пароль.
	h, _ := HashPassword("right")
	f.FindUserByEmailFn = func(_ context.Context, _ string) (*model.User, error) {
		return mkUser(1, "a@b.c", h), nil
	}
	if _, err := svc.Login(ctx, "a@b.c", "wrongwrong", Meta{}); !isKind(err, apperr.KindUnauthorized) {
		t.Fatalf("ожидался 401 на неверный пароль, got %v", err)
	}

	// Null-хэш (учётка без пароля).
	f.FindUserByEmailFn = func(_ context.Context, _ string) (*model.User, error) {
		return mkUser(1, "a@b.c", ""), nil
	}
	if _, err := svc.Login(ctx, "a@b.c", "password123", Meta{}); !isKind(err, apperr.KindUnauthorized) {
		t.Fatalf("ожидался 401 на null-хэш, got %v", err)
	}
}

func TestLoginSuccessCreatesSession(t *testing.T) {
	h, _ := HashPassword("rightpass123")
	var createdTokenHash string
	var createdUserID int64
	f := &storetest.Fake{}
	f.FindUserByEmailFn = func(_ context.Context, email string) (*model.User, error) {
		if email != "a@b.c" {
			t.Fatalf("почта должна быть нормализована, got %q", email)
		}
		return mkUser(7, "a@b.c", h), nil
	}
	f.CreateSessionFn = func(_ context.Context, userID int64, tokenHash string, _ time.Time, _ *string) error {
		createdUserID = userID
		createdTokenHash = tokenHash
		return nil
	}

	svc := newService(f)
	res, err := svc.Login(context.Background(), "A@B.C", "rightpass123", Meta{})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if res.User.ID != 7 || res.User.Email != "a@b.c" {
		t.Fatalf("неверный пользователь: %+v", res.User)
	}
	if createdUserID != 7 || createdTokenHash == "" {
		t.Fatalf("сессия не создана: userID=%d tokenHash=%q", createdUserID, createdTokenHash)
	}
	if res.SessionToken == "" {
		t.Fatal("нет токена сессии")
	}
}

func TestLoginBlocked(t *testing.T) {
	h, _ := HashPassword("rightpass123")
	f := &storetest.Fake{}
	f.FindUserByEmailFn = func(_ context.Context, _ string) (*model.User, error) {
		return mkUser(7, "a@b.c", h, blocked), nil
	}
	var created bool
	f.CreateSessionFn = func(_ context.Context, _ int64, _ string, _ time.Time, _ *string) error {
		created = true
		return nil
	}
	svc := newService(f)
	if _, err := svc.Login(context.Background(), "a@b.c", "rightpass123", Meta{}); !isKind(err, apperr.KindUnauthorized) {
		t.Fatalf("ожидался 401 на заблокированную учётку, got %v", err)
	}
	if created {
		t.Fatal("заблокированной учётке сессия не создаётся")
	}
}

func TestLoginRehashOnOldParams(t *testing.T) {
	// Валидный хэш со старыми параметрами (N=16384): verify проходит по ним,
	// а NeedsRehash требует обновления до N=32768.
	legacy := legacyHash("rightpass123", "3341b0b6c58b0d51")
	f := &storetest.Fake{}
	f.FindUserByEmailFn = func(_ context.Context, _ string) (*model.User, error) {
		return mkUser(7, "a@b.c", legacy), nil
	}
	f.UpdateUserPasswordHashFn = func(_ context.Context, _ int64, hash string) error {
		if NeedsRehash(hash) {
			t.Fatalf("новый хэш должен быть с актуальными параметрами, got %q", hash)
		}
		return nil
	}
	svc := newService(f)
	if _, err := svc.Login(context.Background(), "a@b.c", "rightpass123", Meta{}); err != nil {
		t.Fatalf("login: %v", err)
	}
}

func TestChangePasswordWrongCurrent(t *testing.T) {
	h, _ := HashPassword("rightpass1")
	f := &storetest.Fake{}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c", h), nil
	}
	svc := newService(f)
	err := svc.ChangePassword(context.Background(), 1, "wrongpass1", "newpass123", "curtok")
	if !isKind(err, apperr.KindBadRequest) {
		t.Fatalf("ожидался 400 на неверный текущий пароль, got %v", err)
	}
}

func TestChangePasswordSuccess(t *testing.T) {
	h, _ := HashPassword("oldpass123")
	var updatedHash, deletedExcept string
	f := &storetest.Fake{}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c", h), nil
	}
	f.UpdateUserPasswordHashFn = func(_ context.Context, _ int64, hash string) error {
		updatedHash = hash
		return nil
	}
	f.DeleteSessionsByUserExceptFn = func(_ context.Context, _ int64, tokenHash string) error {
		deletedExcept = tokenHash
		return nil
	}
	svc := newService(f)
	if err := svc.ChangePassword(context.Background(), 1, "oldpass123", "newpass123", "current-token"); err != nil {
		t.Fatalf("changePassword: %v", err)
	}
	if updatedHash == "" || updatedHash[:7] != "scrypt$" {
		t.Fatalf("пароль не обновлён: %q", updatedHash)
	}
	if deletedExcept != sha256Hex("current-token") {
		t.Fatalf("должны удаляться все сессии, кроме %q, got %q", sha256Hex("current-token"), deletedExcept)
	}
}

func TestResolveSessionExpired(t *testing.T) {
	f := &storetest.Fake{}
	f.FindSessionByTokenHashFn = func(_ context.Context, _ string) (*model.Session, error) {
		return &model.Session{ID: 1, UserID: 3, ExpiresAt: time.Now().Add(-time.Second), LastSeenAt: time.Now()}, nil
	}
	svc := newService(f)
	res, err := svc.ResolveSession(context.Background(), "tok")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res != nil {
		t.Fatal("просроченная сессия должна давать nil")
	}
}

func TestResolveSessionNoRenew(t *testing.T) {
	f := &storetest.Fake{}
	f.FindSessionByTokenHashFn = func(_ context.Context, _ string) (*model.Session, error) {
		return &model.Session{ID: 1, UserID: 3, ExpiresAt: time.Now().Add(time.Hour), LastSeenAt: time.Now().Add(-time.Hour)}, nil
	}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(3, "a@b.c", ""), nil
	}
	var updated bool
	f.UpdateSessionFn = func(_ context.Context, _ int64, _, _ time.Time) error {
		updated = true
		return nil
	}
	svc := newService(f)
	res, err := svc.ResolveSession(context.Background(), "tok")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res == nil || res.RenewExpiresAt {
		t.Fatalf("при активности < суток срок не продлевается: %+v", res)
	}
	if updated {
		t.Fatal("сессия не должна обновляться")
	}
	if res.User.Email != "a@b.c" {
		t.Fatalf("неверный пользователь: %+v", res.User)
	}
}

func TestResolveSessionRenews(t *testing.T) {
	f := &storetest.Fake{}
	f.FindSessionByTokenHashFn = func(_ context.Context, _ string) (*model.Session, error) {
		return &model.Session{ID: 1, UserID: 3, ExpiresAt: time.Now().Add(time.Hour), LastSeenAt: time.Now().Add(-48 * time.Hour)}, nil
	}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(3, "a@b.c", ""), nil
	}
	var renewExpiry time.Time
	f.UpdateSessionFn = func(_ context.Context, _ int64, _, expiresAt time.Time) error {
		renewExpiry = expiresAt
		return nil
	}
	svc := newService(f)
	res, err := svc.ResolveSession(context.Background(), "tok")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res == nil || !res.RenewExpiresAt {
		t.Fatalf("ожидалось продление: %+v", res)
	}
	min := time.Now().Add(29 * 24 * time.Hour)
	if renewExpiry.Before(min) {
		t.Fatalf("expiresAt должен ~sessionLifetime, got %v", renewExpiry)
	}
}

func TestResolveSessionBlocked(t *testing.T) {
	f := &storetest.Fake{}
	f.FindSessionByTokenHashFn = func(_ context.Context, _ string) (*model.Session, error) {
		return &model.Session{ID: 1, UserID: 3, ExpiresAt: time.Now().Add(time.Hour), LastSeenAt: time.Now()}, nil
	}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(3, "a@b.c", "", blocked), nil
	}
	svc := newService(f)
	res, err := svc.ResolveSession(context.Background(), "tok")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res != nil {
		t.Fatal("заблокированный пользователь не должен получать живой сессии")
	}
}

func TestMe(t *testing.T) {
	f := &storetest.Fake{}
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(3, "a@b.c", ""), nil
	}
	svc := newService(f)
	u, err := svc.Me(context.Background(), 3)
	if err != nil {
		t.Fatalf("me: %v", err)
	}
	if u.ID != 3 || u.Email != "a@b.c" {
		t.Fatalf("me: %+v", u)
	}
}

func TestUpdateTimezoneInvalid(t *testing.T) {
	f := &storetest.Fake{}
	svc := newService(f)
	if _, err := svc.UpdateTimezone(context.Background(), 1, "Europe/Moskow"); !isKind(err, apperr.KindBadRequest) {
		t.Fatalf("неизвестный пояс должен давать 400, got %v", err)
	}
}

func TestUpdateTimezoneValid(t *testing.T) {
	f := &storetest.Fake{}
	f.UpdateUserTimezoneFn = func(_ context.Context, _ int64, _ string) error { return nil }
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		return mkUser(1, "a@b.c", ""), nil
	}
	svc := newService(f)
	// После update сервис перечитывает пользователя — подмена возвращает пояс.
	f.FindUserByIDFn = func(_ context.Context, _ int64) (*model.User, error) {
		u := mkUser(1, "a@b.c", "")
		u.Timezone = "Europe/Moscow"
		return u, nil
	}
	u, err := svc.UpdateTimezone(context.Background(), 1, "Europe/Moscow")
	if err != nil {
		t.Fatalf("update timezone: %v", err)
	}
	if u.Timezone != "Europe/Moscow" {
		t.Fatalf("timezone не обновлён: %+v", u)
	}
}

func isKind(err error, kind apperr.Kind) bool {
	if err == nil {
		return false
	}
	ae, ok := err.(*apperr.Error)
	return ok && ae.Kind == kind
}

func legacyHash(password, saltPlain string) string {
	salt := []byte(saltPlain)
	key, err := scrypt.Key([]byte(password), salt, 16384, 8, 1, 64)
	if err != nil {
		panic(err)
	}
	return "scrypt$16384$8$1$" + base64.StdEncoding.EncodeToString(salt) + "$" + base64.StdEncoding.EncodeToString(key)
}
