package telegram

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const apiBase = "https://api.telegram.org/bot"

// SendResult — результат отправки сообщения (никогда не бросает).
type SendResult struct {
	OK        bool
	MessageID int
	Error     string
}

// BotInfo — результат getMe.
type BotInfo struct {
	OK       bool
	Username string
	Error    string
}

// ChatInfo — чат из апдейтов (getUpdates).
type ChatInfo struct {
	ChatID string
	Title  string
	Type   string
}

// Client — тупой HTTP-клиент Telegram Bot API. Не читает env, не знает «кому и
// когда слать»: токен и chatId передаются в каждый вызов. Методы не бросают —
// все ошибки в {OK:false, Error}, токен вырезается из сообщений.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// NewClient создаёт клиент. httpClient можно подменить в тестах.
func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 20 * time.Second}
	}
	return &Client{httpClient: httpClient, baseURL: apiBase}
}

func redactToken(msg, token string) string {
	if token == "" {
		return msg
	}
	return strings.ReplaceAll(msg, token, "<redacted>")
}

// GetMe — проверка токена и имя бота.
func (c *Client) GetMe(ctx context.Context, token string) BotInfo {
	try := func() (BotInfo, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+token+"/getMe", nil)
		if err != nil {
			return BotInfo{}, err
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return BotInfo{}, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return BotInfo{}, fmt.Errorf("getMe: %d %s", resp.StatusCode, string(body))
		}
		var body struct {
			OK          bool   `json:"ok"`
			Description string `json:"description"`
			Result      *struct {
				Username string `json:"username"`
			} `json:"result"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			return BotInfo{}, err
		}
		if !body.OK || body.Result == nil {
			return BotInfo{}, fmt.Errorf("getMe rejected: %s", orDefault(body.Description, "unknown error"))
		}
		return BotInfo{OK: true, Username: body.Result.Username}, nil
	}
	info, err := try()
	if err != nil {
		// Ошибка сети включает URL с токеном — вырезаем его и в логе, и в ответе.
		msg := redactToken(err.Error(), token)
		log.Printf("Telegram getMe failed: %s", msg)
		return BotInfo{OK: false, Error: msg}
	}
	return info
}

// GetUpdatesChats — чаты, которые бот видел в апдейтах последних ~24 часов.
// Уникальные по chatId; при ошибке — пустой список, чтобы discover не упал.
func (c *Client) GetUpdatesChats(ctx context.Context, token string) []ChatInfo {
	try := func() ([]ChatInfo, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+token+"/getUpdates", nil)
		if err != nil {
			return nil, err
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, nil
		}
		var body struct {
			OK     bool `json:"ok"`
			Result []struct {
				Message      *chatWrapper `json:"message"`
				ChannelPost  *chatWrapper `json:"channel_post"`
				MyChatMember *chatWrapper `json:"my_chat_member"`
			} `json:"result"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil || !body.OK {
			return nil, nil
		}
		seen := make(map[string]ChatInfo)
		for _, upd := range body.Result {
			var raw *chatLike
			switch {
			case upd.Message != nil:
				raw = &upd.Message.Chat
			case upd.ChannelPost != nil:
				raw = &upd.ChannelPost.Chat
			case upd.MyChatMember != nil:
				raw = &upd.MyChatMember.Chat
			}
			if raw == nil || raw.ID == "" {
				continue
			}
			chatID := string(raw.ID)
			if _, ok := seen[chatID]; ok {
				continue
			}
			title := raw.Title
			if title == "" {
				full := strings.TrimSpace(raw.FirstName + " " + raw.LastName)
				title = full
			}
			if title == "" {
				if raw.Username != "" {
					title = "@" + raw.Username
				} else {
					title = chatID
				}
			}
			seen[chatID] = ChatInfo{ChatID: chatID, Title: title, Type: raw.Type}
		}
		out := make([]ChatInfo, 0, len(seen))
		for _, c := range seen {
			out = append(out, c)
		}
		return out, nil
	}
	chats, err := try()
	if err != nil {
		log.Printf("Telegram getUpdatesChats failed: %s", redactToken(err.Error(), token))
		return nil
	}
	return chats
}

type chatLike struct {
	ID        chatID `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
}

type chatWrapper struct {
	Chat chatLike `json:"chat"`
}

// chatID принимает и число (-100…, 123), и строку (@username) — как String(id)
// в TS. Числовой id канала Telegram превышает 53 бита, поэтому храним строкой.
type chatID string

func (c *chatID) UnmarshalJSON(b []byte) error {
	var num json.Number
	if err := json.Unmarshal(b, &num); err == nil {
		*c = chatID(num.String())
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*c = chatID(s)
		return nil
	}
	*c = ""
	return nil
}

// SendText отправляет текстовое сообщение.
func (c *Client) SendText(ctx context.Context, token, chatID, text string) SendResult {
	body := map[string]any{"chat_id": chatID, "text": text, "parse_mode": "HTML"}
	return c.postJSON(ctx, token, "sendMessage", body)
}

// SendDaySummary отправляет дневную сводку (как sendDaySummary в TS).
func (c *Client) SendDaySummary(ctx context.Context, token, chatID string, day DaySummaryInput) SendResult {
	return c.SendText(ctx, token, chatID, BuildDaySummary(day))
}

// SendWeeklySummary отправляет недельную сводку с (необязательным) графиком.
// number — id опубликованного поста; без картинки уходит текстовый пост.
func (c *Client) SendWeeklySummary(ctx context.Context, token, chatID, text string, chartPngBase64 *string) SendResult {
	if chartPngBase64 == nil || *chartPngBase64 == "" {
		return c.SendText(ctx, token, chatID, text)
	}
	asCaption := FitsInCaption(text)
	form := &bytes.Buffer{}
	mw := multipart.NewWriter(form)
	_ = mw.WriteField("chat_id", chatID)
	if asCaption {
		_ = mw.WriteField("caption", text)
		_ = mw.WriteField("parse_mode", "HTML")
	}
	png, err := base64.StdEncoding.DecodeString(*chartPngBase64)
	if err != nil {
		return SendResult{OK: false, Error: "chartPng: невалидный base64"}
	}
	part, err := mw.CreateFormFile("photo", "week.png")
	if err != nil {
		return SendResult{OK: false, Error: err.Error()}
	}
	_, _ = part.Write(png)
	_ = mw.Close()

	try := func() (SendResult, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+token+"/sendPhoto", bytes.NewReader(form.Bytes()))
		if err != nil {
			return SendResult{}, err
		}
		req.Header.Set("Content-Type", mw.FormDataContentType())
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return SendResult{}, err
		}
		defer resp.Body.Close()
		return c.readResult(resp, "sendPhoto", token)
	}
	photoResult, err := try()
	if err != nil {
		msg := redactToken(err.Error(), token)
		log.Printf("Telegram sendPhoto failed: %s", msg)
		return SendResult{OK: false, Error: msg}
	}
	if !photoResult.OK {
		return photoResult
	}
	if asCaption {
		return photoResult
	}
	// Фото уже опубликовано. Если добивочный текст не дойдёт, это нельзя
	// превратить в ошибку: вызывающий трактует её как «ничего не отправлено»
	// и задвоит фото. Поэтому неудачу текста только логируем.
	textResult := c.SendText(ctx, token, chatID, text)
	if !textResult.OK {
		log.Printf("Telegram sendWeeklySummary: photo sent, follow-up caption text rejected: %s", textResult.Error)
	}
	return photoResult
}

func (c *Client) postJSON(ctx context.Context, token, method string, body any) SendResult {
	try := func() (SendResult, error) {
		raw, err := json.Marshal(body)
		if err != nil {
			return SendResult{}, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+token+"/"+method, bytes.NewReader(raw))
		if err != nil {
			return SendResult{}, err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return SendResult{}, err
		}
		defer resp.Body.Close()
		return c.readResult(resp, method, token)
	}
	res, err := try()
	if err != nil {
		msg := redactToken(err.Error(), token)
		log.Printf("Telegram %s failed: %s", method, msg)
		return SendResult{OK: false, Error: msg}
	}
	return res
}

func (c *Client) readResult(resp *http.Response, method, token string) (SendResult, error) {
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		msg := redactToken(fmt.Sprintf("%s failed: %d %s", method, resp.StatusCode, string(body)), token)
		log.Printf("Telegram %s", msg)
		return SendResult{OK: false, Error: msg}, nil
	}
	var body struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      *struct {
			MessageID int `json:"message_id"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return SendResult{}, err
	}
	if !body.OK || body.Result == nil {
		msg := redactToken(fmt.Sprintf("%s rejected: %s", method, orDefault(body.Description, "unknown error")), token)
		log.Printf("Telegram %s", msg)
		return SendResult{OK: false, Error: msg}, nil
	}
	return SendResult{OK: true, MessageID: body.Result.MessageID}, nil
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
