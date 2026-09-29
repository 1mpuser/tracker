package integrations

import (
	"context"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/caldav"
	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

const encKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

type fakeCaldav struct {
	clientErr  error
	calendar   *caldav.Calendar
	findErr    error
	forgotten  bool
	clientCall int
}

func (f *fakeCaldav) ClientFor(ctx context.Context, userID int64, creds caldav.Credentials) (*caldav.Client, error) {
	f.clientCall++
	return &caldav.Client{}, f.clientErr
}
func (f *fakeCaldav) FindCalendar(ctx context.Context, userID int64, creds caldav.Credentials, name string) (*caldav.Calendar, error) {
	return f.calendar, f.findErr
}
func (f *fakeCaldav) Forget(userID int64) { f.forgotten = true }

func newSvc(fake *storetest.Fake, cal *fakeCaldav) *Service {
	return NewService(fake, cal, encKey, crypto.EncryptSecret, crypto.DecryptSecret)
}

func TestICloudCredentialsNotConfigured(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1}, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	creds, err := svc.ICloudCredentials(context.Background(), 1)
	if err != nil || creds != nil {
		t.Fatalf("creds=%v err=%v", creds, err)
	}
}

func TestICloudCredentialsDecrypts(t *testing.T) {
	enc, _ := crypto.EncryptSecret("app-password", encKey)
	appleID := "user@icloud.com"
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1, IcloudAppleID: &appleID, IcloudAppPasswordEnc: &enc}, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	creds, err := svc.ICloudCredentials(context.Background(), 1)
	if err != nil || creds == nil {
		t.Fatalf("creds=%v err=%v", creds, err)
	}
	if creds.Username != appleID || creds.Password != "app-password" {
		t.Fatalf("creds=%+v", creds)
	}
}

func TestSetICloudStoresEncrypted(t *testing.T) {
	current := &model.Settings{UserID: 1, IcloudRemindersList: "GTD", SessionMinMinutes: 20}
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return current, nil
	}
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		if u.IcloudAppleID != nil {
			current.IcloudAppleID = u.IcloudAppleID
		}
		if u.IcloudAppPasswordEnc != nil {
			current.IcloudAppPasswordEnc = u.IcloudAppPasswordEnc
		}
		if u.IcloudRemindersList != nil {
			current.IcloudRemindersList = *u.IcloudRemindersList
		}
		return current, nil
	}
	cal := &fakeCaldav{calendar: &caldav.Calendar{URL: "x", DisplayName: "GTD"}}
	svc := newSvc(fake, cal)
	view, err := svc.SetICloud(context.Background(), 1, "  user@icloud.com  ", "app-password", "  GTD  ")
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if !view.Configured || view.AppleID == nil || *view.AppleID != "user@icloud.com" || view.RemindersList != "GTD" {
		t.Fatalf("view=%+v", view)
	}
	if current.IcloudAppPasswordEnc == nil || !crypto.IsEncrypted(*current.IcloudAppPasswordEnc) {
		t.Fatalf("пароль не зашифрован")
	}
	if !cal.forgotten {
		t.Fatal("кэш CalDAV не сброшен")
	}
}

func TestSetICloudBadLogin(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1}, nil
	}
	cal := &fakeCaldav{clientErr: caldav.ErrLoginFailed}
	svc := newSvc(fake, cal)
	if _, err := svc.SetICloud(context.Background(), 1, "u@e.com", "app-password", "GTD"); err == nil {
		t.Fatal("ожидалась ошибка входа")
	}
}

func TestClearICloudAlsoClearsSession(t *testing.T) {
	current := &model.Settings{UserID: 1, IcloudAppleID: str2("a"), IcloudAppPasswordEnc: str2("enc"), SessionCalendarName: str2("S")}
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return current, nil
	}
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		if u.IcloudAppleID != nil {
			current.IcloudAppleID = u.IcloudAppleID
		}
		if u.IcloudAppPasswordEnc != nil {
			current.IcloudAppPasswordEnc = u.IcloudAppPasswordEnc
		}
		if u.SessionCalendarName != nil {
			current.SessionCalendarName = u.SessionCalendarName
		}
		return current, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	if _, err := svc.ClearICloud(context.Background(), 1); err != nil {
		t.Fatalf("clear: %v", err)
	}
	// после очистки интеграция не настроена
	creds, _ := svc.ICloudCredentials(context.Background(), 1)
	if creds != nil {
		t.Fatal("креды должны быть очищены")
	}
}

func TestSetSessionRequiresICloud(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1}, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	if _, err := svc.SetSession(context.Background(), 1, "Session: focus", nil); err == nil {
		t.Fatal("без iCloud должен быть Conflict")
	}
}

func TestSetSessionValidatesCalendar(t *testing.T) {
	enc, _ := crypto.EncryptSecret("pw", encKey)
	appleID := "a@b.c"
	current := &model.Settings{UserID: 1, IcloudAppleID: &appleID, IcloudAppPasswordEnc: &enc, SessionMinMinutes: 20}
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return current, nil
	}
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		if u.SessionCalendarName != nil {
			current.SessionCalendarName = u.SessionCalendarName
		}
		if u.SessionMinMinutes != nil {
			current.SessionMinMinutes = *u.SessionMinMinutes
		}
		return current, nil
	}
	cal := &fakeCaldav{findErr: caldav.ErrCalendarNotFound}
	svc := newSvc(fake, cal)
	if _, err := svc.SetSession(context.Background(), 1, "NoSuch", nil); err == nil {
		t.Fatal("не найденный календарь должен давать ошибку")
	}
	cal.findErr = nil
	cal.calendar = &caldav.Calendar{URL: "s", DisplayName: "Session: focus"}
	view, err := svc.SetSession(context.Background(), 1, "Session: focus", intPtr(25))
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if !view.Configured || view.CalendarName == nil || *view.CalendarName != "Session: focus" || view.MinMinutes != 25 {
		t.Fatalf("view=%+v", view)
	}
}

func TestSessionSyncEnabledFlags(t *testing.T) {
	enc, _ := crypto.EncryptSecret("pw", encKey)
	appleID := "a@b.c"
	calName := "Session: focus"
	current := &model.Settings{UserID: 1, IcloudAppleID: &appleID, IcloudAppPasswordEnc: &enc, SessionCalendarName: &calName, SessionMinMinutes: 20}
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return current, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	ok, err := svc.SessionSyncEnabled(context.Background(), 1)
	if err != nil || !ok {
		t.Fatalf("sessionSyncEnabled=%v err=%v", ok, err)
	}
}

func TestGetSessionMissingRowCreates(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return nil, pgx.ErrNoRows
	}
	fake.CreateSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1, SessionMinMinutes: 20, IcloudRemindersList: "GTD"}, nil
	}
	svc := newSvc(fake, &fakeCaldav{})
	view, err := svc.GetSession(context.Background(), 1)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if view.Configured || view.ICloudConfigured || view.MinMinutes != 20 {
		t.Fatalf("view=%+v", view)
	}
}

func str2(s string) *string { return &s }
func intPtr(i int) *int     { return &i }
