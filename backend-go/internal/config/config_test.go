package config

import "testing"

func TestDefaultsOutsideProduction(t *testing.T) {
	t.Setenv("NODE_ENV", "development")
	t.Setenv("APP_ENCRYPTION_KEY", "")
	t.Setenv("CORS_ORIGINS", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Auth.CookieSecure {
		t.Fatal("вне production cookie не должен быть secure")
	}
	if cfg.Auth.SessionDays != 30 {
		t.Fatalf("sessionDays должен быть 30, got %d", cfg.Auth.SessionDays)
	}
	if cfg.Addr != ":3001" {
		t.Fatalf("адрес должен быть :3001, got %q", cfg.Addr)
	}
	if len(cfg.CORSOrigins) != 2 {
		t.Fatalf("дефолтные origin'ы: %v", cfg.CORSOrigins)
	}
}

func TestSecureCookieInProduction(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("APP_ENCRYPTION_KEY", "base64key000000000000000000000000")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if !cfg.Auth.CookieSecure {
		t.Fatal("в production cookie должен быть secure")
	}
}

func TestCookieSecureFalseForcesInsecure(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("APP_ENCRYPTION_KEY", "base64key000000000000000000000000")
	t.Setenv("COOKIE_SECURE", "false")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Auth.CookieSecure {
		t.Fatal("COOKIE_SECURE=false должен отключить secure даже в production")
	}
}

func TestThrowsWithoutKeyInProduction(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("APP_ENCRYPTION_KEY", "")
	if _, err := Load(); err == nil {
		t.Fatal("в production без APP_ENCRYPTION_KEY должна быть ошибка")
	}
}

func TestSessionDaysOverride(t *testing.T) {
	t.Setenv("SESSION_DAYS", "14")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Auth.SessionDays != 14 {
		t.Fatalf("sessionDays должен быть 14, got %d", cfg.Auth.SessionDays)
	}
}
