package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
)

func deliverySvc(fake *storetest.Fake, sendResult func() any) (*DeliveryService, *int64) {
	var calls int64
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		_ = json.NewEncoder(w).Encode(sendResult())
	})
	srv := httptest.NewServer(handler)
	client := NewClient(nil)
	client.baseURL = srv.URL + "/bot"
	configSvc := NewConfigService(fake, client, encKey, crypto.EncryptSecret, crypto.DecryptSecret)
	return NewDeliveryService(fake, configSvc, client), &calls
}

func deliveryStore(token string, day *model.Day) *storetest.Fake {
	fake := &storetest.Fake{}
	if token != "" {
		enc, _ := crypto.EncryptSecret(token, encKey)
		fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
			return &model.Settings{UserID: 1, TelegramBotToken: &enc}, nil
		}
	} else {
		fake.FindSettingsFn = func(ctx context.Context, userID int64) (*model.Settings, error) {
			return &model.Settings{UserID: 1}, nil
		}
	}
	fake.ListTelegramChatsFn = func(ctx context.Context, userID int64) ([]model.TelegramChat, error) {
		return []model.TelegramChat{
			{ID: 1, ChatID: "-1001", Daily: true, Weekly: true},
			{ID: 2, ChatID: "-1002", Daily: true, Weekly: true},
		}, nil
	}
	fake.FindDayByIDFn = func(ctx context.Context, id int64) (*model.Day, error) {
		if day != nil {
			return day, nil
		}
		return &model.Day{ID: id}, nil
	}
	return fake
}

func okResult() any {
	return map[string]any{"ok": true, "result": map[string]any{"message_id": 100}}
}

func failResult() any {
	return map[string]any{"ok": false, "description": "429 Too Many Requests"}
}

func TestDeliverDaySendsToAllChats(t *testing.T) {
	fake := deliveryStore("123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y", nil)
	var updated []string
	fake.CreateTelegramPostFn = func(ctx context.Context, dayID int64, chatID, kind string, messageID int) (*model.TelegramPost, error) {
		return &model.TelegramPost{ID: int64(len(updated) + 1), DayID: dayID, ChatID: chatID, Kind: kind, MessageID: messageID}, nil
	}
	fake.UpdateTelegramPostMsgIDFn = func(ctx context.Context, id int64, messageID int) error {
		updated = append(updated, "")
		return nil
	}
	svc, calls := deliverySvc(fake, okResult)
	err := svc.DeliverDay(context.Background(), 1, 7, days.DayView{Date: "2026-08-14", Pomodoros: 4})
	if err != nil {
		t.Fatalf("deliver: %v", err)
	}
	if *calls != 2 {
		t.Fatalf("send calls=%d, want 2", *calls)
	}
	if len(updated) != 2 {
		t.Fatalf("posts updated=%d, want 2", len(updated))
	}
}

func TestDeliverDayLegacySkip(t *testing.T) {
	legacy := 55
	day := &model.Day{ID: 7, TelegramMessageID: &legacy}
	fake := deliveryStore("123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y", day)
	svc, calls := deliverySvc(fake, okResult)
	if err := svc.DeliverDay(context.Background(), 1, 7, days.DayView{Date: "2026-08-14"}); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	if *calls != 0 {
		t.Fatalf("при легаси-отправке не должно быть новых send, got %d", *calls)
	}
}

func TestDeliverDayReleaseOnFailure(t *testing.T) {
	fake := deliveryStore("123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y", nil)
	fake.CreateTelegramPostFn = func(ctx context.Context, dayID int64, chatID, kind string, messageID int) (*model.TelegramPost, error) {
		return &model.TelegramPost{ID: 1, DayID: dayID, ChatID: chatID, Kind: kind, MessageID: messageID}, nil
	}
	deleted := int64(0)
	fake.DeleteTelegramPostFn = func(ctx context.Context, id int64) error {
		atomic.AddInt64(&deleted, 1)
		return nil
	}
	// сервер сначала молчит, потом отдаёт ошибку — просто всегда fail
	svc, calls := deliverySvc(fake, failResult)
	if err := svc.DeliverDay(context.Background(), 1, 7, days.DayView{Date: "2026-08-14"}); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	if *calls != 2 || deleted != 2 {
		t.Fatalf("calls=%d deleted=%d, want 2/2", *calls, deleted)
	}
}

func TestDeliverDayIdempotencySkipsClaimed(t *testing.T) {
	fake := deliveryStore("123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y", nil)
	fake.CreateTelegramPostFn = func(ctx context.Context, dayID int64, chatID, kind string, messageID int) (*model.TelegramPost, error) {
		// Первый чат успешен, второй занят (unique violation).
		if chatID == "-1002" {
			return nil, store.ErrUniqueViolation
		}
		return &model.TelegramPost{ID: 1, DayID: dayID, ChatID: chatID, Kind: kind, MessageID: messageID}, nil
	}
	fake.UpdateTelegramPostMsgIDFn = func(ctx context.Context, id int64, messageID int) error { return nil }
	svc, calls := deliverySvc(fake, okResult)
	report, err := svc.DeliverWeek(context.Background(), 1, 7, "текст", nil)
	if err != nil {
		t.Fatalf("deliver: %v", err)
	}
	if report.Sent != 1 || report.Skipped != 1 || *calls != 1 {
		t.Fatalf("report=%+v calls=%d", report, *calls)
	}
}

func TestDeliverNoTokenNoSend(t *testing.T) {
	fake := deliveryStore("", nil)
	svc, calls := deliverySvc(fake, okResult)
	if err := svc.DeliverDay(context.Background(), 1, 7, days.DayView{Date: "2026-08-14"}); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	if *calls != 0 {
		t.Fatalf("без токена не должно быть send, got %d", *calls)
	}
}
