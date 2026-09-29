package crypto

import (
	"strings"
	"testing"
)

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plain := "123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y"
	enc, err := EncryptSecret(plain, key)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if !IsEncrypted(enc) || !strings.HasPrefix(enc, "enc:v1:") {
		t.Fatalf("no prefix: %q", enc)
	}
	got, err := DecryptSecret(enc, key)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != plain {
		t.Fatalf("got %q want %q", got, plain)
	}
}

func TestDecryptNonEncryptedFails(t *testing.T) {
	if _, err := DecryptSecret("cleartext-secret", key); err == nil {
		t.Fatal("открытый текст расшифровать нельзя")
	}
}

func TestDecryptWrongKeyFails(t *testing.T) {
	enc, _ := EncryptSecret("secret", key)
	if _, err := DecryptSecret(enc, "Zm9vYmFyYmF6Zm9vYmFyYmF6Zm9vYg=="); err == nil {
		t.Fatal("неверный ключ должен давать ошибку")
	}
}

func TestLoadKeyRejectsBadLength(t *testing.T) {
	if _, err := loadKey("c2hvcnQ="); err == nil {
		t.Fatal("короткий ключ должен отклоняться")
	}
}

// Совместимость с backend/src/common/crypto.util.ts: значение, зашифрованное
// старым Node-бэкендом (Buffer.concat([iv, tag, encrypted])), должно
// расшифровываться тем же ключом. Фикстура получена реальным crypto.util.ts.
func TestDecryptNodeProducedSecret(t *testing.T) {
	nodeEnc := "enc:v1:1SLlq6PTsgAQISGDtlml4I6VghiKAZmEM5ocPsSt3RTuwP8cWKMI/r/aYZYez154Wums/WCkL4k/a19SQrAcfZoynvfqR3872CQ="
	orig := "123456789:AAHjt-CB69zQ4Wdig_zKrdRsJxNbQ03zWx0Y"
	got, err := DecryptSecret(nodeEnc, key)
	if err != nil {
		t.Fatalf("decrypt node secret: %v", err)
	}
	if got != orig {
		t.Fatalf("got %q want %q", got, orig)
	}
}
