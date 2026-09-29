package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// Параметры scrypt — ровно те же, что backend/src/auth/password.util.ts
// (N=32768, r=8, p=1, keylen=64). Формат строки хэша:
//
//	scrypt$N$r$p$saltBase64$hashBase64
//
// Чтобы существующие пользователи, заведённые Node-бэкендом, не потеряли
// доступ, Go-версия обязана проверять их пароли на тех же параметрах.
const (
	scryptN      = 32768
	scryptR      = 8
	scryptP      = 1
	scryptKeyLen = 64
)

// DUMMY_HASH — хэш «пустышки» для входа на несуществующий адрес (см.
// password.util.ts): время ответа не выдаёт, есть ли пользователь.
var DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + strings.Repeat("A", 86) + "=="

// HashPassword хэширует пароль с новым случайным солью в формате password.util.ts.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := scrypt.Key([]byte(password), salt, scryptN, scryptR, scryptP, scryptKeyLen)
	if err != nil {
		return "", err
	}
	return "scrypt$" + strconv.Itoa(scryptN) + "$" + strconv.Itoa(scryptR) + "$" + strconv.Itoa(scryptP) +
		"$" + base64.StdEncoding.EncodeToString(salt) + "$" + base64.StdEncoding.EncodeToString(key), nil
}

// VerifyPassword проверяет пароль по сохранённой строке. Не-scrypt или
// битая строка → false (ошибки формата не пробрасываются, как в Node).
func VerifyPassword(password, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return false
	}
	n, errN := strconv.Atoi(parts[1])
	r, errR := strconv.Atoi(parts[2])
	p, errP := strconv.Atoi(parts[3])
	if errN != nil || errR != nil || errP != nil {
		return false
	}
	salt, errSalt := base64.StdEncoding.DecodeString(parts[4])
	expected, errHash := base64.StdEncoding.DecodeString(parts[5])
	if errSalt != nil || errHash != nil || len(expected) == 0 {
		return false
	}
	actual, err := scrypt.Key([]byte(password), salt, n, r, p, len(expected))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

// NeedsRehash — устарели ли параметры хэша относительно текущих констант.
func NeedsRehash(stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return true
	}
	n, errN := strconv.Atoi(parts[1])
	r, errR := strconv.Atoi(parts[2])
	p, errP := strconv.Atoi(parts[3])
	if errN != nil || errR != nil || errP != nil {
		return true
	}
	return n != scryptN || r != scryptR || p != scryptP
}
