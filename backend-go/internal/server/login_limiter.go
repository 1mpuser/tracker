package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	// loginLimitMax — число попыток логина с одного IP в окне (паритет со старым
	// Node-бэкендом: @Throttle({ ttl: 60_000, limit: 5 }) в auth.controller.ts).
	loginLimitMax = 5
	// loginLimitWindow — длина окна, после первой попытки.
	loginLimitWindow = 60 * time.Second
)

// loginEntry — счётчик попыток логина с одного IP в рамках окна.
type loginEntry struct {
	windowStart time.Time
	count       int
}

// loginLimiter — простой in-memory rate-limiter по IP для POST /auth/login.
// Не держит внешних зависимостей: map + мьютекс. Устаревшие записи удаляются
// лениво (не чаще раза в окно, при обращении), чтобы не течь по памяти при
// большом числе уникальных IP.
type loginLimiter struct {
	mu        sync.Mutex
	entries   map[string]*loginEntry
	max       int
	window    time.Duration
	now       func() time.Time
	lastSweep time.Time
}

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{
		entries: make(map[string]*loginEntry),
		max:     max,
		window:  window,
		now:     time.Now,
	}
}

// allow регистрирует попытку логина с данного IP. Ключ — реальный IP клиента
// (см. clientIP: правый элемент X-Forwarded-For, добавленный доверенным
// прокси, либо картинка из TCP-соединения). Возвращает false, если IP уже
// исчерпал лимит попыток в текущем окне.
func (l *loginLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.sweepIfNeeded()

	now := l.now()
	e := l.entries[ip]
	if e == nil || now.Sub(e.windowStart) >= l.window {
		l.entries[ip] = &loginEntry{windowStart: now, count: 1}
		return true
	}
	if e.count >= l.max {
		return false
	}
	e.count++
	return true
}

// sweepIfNeeded удаляет записи, чьё окно истекло; вызывается не чаще раза в окно,
// чтобы очистка не была на каждый запрос.
func (l *loginLimiter) sweepIfNeeded() {
	now := l.now()
	if now.Sub(l.lastSweep) < l.window {
		return
	}
	for ip, e := range l.entries {
		if now.Sub(e.windowStart) >= l.window {
			delete(l.entries, ip)
		}
	}
	l.lastSweep = now
}

// clientIP возвращает IP клиента, по которому ключуется лимитер.
//
// Доверенный источник — только последний hop. Прямой прокси один — Caddy
// (сервис backend не публикует порт наружу), и он не подменяет
// X-Forwarded-For, а ДОБАВЛЯЕТ свой IP справа. Поэтому берём ПРАВЫЙ элемент
// цепочки, а не левый: левый контролируется внешним клиентом и уязвим к
// спуфингу (см. Deprecated middleware.RealIP). Повторные заголовки по
// RFC 2616 объединяются запятой в порядке получения, поэтому сшиваем их и
// берём самый правый элемент.
//
// Если заголовка нет (прямое соединение, локальный curl без прокси) или
// правый элемент не парсится — деградируем до r.RemoteAddr (целиком).
func clientIP(r *http.Request) string {
	if xffs := r.Header.Values("X-Forwarded-For"); len(xffs) > 0 {
		joined := strings.Join(xffs, ",")
		parts := strings.Split(joined, ",")
		last := strings.TrimSpace(parts[len(parts)-1])
		if net.ParseIP(last) != nil {
			return last
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
