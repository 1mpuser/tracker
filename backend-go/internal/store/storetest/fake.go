// Package storetest предоставляет тестовый store.Store для unit-тестов сервисов
// (аналог мока PrismaService в NestJS-спеках).
package storetest

import (
	"context"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
	"github.com/jackc/pgx/v5"
)

// Fake — реализация store.Store, где каждую операцию можно подменить функцией.
// Не подставленные операции возвращают нулевые значения (поиск — pgx.ErrNoRows).
type Fake struct {
	FindUserByEmailFn        func(ctx context.Context, email string) (*model.User, error)
	FindUserByIDFn           func(ctx context.Context, id int64) (*model.User, error)
	ListUsersFn              func(ctx context.Context) ([]model.User, error)
	UpdateUserPasswordHashFn func(ctx context.Context, id int64, hash string) error
	UpdateUserTimezoneFn     func(ctx context.Context, id int64, timezone string) error
	UpdateUserBlockedAtFn    func(ctx context.Context, id int64, blockedAt *time.Time) error
	UpdateUserAdminFn        func(ctx context.Context, id int64, isAdmin bool) error
	DeleteUserFn             func(ctx context.Context, id int64) error

	CreateSessionFn              func(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error
	FindSessionByTokenHashFn     func(ctx context.Context, tokenHash string) (*model.Session, error)
	UpdateSessionFn              func(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error
	DeleteSessionByTokenHashFn   func(ctx context.Context, tokenHash string) error
	DeleteSessionsByUserFn       func(ctx context.Context, userID int64) error
	DeleteSessionsByUserExceptFn func(ctx context.Context, userID int64, tokenHash string) error
	DeleteExpiredSessionsFn      func(ctx context.Context, now time.Time) error

	CreateUserWithDefaultsFn func(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error)

	// categories
	ListCategoriesFn       func(ctx context.Context, userID int64) ([]model.Category, error)
	ListActiveCategoriesFn func(ctx context.Context, userID int64) ([]model.Category, error)
	FindCategoryByKeyFn    func(ctx context.Context, userID int64, key string) (*model.Category, error)
	FindCategoryByIDFn     func(ctx context.Context, userID int64, id int64) (*model.Category, error)
	CreateCategoryFn       func(ctx context.Context, userID int64, key, label string, order int) (*model.Category, error)
	UpdateCategoryFn       func(ctx context.Context, userID int64, key string, u store.CategoryUpdate) (*model.Category, error)
	MaxCategoryOrderFn     func(ctx context.Context, userID int64) (*int, error)

	// days
	FindDayFn                        func(ctx context.Context, userID int64, date time.Time) (*model.Day, error)
	CreateDayFn                      func(ctx context.Context, userID int64, date time.Time) (*model.Day, error)
	UpdateDayFn                      func(ctx context.Context, userID int64, date time.Time, u store.DayUpdate) (*model.Day, error)
	UpdateDayDistractionFn           func(ctx context.Context, userID int64, date time.Time, minutes int) error
	UpdateDayPomodorosFn             func(ctx context.Context, userID int64, date time.Time, count int) error
	ListCategoryStatusesFn           func(ctx context.Context, dayID int64) ([]model.DayCategoryStatus, error)
	UpsertDayCategoryStatusFn        func(ctx context.Context, dayID, categoryID int64, done bool) error
	ListDayCategoryStatusesInRangeFn func(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error)
	ListDaysInRangeFn                func(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error)

	// settings
	FindSettingsFn   func(ctx context.Context, userID int64) (*model.Settings, error)
	CreateSettingsFn func(ctx context.Context, userID int64) (*model.Settings, error)
	UpdateSettingsFn func(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error)

	// task-templates
	ListTaskTemplatesFn    func(ctx context.Context, userID int64) ([]model.TaskTemplate, error)
	FindTaskTemplateByIDFn func(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error)
	CreateTaskTemplateFn   func(ctx context.Context, userID int64, text string, order int) (*model.TaskTemplate, error)
	UpdateTaskTemplateFn   func(ctx context.Context, userID int64, id int64, u store.TaskTemplateUpdate) (*model.TaskTemplate, error)
	DeleteTaskTemplateFn   func(ctx context.Context, userID int64, id int64) error
	MaxTaskTemplateOrderFn func(ctx context.Context, userID int64) (*int, error)

	// gtd
	ListGtdItemsFn        func(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error)
	ListGtdItemsForDateFn func(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error)
	FindGtdItemByIDFn     func(ctx context.Context, userID int64, id int64) (*model.GtdItem, error)
	CreateGtdItemFn       func(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error)
	UpdateGtdItemFn       func(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error)
	DeleteGtdItemFn       func(ctx context.Context, userID int64, id int64) error
	MaxGtdOrderFn         func(ctx context.Context, userID int64) (*int, error)

	// routines
	ListRoutinesFn         func(ctx context.Context, userID int64) ([]model.Routine, error)
	ListRoutinesWithLogsFn func(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error)
	FindRoutineByIDFn      func(ctx context.Context, userID int64, id int64) (*model.Routine, error)
	CreateRoutineFn        func(ctx context.Context, userID int64, title string, timesPerDay, daysPerWeek int, categoryID *int64, order int) (*model.Routine, error)
	UpdateRoutineFn        func(ctx context.Context, userID int64, id int64, u store.RoutineUpdate) (*model.Routine, error)
	ArchiveRoutineFn       func(ctx context.Context, userID int64, id int64) error
	MaxRoutineOrderFn      func(ctx context.Context, userID int64) (*int, error)
	UpsertRoutineLogFn     func(ctx context.Context, routineID int64, date time.Time, count int) error
	DeleteRoutineLogFn     func(ctx context.Context, routineID int64, date time.Time) error
	ListRoutineLogsFn      func(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error)
}

func (f *Fake) FindUserByEmail(ctx context.Context, email string) (*model.User, error) {
	if f.FindUserByEmailFn != nil {
		return f.FindUserByEmailFn(ctx, email)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) FindUserByID(ctx context.Context, id int64) (*model.User, error) {
	if f.FindUserByIDFn != nil {
		return f.FindUserByIDFn(ctx, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) ListUsers(ctx context.Context) ([]model.User, error) {
	if f.ListUsersFn != nil {
		return f.ListUsersFn(ctx)
	}
	return nil, nil
}

func (f *Fake) UpdateUserPasswordHash(ctx context.Context, id int64, hash string) error {
	if f.UpdateUserPasswordHashFn != nil {
		return f.UpdateUserPasswordHashFn(ctx, id, hash)
	}
	return nil
}

func (f *Fake) UpdateUserTimezone(ctx context.Context, id int64, timezone string) error {
	if f.UpdateUserTimezoneFn != nil {
		return f.UpdateUserTimezoneFn(ctx, id, timezone)
	}
	return nil
}

func (f *Fake) UpdateUserBlockedAt(ctx context.Context, id int64, blockedAt *time.Time) error {
	if f.UpdateUserBlockedAtFn != nil {
		return f.UpdateUserBlockedAtFn(ctx, id, blockedAt)
	}
	return nil
}

func (f *Fake) UpdateUserAdmin(ctx context.Context, id int64, isAdmin bool) error {
	if f.UpdateUserAdminFn != nil {
		return f.UpdateUserAdminFn(ctx, id, isAdmin)
	}
	return nil
}

func (f *Fake) DeleteUser(ctx context.Context, id int64) error {
	if f.DeleteUserFn != nil {
		return f.DeleteUserFn(ctx, id)
	}
	return nil
}

func (f *Fake) CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error {
	if f.CreateSessionFn != nil {
		return f.CreateSessionFn(ctx, userID, tokenHash, expiresAt, userAgent)
	}
	return nil
}

func (f *Fake) FindSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error) {
	if f.FindSessionByTokenHashFn != nil {
		return f.FindSessionByTokenHashFn(ctx, tokenHash)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) UpdateSession(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error {
	if f.UpdateSessionFn != nil {
		return f.UpdateSessionFn(ctx, id, lastSeenAt, expiresAt)
	}
	return nil
}

func (f *Fake) DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error {
	if f.DeleteSessionByTokenHashFn != nil {
		return f.DeleteSessionByTokenHashFn(ctx, tokenHash)
	}
	return nil
}

func (f *Fake) DeleteSessionsByUser(ctx context.Context, userID int64) error {
	if f.DeleteSessionsByUserFn != nil {
		return f.DeleteSessionsByUserFn(ctx, userID)
	}
	return nil
}

func (f *Fake) DeleteSessionsByUserExcept(ctx context.Context, userID int64, tokenHash string) error {
	if f.DeleteSessionsByUserExceptFn != nil {
		return f.DeleteSessionsByUserExceptFn(ctx, userID, tokenHash)
	}
	return nil
}

func (f *Fake) DeleteExpiredSessions(ctx context.Context, now time.Time) error {
	if f.DeleteExpiredSessionsFn != nil {
		return f.DeleteExpiredSessionsFn(ctx, now)
	}
	return nil
}

func (f *Fake) CreateUserWithDefaults(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error) {
	if f.CreateUserWithDefaultsFn != nil {
		return f.CreateUserWithDefaultsFn(ctx, email, passwordHash, timezone, distractionBudget)
	}
	return nil, nil
}

func (f *Fake) ListCategories(ctx context.Context, userID int64) ([]model.Category, error) {
	if f.ListCategoriesFn != nil {
		return f.ListCategoriesFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) ListActiveCategories(ctx context.Context, userID int64) ([]model.Category, error) {
	if f.ListActiveCategoriesFn != nil {
		return f.ListActiveCategoriesFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) FindCategoryByKey(ctx context.Context, userID int64, key string) (*model.Category, error) {
	if f.FindCategoryByKeyFn != nil {
		return f.FindCategoryByKeyFn(ctx, userID, key)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) FindCategoryByID(ctx context.Context, userID int64, id int64) (*model.Category, error) {
	if f.FindCategoryByIDFn != nil {
		return f.FindCategoryByIDFn(ctx, userID, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateCategory(ctx context.Context, userID int64, key, label string, order int) (*model.Category, error) {
	if f.CreateCategoryFn != nil {
		return f.CreateCategoryFn(ctx, userID, key, label, order)
	}
	return nil, nil
}

func (f *Fake) UpdateCategory(ctx context.Context, userID int64, key string, u store.CategoryUpdate) (*model.Category, error) {
	if f.UpdateCategoryFn != nil {
		return f.UpdateCategoryFn(ctx, userID, key, u)
	}
	return nil, nil
}

func (f *Fake) MaxCategoryOrder(ctx context.Context, userID int64) (*int, error) {
	if f.MaxCategoryOrderFn != nil {
		return f.MaxCategoryOrderFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) FindDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
	if f.FindDayFn != nil {
		return f.FindDayFn(ctx, userID, date)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
	if f.CreateDayFn != nil {
		return f.CreateDayFn(ctx, userID, date)
	}
	return nil, nil
}

func (f *Fake) UpdateDay(ctx context.Context, userID int64, date time.Time, u store.DayUpdate) (*model.Day, error) {
	if f.UpdateDayFn != nil {
		return f.UpdateDayFn(ctx, userID, date, u)
	}
	return nil, nil
}

func (f *Fake) UpdateDayDistraction(ctx context.Context, userID int64, date time.Time, minutes int) error {
	if f.UpdateDayDistractionFn != nil {
		return f.UpdateDayDistractionFn(ctx, userID, date, minutes)
	}
	return nil
}

func (f *Fake) UpdateDayPomodoros(ctx context.Context, userID int64, date time.Time, count int) error {
	if f.UpdateDayPomodorosFn != nil {
		return f.UpdateDayPomodorosFn(ctx, userID, date, count)
	}
	return nil
}

func (f *Fake) ListCategoryStatuses(ctx context.Context, dayID int64) ([]model.DayCategoryStatus, error) {
	if f.ListCategoryStatusesFn != nil {
		return f.ListCategoryStatusesFn(ctx, dayID)
	}
	return nil, nil
}

func (f *Fake) UpsertDayCategoryStatus(ctx context.Context, dayID, categoryID int64, done bool) error {
	if f.UpsertDayCategoryStatusFn != nil {
		return f.UpsertDayCategoryStatusFn(ctx, dayID, categoryID, done)
	}
	return nil
}

func (f *Fake) ListDayCategoryStatusesInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
	if f.ListDayCategoryStatusesInRangeFn != nil {
		return f.ListDayCategoryStatusesInRangeFn(ctx, userID, start, end)
	}
	return nil, nil
}

func (f *Fake) ListDaysInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
	if f.ListDaysInRangeFn != nil {
		return f.ListDaysInRangeFn(ctx, userID, start, end)
	}
	return nil, nil
}

func (f *Fake) FindSettings(ctx context.Context, userID int64) (*model.Settings, error) {
	if f.FindSettingsFn != nil {
		return f.FindSettingsFn(ctx, userID)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateSettings(ctx context.Context, userID int64) (*model.Settings, error) {
	if f.CreateSettingsFn != nil {
		return f.CreateSettingsFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) UpdateSettings(ctx context.Context, userID int64, u store.SettingsUpdate) (*model.Settings, error) {
	if f.UpdateSettingsFn != nil {
		return f.UpdateSettingsFn(ctx, userID, u)
	}
	return nil, nil
}

func (f *Fake) ListTaskTemplates(ctx context.Context, userID int64) ([]model.TaskTemplate, error) {
	if f.ListTaskTemplatesFn != nil {
		return f.ListTaskTemplatesFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) FindTaskTemplateByID(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error) {
	if f.FindTaskTemplateByIDFn != nil {
		return f.FindTaskTemplateByIDFn(ctx, userID, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateTaskTemplate(ctx context.Context, userID int64, text string, order int) (*model.TaskTemplate, error) {
	if f.CreateTaskTemplateFn != nil {
		return f.CreateTaskTemplateFn(ctx, userID, text, order)
	}
	return nil, nil
}

func (f *Fake) UpdateTaskTemplate(ctx context.Context, userID int64, id int64, u store.TaskTemplateUpdate) (*model.TaskTemplate, error) {
	if f.UpdateTaskTemplateFn != nil {
		return f.UpdateTaskTemplateFn(ctx, userID, id, u)
	}
	return nil, nil
}

func (f *Fake) DeleteTaskTemplate(ctx context.Context, userID int64, id int64) error {
	if f.DeleteTaskTemplateFn != nil {
		return f.DeleteTaskTemplateFn(ctx, userID, id)
	}
	return nil
}

func (f *Fake) MaxTaskTemplateOrder(ctx context.Context, userID int64) (*int, error) {
	if f.MaxTaskTemplateOrderFn != nil {
		return f.MaxTaskTemplateOrderFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) ListGtdItems(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error) {
	if f.ListGtdItemsFn != nil {
		return f.ListGtdItemsFn(ctx, userID, status)
	}
	return nil, nil
}

func (f *Fake) ListGtdItemsForDate(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error) {
	if f.ListGtdItemsForDateFn != nil {
		return f.ListGtdItemsForDateFn(ctx, userID, date)
	}
	return nil, nil
}

func (f *Fake) FindGtdItemByID(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
	if f.FindGtdItemByIDFn != nil {
		return f.FindGtdItemByIDFn(ctx, userID, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateGtdItem(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error) {
	if f.CreateGtdItemFn != nil {
		return f.CreateGtdItemFn(ctx, userID, title, status, parentID, order, plannedDate, decidedAt)
	}
	return nil, nil
}

func (f *Fake) UpdateGtdItem(ctx context.Context, userID int64, id int64, u store.GtdUpdate) (*model.GtdItem, error) {
	if f.UpdateGtdItemFn != nil {
		return f.UpdateGtdItemFn(ctx, userID, id, u)
	}
	return nil, nil
}

func (f *Fake) DeleteGtdItem(ctx context.Context, userID int64, id int64) error {
	if f.DeleteGtdItemFn != nil {
		return f.DeleteGtdItemFn(ctx, userID, id)
	}
	return nil
}

func (f *Fake) MaxGtdOrder(ctx context.Context, userID int64) (*int, error) {
	if f.MaxGtdOrderFn != nil {
		return f.MaxGtdOrderFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) ListRoutines(ctx context.Context, userID int64) ([]model.Routine, error) {
	if f.ListRoutinesFn != nil {
		return f.ListRoutinesFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) ListRoutinesWithLogs(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
	if f.ListRoutinesWithLogsFn != nil {
		return f.ListRoutinesWithLogsFn(ctx, userID, start, end)
	}
	return nil, nil
}

func (f *Fake) FindRoutineByID(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
	if f.FindRoutineByIDFn != nil {
		return f.FindRoutineByIDFn(ctx, userID, id)
	}
	return nil, pgx.ErrNoRows
}

func (f *Fake) CreateRoutine(ctx context.Context, userID int64, title string, timesPerDay, daysPerWeek int, categoryID *int64, order int) (*model.Routine, error) {
	if f.CreateRoutineFn != nil {
		return f.CreateRoutineFn(ctx, userID, title, timesPerDay, daysPerWeek, categoryID, order)
	}
	return nil, nil
}

func (f *Fake) UpdateRoutine(ctx context.Context, userID int64, id int64, u store.RoutineUpdate) (*model.Routine, error) {
	if f.UpdateRoutineFn != nil {
		return f.UpdateRoutineFn(ctx, userID, id, u)
	}
	return nil, nil
}

func (f *Fake) ArchiveRoutine(ctx context.Context, userID int64, id int64) error {
	if f.ArchiveRoutineFn != nil {
		return f.ArchiveRoutineFn(ctx, userID, id)
	}
	return nil
}

func (f *Fake) MaxRoutineOrder(ctx context.Context, userID int64) (*int, error) {
	if f.MaxRoutineOrderFn != nil {
		return f.MaxRoutineOrderFn(ctx, userID)
	}
	return nil, nil
}

func (f *Fake) UpsertRoutineLog(ctx context.Context, routineID int64, date time.Time, count int) error {
	if f.UpsertRoutineLogFn != nil {
		return f.UpsertRoutineLogFn(ctx, routineID, date, count)
	}
	return nil
}

func (f *Fake) DeleteRoutineLog(ctx context.Context, routineID int64, date time.Time) error {
	if f.DeleteRoutineLogFn != nil {
		return f.DeleteRoutineLogFn(ctx, routineID, date)
	}
	return nil
}

func (f *Fake) ListRoutineLogs(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error) {
	if f.ListRoutineLogsFn != nil {
		return f.ListRoutineLogsFn(ctx, routineIDs, start, end)
	}
	return nil, nil
}

var _ store.Store = (*Fake)(nil)
