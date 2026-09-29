// Package tasktemplates — перенос TaskTemplatesService из backend/src/task-templates.
package tasktemplates

import (
	"context"
	"errors"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// Service — шаблоны задач.
type Service struct {
	store store.Store
}

func NewService(st store.Store) *Service {
	return &Service{store: st}
}

// FindAll возвращает шаблоны по возрастанию order.
func (s *Service) FindAll(ctx context.Context, userID int64) ([]model.TaskTemplate, error) {
	return s.store.ListTaskTemplates(ctx, userID)
}

// Create добавляет шаблон со следующим order.
func (s *Service) Create(ctx context.Context, userID int64, text string) (*model.TaskTemplate, error) {
	maxOrder, err := s.store.MaxTaskTemplateOrder(ctx, userID)
	if err != nil {
		return nil, err
	}
	order := 0
	if maxOrder != nil {
		order = *maxOrder + 1
	}
	return s.store.CreateTaskTemplate(ctx, userID, text, order)
}

// Update частично обновляет шаблон. Неизвестный → 404.
func (s *Service) Update(ctx context.Context, userID int64, id int64, dto store.TaskTemplateUpdate) (*model.TaskTemplate, error) {
	if _, err := s.store.FindTaskTemplateByID(ctx, userID, id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Task template not found")
		}
		return nil, err
	}
	return s.store.UpdateTaskTemplate(ctx, userID, id, dto)
}

// RemoveResult — тело ответа DELETE /task-templates/:id (аналог `{ id }`).
type RemoveResult struct {
	ID int64 `json:"id"`
}

// Remove удаляет шаблон. Неизвестный → 404.
func (s *Service) Remove(ctx context.Context, userID int64, id int64) (RemoveResult, error) {
	existing, err := s.store.FindTaskTemplateByID(ctx, userID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RemoveResult{}, apperr.NotFound("Task template not found")
		}
		return RemoveResult{}, err
	}
	if err := s.store.DeleteTaskTemplate(ctx, userID, id); err != nil {
		return RemoveResult{}, err
	}
	return RemoveResult{ID: existing.ID}, nil
}
