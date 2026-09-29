package server

import (
	"context"

	"github.com/1mpuser/tracker/backend-go/internal/model"
)

type ctxKey int

const userKey ctxKey = iota

// WithUser кладёт текущего пользователя в контекст (устанавливает SessionGuard).
func WithUser(ctx context.Context, u model.AuthUser) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// CurrentUser достаёт пользователя из контекста. Возвращает false, если
// middleware не отработал — это баг маршрутизации, не «анонимный» запрос.
func CurrentUser(ctx context.Context) (model.AuthUser, bool) {
	u, ok := ctx.Value(userKey).(model.AuthUser)
	return u, ok
}
