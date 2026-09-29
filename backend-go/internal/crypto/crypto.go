// Package crypto — AES-256-GCM для секретов интеграций. Формат «enc:v1:»
// совпадает с backend/src/common/crypto.util.ts.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

const (
	algo   = "aes-256-gcm"
	ivLen  = 12
	tagLen = 16
	keyLen = 32
	prefix = "enc:v1:"
)

// IsEncrypted проверяет, что значение — зашифрованный секрет (enc:v1:...).
func IsEncrypted(stored string) bool {
	return strings.HasPrefix(stored, prefix)
}

// EncryptSecret шифрует открытый текст ключом (base64, 32 байта).
func EncryptSecret(plain, keyB64 string) (string, error) {
	key, err := loadKey(keyB64)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, ivLen)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}
	// aead.Seal возвращает ciphertext||tag, а формат enc:v1: — iv||tag||ciphertext
	// (как Buffer.concat([iv, tag, encrypted]) в crypto.util.ts).
	sealed := aead.Seal(nil, iv, []byte(plain), nil)
	ct := sealed[:len(sealed)-tagLen]
	tag := sealed[len(sealed)-tagLen:]
	raw := make([]byte, 0, ivLen+tagLen+len(ct))
	raw = append(raw, iv...)
	raw = append(raw, tag...)
	raw = append(raw, ct...)
	return prefix + base64.StdEncoding.EncodeToString(raw), nil
}

// DecryptSecret расшифровывает «enc:v1:...» значение. Для значений без
// префикса (открытый текст от однопользовательской версии) — ошибка.
func DecryptSecret(stored, keyB64 string) (string, error) {
	key, err := loadKey(keyB64)
	if err != nil {
		return "", err
	}
	if !IsEncrypted(stored) {
		return "", errors.New("не зашифрованные секреты расшифровать нельзя")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, prefix))
	if err != nil {
		return "", err
	}
	if len(raw) < ivLen+tagLen {
		return "", errors.New("недостаточная длина зашифрованного значения")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := raw[:ivLen]
	tag := raw[ivLen : ivLen+tagLen]
	ct := raw[ivLen+tagLen:]
	full := make([]byte, 0, len(ct)+tagLen)
	full = append(full, ct...)
	full = append(full, tag...)
	open, err := aead.Open(nil, iv, full, nil)
	if err != nil {
		return "", fmt.Errorf("расшифровка не удалась: %w", err)
	}
	return string(open), nil
}

func loadKey(keyB64 string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return nil, fmt.Errorf("APP_ENCRYPTION_KEY должна быть валидным base64: %w", err)
	}
	if len(key) != keyLen {
		return nil, errors.New("APP_ENCRYPTION_KEY должна быть 32 байта в base64")
	}
	return key, nil
}
