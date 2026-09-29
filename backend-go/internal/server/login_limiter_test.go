package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
)

// loginServer собирает минимальный Server для теста /auth/login (fake store с
// несуществующей учёткой → Login возвращает 401).
func loginServer() *Server {
	authCfg := config.AuthConfig{CookieSecure: false, SessionDays: 30}
	authSvc := auth.NewService(&storetest.Fake{}, authCfg)
	return &Server{
		cfg:          config.Config{Auth: authCfg},
		auth:         authSvc,
		loginLimiter: newLoginLimiter(loginLimitMax, loginLimitWindow),
	}
}

// doLogin — POST /auth/login от прямого соединения (без X-Forwarded-For);
// IP берётся из RemoteAddr.
func doLogin(srv *Server, remoteAddr string) *httptest.ResponseRecorder {
	body := strings.NewReader(`{"email":"u@example.com","password":"wrong-pass"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	srv.handleLogin(w, req)
	return w
}

// doLoginXFF — POST /auth/login через прокси: RemoteAddr = адрес прокси (Caddy),
// реальный клиент — правый элемент X-Forwarded-For, добавленный самим Caddy.
func doLoginXFF(srv *Server, proxyAddr, xff string) *httptest.ResponseRecorder {
	body := strings.NewReader(`{"email":"u@example.com","password":"wrong-pass"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	req.RemoteAddr = proxyAddr
	req.Header.Set("X-Forwarded-For", xff)
	w := httptest.NewRecorder()
	srv.handleLogin(w, req)
	return w
}

// Лимитер: 5 попыток в окне проходят, 6-я — отклонена, после истечения окна
// счётчик сбрасывается.
func TestLoginLimiterAllowsThenResetsWindow(t *testing.T) {
	lim := newLoginLimiter(loginLimitMax, loginLimitWindow)
	now := time.Unix(1_700_000_000, 0)
	lim.now = func() time.Time { return now }

	for i := 0; i < loginLimitMax; i++ {
		if !lim.allow("1.2.3.4") {
			t.Fatalf("attempt %d should be allowed within window", i+1)
		}
	}
	if lim.allow("1.2.3.4") {
		t.Fatal("6th attempt within window should be rejected")
	}

	now = now.Add(loginLimitWindow + time.Second)
	if !lim.allow("1.2.3.4") {
		t.Fatal("attempt after window expiry should be allowed")
	}
}

// Разные IP не зависят друг от друга.
func TestLoginLimiterBucketsByIP(t *testing.T) {
	lim := newLoginLimiter(loginLimitMax, loginLimitWindow)
	for i := 0; i < loginLimitMax; i++ {
		lim.allow("10.0.0.1")
	}
	if lim.allow("10.0.0.1") {
		t.Fatal("10.0.0.1 should be blocked after 5 attempts")
	}
	if !lim.allow("10.0.0.2") {
		t.Fatal("10.0.0.2 must be independent of 10.0.0.1")
	}
}

// Прямое соединение без X-Forwarded-For: IP берётся из RemoteAddr. 5×401,
// 6-я — 429, другой реальный клиент не заблокирован, после окна снова 401.
func TestHandleLoginDirectRemoteAddr(t *testing.T) {
	srv := loginServer()
	usedNow := time.Unix(1_700_000_000, 0)
	srv.loginLimiter.now = func() time.Time { return usedNow }

	ip := "203.0.113.7:12345"
	for i := 0; i < loginLimitMax; i++ {
		if rr := doLogin(srv, ip); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: got %d, want 401", i+1, rr.Code)
		}
	}
	if rr := doLogin(srv, ip); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("6th attempt: got %d, want 429", rr.Code)
	}
	if rr := doLogin(srv, "198.51.100.9:54321"); rr.Code != http.StatusUnauthorized {
		t.Fatalf("other ip: got %d, want 401", rr.Code)
	}

	usedNow = usedNow.Add(loginLimitWindow + time.Second)
	if rr := doLogin(srv, ip); rr.Code != http.StatusUnauthorized {
		t.Fatalf("after window: got %d, want 401", rr.Code)
	}
}

// Спуфинг: клиент шлёт разный левый X-Forwarded-For на каждый запрос, но
// реальный клиент (правый элемент, добавленный Caddy) постоянен — после
// 5 попыток 6-я всё равно 429. Левый элемент не должен попадать в ключ.
func TestHandleLoginSpoofedXFFBlocked(t *testing.T) {
	srv := loginServer()
	proxy := "10.0.0.5:12345" // адрес Caddy в Docker-сети
	const realClient = "203.0.113.77"

	for i := 1; i <= loginLimitMax; i++ {
		// Каждый раз подделываем свой левый IP; правый (реальный) — постоянен.
		xff := fmt.Sprintf("1.1.%d.%d, %s", i, 101+i%250, realClient)
		if rr := doLoginXFF(srv, proxy, xff); rr.Code != http.StatusUnauthorized {
			t.Fatalf("spoof attempt %d: got %d, want 401", i, rr.Code)
		}
	}
	// 6-я попытка — любой новый поддельный левый IP, но тот же реальный → 429.
	xff := fmt.Sprintf("9.9.9.9, %s", realClient)
	if rr := doLoginXFF(srv, proxy, xff); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("6th spoof attempt: got %d, want 429", rr.Code)
	}
	// Другой реальный клиент (иной правый элемент) не заблокирован.
	if rr := doLoginXFF(srv, proxy, "1.1.1.1, 198.51.100.9"); rr.Code != http.StatusUnauthorized {
		t.Fatalf("other real client: got %d, want 401", rr.Code)
	}
}

// Непарсимый X-Forwarded-For → деградация до RemoteAddr (без паники).
func TestHandleLoginUnparseableXFFFallsBack(t *testing.T) {
	srv := loginServer()
	ip := "172.20.0.7:4567"
	// Правый (только) элемент не парсится — лимитер ключуется по RemoteAddr.
	xff := "not-an-ip"
	for i := 0; i < loginLimitMax; i++ {
		if rr := doLoginXFF(srv, ip, xff); rr.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: got %d, want 401", i+1, rr.Code)
		}
	}
	if rr := doLoginXFF(srv, ip, xff); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("6th attempt: got %d, want 429", rr.Code)
	}
}
