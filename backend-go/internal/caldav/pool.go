package caldav

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// Pool — кэш CalDAV-клиентов на пользователя (аналог CalDavClient в
// backend/src/icloud/caldav.client.ts). Один входной client (или Pool на
// сервер), переиспользуемый и ICloudService, и SessionService.
//
// Ключ кэша — пользователь + отпечаток учётки: сменили Apple ID →
// fingerprint другой → новый клиент. Неудачный логин НЕ кэшируется: иначе
// следующий запрос думал бы, что залогинен, и падал глубже.
type Pool struct {
	httpClient *http.Client
	mu         sync.Mutex
	clients    map[int64]clientEntry
	calendars  map[string]*Calendar
}

type clientEntry struct {
	fingerprint string
	client      *Client
}

// NewPool создаёт пустой пул.
func NewPool(httpClient *http.Client) *Pool {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}
	return &Pool{
		httpClient: httpClient,
		clients:    make(map[int64]clientEntry),
		calendars:  make(map[string]*Calendar),
	}
}

// ClientFor возвращает залогиненный клиент для учётки, кэшируя по userId.
func (p *Pool) ClientFor(ctx context.Context, userID int64, creds Credentials) (*Client, error) {
	fp := fingerprint(creds)
	p.mu.Lock()
	if entry, ok := p.clients[userID]; ok && entry.fingerprint == fp {
		p.mu.Unlock()
		return entry.client, nil
	}
	p.mu.Unlock()

	client := New("https://caldav.icloud.com", creds, p.httpClient)
	if err := client.Login(ctx); err != nil {
		return nil, err
	}

	p.mu.Lock()
	p.clients[userID] = clientEntry{fingerprint: fp, client: client}
	p.mu.Unlock()
	return client, nil
}

// FindCalendar ищет календарь с кэшем по (userID:fp:name). Сброс кэша —
// через Forget, который работает по префиксу userId.
func (p *Pool) FindCalendar(ctx context.Context, userID int64, creds Credentials, name string) (*Calendar, error) {
	key := cacheKey(userID, creds, name)
	p.mu.Lock()
	if cal, ok := p.calendars[key]; ok {
		p.mu.Unlock()
		return cal, nil
	}
	p.mu.Unlock()

	client, err := p.ClientFor(ctx, userID, creds)
	if err != nil {
		return nil, err
	}
	cal, err := client.FindCalendar(ctx, name)
	if err != nil {
		return nil, err
	}

	p.mu.Lock()
	p.calendars[key] = cal
	p.mu.Unlock()
	return cal, nil
}

// Forget сбрасывает кэш пользователя (смена/удаление учётки).
func (p *Pool) Forget(userID int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.clients, userID)
	for key := range p.calendars {
		if strings.HasPrefix(key, strconv.FormatInt(userID, 10)+":") {
			delete(p.calendars, key)
		}
	}
}

func fingerprint(creds Credentials) string {
	sum := sha256.Sum256([]byte(creds.Username + ":" + creds.Password))
	return hex.EncodeToString(sum[:])
}

func cacheKey(userID int64, creds Credentials, name string) string {
	return strconv.FormatInt(userID, 10) + ":" + fingerprint(creds) + ":" + name
}
