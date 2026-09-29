package admin

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/bootstrap"
	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// UserView — публичное представление учётки для /admin/*.
type UserView struct {
	ID        int64      `json:"id"`
	Email     string     `json:"email"`
	Timezone  string     `json:"timezone"`
	IsAdmin   bool       `json:"isAdmin"`
	BlockedAt *time.Time `json:"blockedAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

// Service — управление учётками администратором. Ни один метод не раскрывает,
// существует ли пользователь мимо себя: несуществующий id → 404.
type Service struct {
	store     store.Store
	bootstrap *bootstrap.Service
}

func NewService(st store.Store, bootstrap *bootstrap.Service) *Service {
	return &Service{store: st, bootstrap: bootstrap}
}

// IsAdmin проверяет права администратора по id.
func (s *Service) IsAdmin(ctx context.Context, userID int64) (bool, error) {
	user, err := s.store.FindUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return user.IsAdmin, nil
}

func (s *Service) toView(user *model.User) UserView {
	return UserView{
		ID:        user.ID,
		Email:     user.Email,
		Timezone:  user.Timezone,
		IsAdmin:   user.IsAdmin,
		BlockedAt: user.BlockedAt,
		CreatedAt: user.CreatedAt,
	}
}

// List возвращает всех пользователей по возрастанию createdAt.
func (s *Service) List(ctx context.Context) ([]UserView, error) {
	users, err := s.store.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]UserView, 0, len(users))
	for _, u := range users {
		out = append(out, s.toView(&u))
	}
	return out, nil
}

type CreateDTO struct {
	Email    string
	Password string
	Timezone *string
}

// Create создаёт учётку админом. Занятая почта → 409.
func (s *Service) Create(ctx context.Context, dto CreateDTO) (*UserView, error) {
	email := strings.ToLower(strings.TrimSpace(dto.Email))
	timezone := "Europe/Moscow"
	if dto.Timezone != nil {
		timezone = *dto.Timezone
	}
	if err := assertTimezone(timezone); err != nil {
		return nil, err
	}

	hash, err := auth.HashPassword(dto.Password)
	if err != nil {
		return nil, err
	}
	user, err := s.bootstrap.CreateUser(ctx, bootstrap.CreateUserInput{
		Email:        email,
		PasswordHash: &hash,
		Timezone:     timezone,
	})
	if err != nil {
		if store.IsUniqueViolation(err) {
			return nil, apperr.Conflict("Эта почта уже занята")
		}
		return nil, err
	}
	v := s.toView(user)
	return &v, nil
}

// ChangePassword меняет пароль учётки и закрывает все её сессии.
func (s *Service) ChangePassword(ctx context.Context, userID int64, password string) error {
	if err := s.findUser(ctx, userID); err != nil {
		return err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	if err := s.store.UpdateUserPasswordHash(ctx, userID, hash); err != nil {
		return err
	}
	return s.store.DeleteSessionsByUser(ctx, userID)
}

// Block блокирует учётку и закрывает её живые сессии. Себя — нельзя.
func (s *Service) Block(ctx context.Context, adminID, userID int64) error {
	if err := s.findUser(ctx, userID); err != nil {
		return err
	}
	if adminID == userID {
		return apperr.BadRequest("Нельзя заблокировать себя")
	}
	now := time.Now()
	if err := s.store.UpdateUserBlockedAt(ctx, userID, &now); err != nil {
		return err
	}
	return s.store.DeleteSessionsByUser(ctx, userID)
}

// Unblock снимает блокировку.
func (s *Service) Unblock(ctx context.Context, userID int64) error {
	if err := s.findUser(ctx, userID); err != nil {
		return err
	}
	return s.store.UpdateUserBlockedAt(ctx, userID, nil)
}

// Remove удаляет учётку целиком (данные — каскадом). Себя — нельзя.
func (s *Service) Remove(ctx context.Context, adminID, userID int64) error {
	if err := s.findUser(ctx, userID); err != nil {
		return err
	}
	if adminID == userID {
		return apperr.BadRequest("Нельзя удалить себя")
	}
	return s.store.DeleteUser(ctx, userID)
}

func (s *Service) findUser(ctx context.Context, id int64) error {
	user, err := s.store.FindUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Пользователь не найден")
		}
		return err
	}
	_ = user
	return nil
}

func assertTimezone(timezone string) error {
	if _, err := time.LoadLocation(timezone); err != nil {
		return apperr.BadRequest("Неизвестный часовой пояс")
	}
	return nil
}
