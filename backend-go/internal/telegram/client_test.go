package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testToken = "123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y"

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := NewClient(nil)
	c.baseURL = srv.URL + "/bot"
	return c
}

func TestGetMe(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/bot") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"username": "mytracker_bot"}})
	})
	info := client.GetMe(context.Background(), testToken)
	if !info.OK || info.Username != "mytracker_bot" {
		t.Fatalf("info=%+v", info)
	}
}

func TestGetMeRejected(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "description": "Unauthorized"})
	})
	info := client.GetMe(context.Background(), testToken)
	if info.OK || !strings.Contains(info.Error, "401") {
		t.Fatalf("info=%+v", info)
	}
	// Токен не должен протекать в ошибке даже при битом URL-пути.
	if strings.Contains(info.Error, testToken) {
		t.Fatalf("токен протек: %s", info.Error)
	}
}

func TestSendText(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"message_id": 42}})
	})
	res := client.SendText(context.Background(), testToken, "123", "hello")
	if !res.OK || res.MessageID != 42 {
		t.Fatalf("res=%+v", res)
	}
}

func TestSendTextFailureRedactsToken(t *testing.T) {
	// Сервер возвращает 500 с телом, где упомянут токен.
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		fmt.Fprintf(w, "bot %s exploded", testToken)
	})
	res := client.SendText(context.Background(), testToken, "123", "hello")
	if res.OK {
		t.Fatal("should fail")
	}
	if strings.Contains(res.Error, testToken) {
		t.Fatalf("токен протек: %s", res.Error)
	}
}

func TestGetUpdatesChatsDedups(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": []any{
			map[string]any{"message": map[string]any{"chat": map[string]any{"id": "-1001", "type": "channel", "title": "Канал X"}}},
			// дубликат chatId
			map[string]any{"channel_post": map[string]any{"chat": map[string]any{"id": "-1001", "type": "channel", "title": "Канал X"}}},
			map[string]any{"message": map[string]any{"chat": map[string]any{"id": 55, "type": "private", "first_name": "Иван", "username": "ivan"}}},
		}})
	})
	chats := client.GetUpdatesChats(context.Background(), testToken)
	if len(chats) != 2 {
		t.Fatalf("len=%d chats=%+v", len(chats), chats)
	}
	if chats[0].ChatID != "-1001" || chats[0].Title != "Канал X" {
		t.Fatalf("chats[0]=%+v", chats[0])
	}
}

func TestSendWeeklySummaryNoChart(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"message_id": 1}})
	})
	res := client.SendWeeklySummary(context.Background(), testToken, "123", "текст", nil)
	if !res.OK || res.MessageID != 1 {
		t.Fatalf("res=%+v", res)
	}
}

func TestSendWeeklySummaryWithCaption(t *testing.T) {
	var sawPhoto bool
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "sendPhoto") {
			sawPhoto = true
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"message_id": 7}})
			return
		}
		t.Fatalf("unexpected path %s", r.URL.Path)
	})
	// 1x1 PNG (4 байта + сигнатура), валидный base64
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	res := client.SendWeeklySummary(context.Background(), testToken, "123", "текст", &png)
	if !res.OK || res.MessageID != 7 || !sawPhoto {
		t.Fatalf("res=%+v sawPhoto=%v", res, sawPhoto)
	}
}

func TestSendWeeklySummaryLongCaptionSendsTextAfterPhoto(t *testing.T) {
	methods := []string{}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.URL.Path)
		// фото и текст возвращают ok
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"message_id": 8}})
	})
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	longText := strings.Repeat("x", TELEGRAM_CAPTION_LIMIT+1)
	res := client.SendWeeklySummary(context.Background(), testToken, "123", longText, &png)
	if !res.OK {
		t.Fatalf("res=%+v", res)
	}
	if len(methods) != 2 || !strings.Contains(methods[0], "sendPhoto") || !strings.Contains(methods[1], "sendMessage") {
		t.Fatalf("methods=%v", methods)
	}
}

var _ = io.Discard
