// Package categories — перенос CategoriesService из backend/src/categories.
package categories

import (
	"context"
	"errors"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// Service — сферы пользователя. userId первым аргументом; чужая запись → 404.
type Service struct {
	store store.Store
}

func NewService(st store.Store) *Service {
	return &Service{store: st}
}

// FindActive возвращает неархивные сферы по возрастанию order (GET /categories).
func (s *Service) FindActive(ctx context.Context, userID int64) ([]model.Category, error) {
	return s.store.ListActiveCategories(ctx, userID)
}

// CreateDTO — данные создания сферы (POST /categories).
type CreateDTO struct {
	Key   string
	Label string
}

// Create создаёт сферу со следующим order. Занятый key → 409.
func (s *Service) Create(ctx context.Context, userID int64, dto CreateDTO) (*model.Category, error) {
	existing, err := s.store.FindCategoryByKey(ctx, userID, dto.Key)
	if err == nil && existing != nil {
		return nil, apperr.Conflict("Category with key \"" + dto.Key + "\" already exists")
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	maxOrder, err := s.store.MaxCategoryOrder(ctx, userID)
	if err != nil {
		return nil, err
	}
	order := 0
	if maxOrder != nil {
		order = *maxOrder + 1
	}
	return s.store.CreateCategory(ctx, userID, dto.Key, dto.Label, order)
}

// UpdateDTO — частичное обновление сферы (PATCH /categories/:key).
type UpdateDTO struct {
	Label    *string
	Order    *int
	Archived *bool
}

// Update обновляет сферу по ключу. Неизвестная сфера → 404.
func (s *Service) Update(ctx context.Context, userID int64, key string, dto UpdateDTO) (*model.Category, error) {
	existing, err := s.store.FindCategoryByKey(ctx, userID, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Category \"" + key + "\" not found")
		}
		return nil, err
	}
	_ = existing
	return s.store.UpdateCategory(ctx, userID, key, store.CategoryUpdate{
		Label:    dto.Label,
		Order:    dto.Order,
		Archived: dto.Archived,
	})
}
