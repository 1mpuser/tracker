package auth

import "testing"

// nodeHash — хэш пароля "password123", созданный backend/src/auth/password.util.ts
// (Node scrypt, N=32768,r=8,p=1,keylen=64). Проверка совместимости: Go должен
// принять пароль, захэшированный Node-бэкендом, без миграции данных.
const nodeHash = "scrypt$32768$8$1$lamft6W+8gE2s1QpJaMgMg==$F+g56l9nmJU66cS6YQF3yXdiZGzA+VK4u4vdbZEcesuJleJnC2SH45ZQD8aCrvOT3DCYSGdlCfJsDysMcujvjA=="

func TestHashPasswordRoundTrip(t *testing.T) {
	stored, err := HashPassword("супер секрет 123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if len(stored) == 0 || stored[:7] != "scrypt$" {
		t.Fatalf("неожиданный формат: %s", stored)
	}
	if !VerifyPassword("супер секрет 123", stored) {
		t.Fatal("тот же пароль должен проверяться")
	}
}

func TestVerifyPasswordRejectsWrong(t *testing.T) {
	stored, _ := HashPassword("correct horse")
	if VerifyPassword("wrong", stored) {
		t.Fatal("неверный пароль не должен пройти")
	}
}

func TestVerifyNodeHash(t *testing.T) {
	// Пароль, заведённый Node-бэкендом, проверяется в Go (см. nodeHash выше).
	if !VerifyPassword("password123", nodeHash) {
		t.Fatal("Node-хэш password123 должен проверяться в Go")
	}
	if VerifyPassword("password124", nodeHash) {
		t.Fatal("другой пароль против Node-хэша не должен пройти")
	}
}

func TestVerifyNonScrypt(t *testing.T) {
	if VerifyPassword("x", "md5$abc") {
		t.Fatal("не-scrypt строка должна отклоняться")
	}
	if VerifyPassword("x", "not-a-hash") {
		t.Fatal("битая строка должна отклоняться")
	}
}

func TestNeedsRehash(t *testing.T) {
	current, _ := HashPassword("x")
	if NeedsRehash(current) {
		t.Fatal("текущие параметры не должны требовать рехэша")
	}
	parts := splitHash(current)
	old := "scrypt$16384$" + parts[2] + "$" + parts[3] + "$" + parts[4] + "$" + parts[5]
	if !NeedsRehash(old) {
		t.Fatal("устаревшие параметры должны требовать рехэша")
	}
}

func TestDummyHashRuns(t *testing.T) {
	// DUMMY_HASH функционально не важен (никто не проверяет результат), важно,
	// чтобы verify прогонялся без паники и возвращал false.
	if VerifyPassword("anything", DUMMY_HASH) {
		t.Fatal("dummy-хэш не должен принимать пароль")
	}
}

func splitHash(stored string) []string {
	out := make([]string, 0, 6)
	start := 0
	for i := 0; i < len(stored); i++ {
		if stored[i] == '$' {
			out = append(out, stored[start:i])
			start = i + 1
		}
	}
	out = append(out, stored[start:])
	return out
}
