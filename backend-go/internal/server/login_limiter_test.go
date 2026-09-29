package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/config"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
)

// loginRequest helper — POST /auth/login от лица IP.
func doLogin(srv *Server, ip string) *httptest.ResponseRecorder {
	body := strings.NewReader(`{"email":"u@example.com","password":"wrong-pass"}`)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", body)
	req.RemoteAddr = ip
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

// Обработчик: 5 попыток подряд с одного IP → 401, 6-я → 429, после окна снова
// 401; другой IP в тот же момент не заблокирован.
func TestHandleLoginRateLimit(t *testing.T) {
	authCfg := config.AuthConfig{CookieSecure: false, SessionDays: 30}
	authSvc := auth.NewService(&storetest.Fake{}, authCfg)
	lim := newLoginLimiter(loginLimitMax, loginLimitWindow)
	now := time.Unix(1_700_000_000, 0)
	lim.now = func() time.Time { return now }

	srv := &Server{cfg: config.Config{Auth: authCfg}, auth: authSvc, loginLimiter: lim}

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

	now = now.Add(loginLimitWindow + time.Second)
	if rr := doLogin(srv, ip); rr.Code != http.StatusUnauthorized {
		t.Fatalf("after window: got %d, want 401", rr.Code)
	}
}
