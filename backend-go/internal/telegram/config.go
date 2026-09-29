package telegram

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/crypto"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

var tokenFormat = regexp.MustCompile(`^\d+:[A-Za-z0-9_-]{30,}$`)

const testMessage = "✅ Трекер подключён к этому чату"

// BotView — ответ GET /telegram/bot.
type BotView struct {
	Configured bool    `json:"configured"`
	Source     *string `json:"source"` // "db" or null
	Username   *string `json:"username"`
	TokenHint  *string `json:"tokenHint"`
}

// CreateChatDTO — POST /telegram/chats.
type CreateChatDTO struct {
	Title  string `json:"title"`
	ChatID string `json:"chatId"`
	Daily  *bool  `json:"daily"`
	Weekly *bool  `json:"weekly"`
}

// UpdateChatDTO — PATCH /telegram/chats/:id.
type UpdateChatDTO struct {
	Title  *string `json:"title"`
	Daily  *bool   `json:"daily"`
	Weekly *bool   `json:"weekly"`
}

// ConfigService — токен/чаты из Settings/TelegramChat пользователя. Токен
// шифруется (enc:v1:...), env-фоллбэков нет. Сменённый APP_ENCRYPTION_KEY не
// роняет запросы: не расшифровалось → бот считается не настроенным.
type ConfigService struct {
	store   store.Store
	client  *Client
	encKey  string
	encrypt func(plain, key string) (string, error)
	decrypt func(stored, key string) (string, error)
}

// NewConfigService создаёт конфиг-сервис. encrypt/decrypt — crypto-функции.
func NewConfigService(st store.Store, client *Client, encKey string, encrypt, decrypt func(string, string) (string, error)) *ConfigService {
	return &ConfigService{store: st, client: client, encKey: encKey, encrypt: encrypt, decrypt: decrypt}
}

func (s *ConfigService) settingsRow(ctx context.Context, userID int64) (*model.Settings, error) {
	row, err := s.store.FindSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return s.store.CreateSettings(ctx, userID)
		}
		return nil, err
	}
	return row, nil
}

// MigratePlainTokens — одноразовая миграция открытых токенов (оставшихся от
// однопользовательской версии) в зашифрованный вид. Значение в логи не пишется.
func (s *ConfigService) MigratePlainTokens(ctx context.Context) error {
	users, err := s.store.ListUsers(ctx)
	if err != nil {
		return err
	}
	for _, u := range users {
		row, err := s.store.FindSettings(ctx, u.ID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return err
		}
		if row.TelegramBotToken == nil || *row.TelegramBotToken == "" || crypto.IsEncrypted(*row.TelegramBotToken) {
			continue
		}
		enc, err := s.encrypt(*row.TelegramBotToken, s.encKey)
		if err != nil {
			return err
		}
		if _, err := s.store.UpdateSettings(ctx, u.ID, store.SettingsUpdate{TelegramBotToken: &enc}); err != nil {
			return err
		}
	}
	return nil
}

// ResolveToken возвращает расшифрованный токен или nil (не настроено/не
// расшифровалось).
func (s *ConfigService) ResolveToken(ctx context.Context, userID int64) (*string, error) {
	row, err := s.settingsRow(ctx, userID)
	if err != nil {
		return nil, err
	}
	stored := row.TelegramBotToken
	if stored == nil || *stored == "" {
		return nil, nil
	}
	if !crypto.IsEncrypted(*stored) {
		return stored, nil
	}
	plain, err := s.decrypt(*stored, s.encKey)
	if err != nil {
		// Токен в лог не пишем: только пользователь и факт расшифровки.
		return nil, nil
	}
	return &plain, nil
}

// Recipients — chatId чатов, включённых для kind ('day' | 'week').
func (s *ConfigService) Recipients(ctx context.Context, userID int64, kind string) ([]string, error) {
	chats, err := s.store.ListTelegramChats(ctx, userID)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, c := range chats {
		if kind == "week" {
			if c.Weekly {
				out = append(out, c.ChatID)
			}
		} else if c.Daily {
			out = append(out, c.ChatID)
		}
	}
	return out, nil
}

// GetBot — публичный образ бота (без токена).
func (s *ConfigService) GetBot(ctx context.Context, userID int64) (BotView, error) {
	token, err := s.ResolveToken(ctx, userID)
	if err != nil {
		return BotView{}, err
	}
	if token == nil {
		return BotView{Configured: false}, nil
	}
	me := s.client.GetMe(ctx, *token)
	hint := "…" + lastN(*token, 4)
	src := "db"
	view := BotView{Configured: true, Source: &src, TokenHint: &hint}
	if me.OK {
		view.Username = &me.Username
	}
	return view, nil
}

// SetBotToken — проверяет токен у Telegram и сохраняет зашифрованным.
func (s *ConfigService) SetBotToken(ctx context.Context, userID int64, token string) (BotView, error) {
	trimmed := trimSpace(token)
	if !tokenFormat.MatchString(trimmed) {
		return BotView{}, apperr.BadRequest("Токен не похож на токен бота: ожидается «123456789:AA…»")
	}
	me := s.client.GetMe(ctx, trimmed)
	if !me.OK {
		return BotView{}, apperr.BadRequest("Telegram не принял токен: " + me.Error)
	}
	if _, err := s.settingsRow(ctx, userID); err != nil {
		return BotView{}, err
	}
	enc, err := s.encrypt(trimmed, s.encKey)
	if err != nil {
		return BotView{}, err
	}
	if _, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{TelegramBotToken: &enc}); err != nil {
		return BotView{}, err
	}
	return s.GetBot(ctx, userID)
}

// ClearBotToken — убирает токен бота.
func (s *ConfigService) ClearBotToken(ctx context.Context, userID int64) (BotView, error) {
	if err := s.ensureRow(ctx, userID); err != nil {
		return BotView{}, err
	}
	empty := ""
	if _, err := s.store.UpdateSettings(ctx, userID, store.SettingsUpdate{TelegramBotToken: &empty}); err != nil {
		return BotView{}, err
	}
	return s.GetBot(ctx, userID)
}

// ListChats — все чаты пользователя.
func (s *ConfigService) ListChats(ctx context.Context, userID int64) ([]model.TelegramChat, error) {
	return s.store.ListTelegramChats(ctx, userID)
}

// CreateChat — добавляет чат (daily/weekly по умолчанию true).
func (s *ConfigService) CreateChat(ctx context.Context, userID int64, dto CreateChatDTO) (*model.TelegramChat, error) {
	daily, weekly := true, true
	if dto.Daily != nil {
		daily = *dto.Daily
	}
	if dto.Weekly != nil {
		weekly = *dto.Weekly
	}
	chat, err := s.store.CreateTelegramChat(ctx, userID, trimSpace(dto.Title), trimSpace(dto.ChatID), daily, weekly)
	if err != nil {
		if store.IsUniqueViolation(err) {
			return nil, apperr.Conflict("Чат с таким chatId уже добавлен")
		}
		return nil, err
	}
	return chat, nil
}

// UpdateChat — частичное обновление чата.
func (s *ConfigService) UpdateChat(ctx context.Context, userID, id int64, dto UpdateChatDTO) (*model.TelegramChat, error) {
	if _, err := s.store.FindTelegramChatByID(ctx, userID, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Чат не найден")
		}
		return nil, err
	}
	upd := store.TelegramChatUpdate{}
	if dto.Title != nil {
		t := trimSpace(*dto.Title)
		upd.Title = &t
	}
	if dto.Daily != nil {
		upd.Daily = dto.Daily
	}
	if dto.Weekly != nil {
		upd.Weekly = dto.Weekly
	}
	return s.store.UpdateTelegramChat(ctx, userID, id, upd)
}

// DeleteChat — удаляет чат.
func (s *ConfigService) DeleteChat(ctx context.Context, userID, id int64) error {
	if _, err := s.store.FindTelegramChatByID(ctx, userID, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Чат не найден")
		}
		return err
	}
	return s.store.DeleteTelegramChat(ctx, userID, id)
}

// TestChat — отправляет тестовое сообщение в чат.
func (s *ConfigService) TestChat(ctx context.Context, userID, id int64) error {
	token, err := s.ResolveToken(ctx, userID)
	if err != nil {
		return err
	}
	if token == nil {
		return apperr.Conflict("Сначала подключите бота во вкладке «Telegram-бот»")
	}
	chat, err := s.store.FindTelegramChatByID(ctx, userID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Чат не найден")
		}
		return err
	}
	res := s.client.SendText(ctx, *token, chat.ChatID, testMessage)
	if !res.OK {
		return apperr.BadGateway("Telegram не ответил: " + res.Error)
	}
	return nil
}

// Discover — чаты, которые бот видел, но ещё не добавлены.
func (s *ConfigService) Discover(ctx context.Context, userID int64) ([]ChatInfo, error) {
	token, err := s.ResolveToken(ctx, userID)
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, apperr.Conflict("Сначала подключите бота во вкладке «Telegram-бот»")
	}
	chats, err := s.store.ListTelegramChats(ctx, userID)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]bool, len(chats))
	for _, c := range chats {
		seen[c.ChatID] = true
	}
	found := s.client.GetUpdatesChats(ctx, *token)
	var out []ChatInfo
	for _, c := range found {
		if !seen[c.ChatID] {
			out = append(out, c)
		}
	}
	return out, nil
}

func (s *ConfigService) ensureRow(ctx context.Context, userID int64) error {
	_, err := s.settingsRow(ctx, userID)
	return err
}

func lastN(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}

func trimSpace(v string) string {
	return strings.TrimSpace(v)
}
