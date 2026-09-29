package bootstrap

import (
	"context"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
)

// Service — единственный путь создания учётки (аналог UserBootstrapService):
// пользователь + дефолтные настройки + дефолтные сферы одной транзакцией.
type Service struct {
	store                    store.Store
	distractionBudgetDefault int
}

func NewService(st store.Store, distractionBudgetDefault int) *Service {
	return &Service{store: st, distractionBudgetDefault: distractionBudgetDefault}
}

type CreateUserInput struct {
	Email        string
	PasswordHash *string
	Timezone     string
}

// CreateUser создаёт учётку с дефолтными настройками и сферами.
func (s *Service) CreateUser(ctx context.Context, in CreateUserInput) (*model.User, error) {
	budget := s.distractionBudgetDefault
	if budget <= 0 {
		budget = 60
	}
	return s.store.CreateUserWithDefaults(ctx, in.Email, in.PasswordHash, in.Timezone, budget)
}
