package server

import (
	"net"
	"net/http"
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
// (после middleware.RealIP это r.RemoteAddr). Возвращает false, если IP уже
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

// clientIP достаёт IP клиента из запроса. После chi middleware.RealIP в
// r.RemoteAddr уже стоит реальный IP клиента (за Caddy это не адрес прокси).
func clientIP(r *http.Request) string {
	ip := r.RemoteAddr
	if host, _, err := net.SplitHostPort(ip); err == nil {
		return host
	}
	return ip
}
