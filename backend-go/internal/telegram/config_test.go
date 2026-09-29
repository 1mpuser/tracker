package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/jackc/pgx/v5"
)

const encKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

func cfgSvc(fake *storetest.Fake) *ConfigService {
	httpClient := &http.Client{}
	client := NewClient(httpClient)
	// Не даём уйти в реальный Telegram в unit-тестах: без setBotToken getMe
	// вызывается только на проде. Здесь для наглядности используем httptest.
	return NewConfigService(fake, client, encKey, crypto.EncryptSecret, crypto.DecryptSecret)
}

func settingsRow() *model.Settings {
	return &model.Settings{ID: 1, UserID: 1, DistractionBudget: 60, IcloudRemindersList: "GTD", SessionMinMinutes: 20}
}

func TestResolveTokenEncrypted(t *testing.T) {
	enc, _ := crypto.EncryptSecret("123456789:AABBCCDDEEFFGG", encKey)
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1, TelegramBotToken: &enc}, nil
	}
	svc := cfgSvc(fake)
	tok, err := svc.ResolveToken(context.Background(), 1)
	if err != nil || tok == nil || *tok != "123456789:AABBCCDDEEFFGG" {
		t.Fatalf("tok=%v err=%v", tok, err)
	}
}

func TestResolveTokenPlainPassthrough(t *testing.T) {
	plain := "123456789:AABBCCDDEEFFGG"
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1, TelegramBotToken: &plain}, nil
	}
	svc := cfgSvc(fake)
	tok, err := svc.ResolveToken(context.Background(), 1)
	if err != nil || tok == nil || *tok != plain {
		t.Fatalf("tok=%v err=%v", tok, err)
	}
}

func TestResolveTokenBadKeyNil(t *testing.T) {
	enc, _ := crypto.EncryptSecret("secret", encKey)
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return &model.Settings{UserID: 1, TelegramBotToken: &enc}, nil
	}
	// сменённый ключ — расшифровка не удалась → nil, без ошибки
	svc := NewConfigService(fake, NewClient(nil), "Zm9vYmFyYmF6Zm9vYmFyYmF6Zm9vYg==", crypto.EncryptSecret, crypto.DecryptSecret)
	tok, err := svc.ResolveToken(context.Background(), 1)
	if err != nil || tok != nil {
		t.Fatalf("tok=%v err=%v", tok, err)
	}
}

func TestSetBotTokenValidatesAndEncrypts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"username": "abc_bot"}})
	}))
	defer srv.Close()
	client := NewClient(nil)
	client.baseURL = srv.URL + "/bot"

	fake := &storetest.Fake{}
	current := settingsRow()
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		return current, nil
	}
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		if u.TelegramBotToken != nil {
			current.TelegramBotToken = u.TelegramBotToken
		}
		return current, nil
	}
	svc := NewConfigService(fake, client, encKey, crypto.EncryptSecret, crypto.DecryptSecret)

	// невалидный формат
	if _, err := svc.SetBotToken(context.Background(), 1, "not-a-token"); err == nil {
		t.Fatal("ожидалась ошибка формата")
	}
	// валидный (≥30 символов после двоеточия)
	validToken := "123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y"
	view, err := svc.SetBotToken(context.Background(), 1, validToken)
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if !view.Configured || view.Username == nil || *view.Username != "abc_bot" {
		t.Fatalf("view=%+v", view)
	}
	if current.TelegramBotToken == nil || !crypto.IsEncrypted(*current.TelegramBotToken) {
		t.Fatalf("токен не зашифрован: %v", current.TelegramBotToken)
	}
	plain, err := crypto.DecryptSecret(*current.TelegramBotToken, encKey)
	if err != nil || plain != validToken {
		t.Fatalf("дешифр = %q err=%v", plain, err)
	}
}

func TestCreateChatDefaultsTrue(t *testing.T) {
	fake := &storetest.Fake{}
	fake.CreateTelegramChatFn = func(ctx context.Context, userID int64, title, chatID string, daily, weekly bool) (*model.TelegramChat, error) {
		return &model.TelegramChat{ID: 1, UserID: userID, Title: title, ChatID: chatID, Daily: daily, Weekly: weekly}, nil
	}
	svc := cfgSvc(fake)
	chat, err := svc.CreateChat(context.Background(), 1, CreateChatDTO{Title: "Канал", ChatID: "-1001"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !chat.Daily || !chat.Weekly {
		t.Fatalf("defaults wrong: %+v", chat)
	}
}

func TestCreateChatConflict(t *testing.T) {
	fake := &storetest.Fake{}
	fake.CreateTelegramChatFn = func(ctx context.Context, userID int64, title, chatID string, daily, weekly bool) (*model.TelegramChat, error) {
		return nil, store.ErrUniqueViolation
	}
	svc := cfgSvc(fake)
	if _, err := svc.CreateChat(context.Background(), 1, CreateChatDTO{Title: "Канал", ChatID: "-1001"}); err == nil {
		t.Fatal("ожидался конфликт")
	}
}

func TestUpdateChatNotFound(t *testing.T) {
	fake := &storetest.Fake{}
	fake.FindTelegramChatByIDFn = func(ctx context.Context, userID int64, id int64) (*model.TelegramChat, error) {
		return nil, pgx.ErrNoRows
	}
	svc := cfgSvc(fake)
	if _, err := svc.UpdateChat(context.Background(), 1, 999, UpdateChatDTO{}); err == nil {
		t.Fatal("ожидался 404")
	}
}

func TestRecipientsFilterByKind(t *testing.T) {
	fake := &storetest.Fake{}
	fake.ListTelegramChatsFn = func(ctx context.Context, userID int64) ([]model.TelegramChat, error) {
		return []model.TelegramChat{
			{ID: 1, ChatID: "daily-only", Daily: true, Weekly: false},
			{ID: 2, ChatID: "week-only", Daily: false, Weekly: true},
			{ID: 3, ChatID: "both", Daily: true, Weekly: true},
		}, nil
	}
	svc := cfgSvc(fake)
	day, _ := svc.Recipients(context.Background(), 1, "day")
	week, _ := svc.Recipients(context.Background(), 1, "week")
	if len(day) != 2 || len(week) != 2 {
		t.Fatalf("day=%v week=%v", day, week)
	}
}

func TestMigratePlainTokens(t *testing.T) {
	plain := "123456789:OLDTOKEN"
	fake := &storetest.Fake{}
	fake.ListUsersFn = func(ctx context.Context) ([]model.User, error) {
		return []model.User{{ID: 1}}, nil
	}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		if userID == 1 {
			return &model.Settings{UserID: 1, TelegramBotToken: &plain}, nil
		}
		return nil, pgx.ErrNoRows
	}
	var stored *string
	fake.UpdateSettingsFn = func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
		stored = u.TelegramBotToken
		return settingsRow(), nil
	}
	svc := cfgSvc(fake)
	if err := svc.MigratePlainTokens(context.Background()); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if stored == nil || !crypto.IsEncrypted(*stored) {
		t.Fatalf("не зашифрован: %v", stored)
	}
}

func TestIsConfiguredWeekDeliverer(t *testing.T) {
	// DeliveryService.IsConfigured проверяется через config + recipients.
	fake := &storetest.Fake{}
	fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
		enc, _ := crypto.EncryptSecret("123456789:AAA", encKey)
		return &model.Settings{UserID: 1, TelegramBotToken: &enc}, nil
	}
	fake.ListTelegramChatsFn = func(ctx context.Context, userID int64) ([]model.TelegramChat, error) {
		return []model.TelegramChat{{ID: 1, ChatID: "-1001", Weekly: true}}, nil
	}
	fake.FindDayByIDFn = func(ctx context.Context, id int64) (*model.Day, error) {
		return &model.Day{ID: id}, nil
	}
	client := NewClient(nil)
	configSvc := NewConfigService(fake, client, encKey, crypto.EncryptSecret, crypto.DecryptSecret)
	delivery := NewDeliveryService(fake, configSvc, client)
	if !delivery.IsConfigured(context.Background(), 1, "week") {
		t.Fatal("должен быть настроен")
	}
	if delivery.IsConfigured(context.Background(), 1, "day") {
		t.Fatal("нет daily-чатов")
	}
}
