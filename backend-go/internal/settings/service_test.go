package settings

import (
	"context"
	"errors"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

type fakeFlags struct {
	icloud  bool
	session bool
}

func (f *fakeFlags) ICloudConfigured(ctx context.Context, userID int64) (bool, error) {
	return f.icloud, nil
}
func (f *fakeFlags) SessionSyncEnabled(ctx context.Context, userID int64) (bool, error) {
	return f.session, nil
}

func row(overrides map[string]any) *model.Settings {
	s := &model.Settings{
		ID: 1, UserID: 1, DistractionBudget: 60, DistractionLabel: "Залипание", NotificationsEnabled: false,
	}
	for k, v := range overrides {
		switch k {
		case "distractionBudget":
			s.DistractionBudget = v.(int)
		case "distractionLabel":
			s.DistractionLabel = v.(string)
		case "notificationsEnabled":
			s.NotificationsEnabled = v.(bool)
		}
	}
	return s
}

func TestGetExposesFlags(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return row(nil), nil
	}
	svc := NewService(fake, &fakeFlags{icloud: true, session: true}, false)
	v, err := svc.Get(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !v.IcloudEnabled || !v.SessionSyncEnabled || v.ObsidianEnabled {
		t.Fatalf("flags wrong: %+v", v)
	}
	if v.DistractionBudget != 60 || v.DistractionLabel != "Залипание" {
		t.Fatalf("row wrong: %+v", v)
	}
}

func TestGetReportsFalseWhenIntegrationsOff(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return row(nil), nil
	}
	svc := NewService(fake, &fakeFlags{icloud: false, session: false}, false)
	v, err := svc.Get(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.IcloudEnabled || v.SessionSyncEnabled {
		t.Fatalf("expected disabled, got %+v", v)
	}
}

func TestUpdateKeepsFlags(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return row(nil), nil
	}
	budget := 90
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		return row(map[string]any{"distractionBudget": *u.DistractionBudget}), nil
	}
	svc := NewService(fake, &fakeFlags{icloud: true, session: true}, true)
	v, err := svc.Update(context.Background(), 1, UpdateDTO{DistractionBudget: &budget})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.DistractionBudget != 90 || !v.IcloudEnabled || !v.ObsidianEnabled {
		t.Fatalf("got %+v", v)
	}
}

func TestUpdatePassesLabelThrough(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return row(nil), nil
	}
	label := "Шортсы"
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		return row(map[string]any{"distractionLabel": *u.DistractionLabel}), nil
	}
	svc := NewService(fake, &fakeFlags{}, false)
	v, err := svc.Update(context.Background(), 1, UpdateDTO{DistractionLabel: &label})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.DistractionLabel != "Шортсы" {
		t.Fatalf("got %q", v.DistractionLabel)
	}
}

func TestGetCreatesRowWhenMissing(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return nil, pgx.ErrNoRows
	}
	fake.CreateSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return row(nil), nil
	}
	svc := NewService(fake, &fakeFlags{}, false)
	v, err := svc.Get(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.DistractionBudget != 60 {
		t.Fatalf("got %+v", v)
	}
}

func TestResolverIcloudConfigured(t *testing.T) {
	fake := &storetest.Fake{}
	appleID := "a@b.c"
	enc := "enc:v1:x"
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: userID, IcloudAppleID: &appleID, IcloudAppPasswordEnc: &enc}, nil
	}
	decrypt := func(stored, key string) (string, error) { return "pw", nil }
	res := NewResolver(fake, "key", decrypt)
	ok, err := res.ICloudConfigured(context.Background(), 1)
	if err != nil || !ok {
		t.Fatalf("icloud should be configured: %v %v", ok, err)
	}
	// неудачная расшифровка → не настроено
	decryptFail := func(stored, key string) (string, error) { return "", errors.New("bad") }
	res2 := NewResolver(fake, "key", decryptFail)
	ok, err = res2.ICloudConfigured(context.Background(), 1)
	if err != nil || ok {
		t.Fatalf("should be unconfigured: %v %v", ok, err)
	}
}
