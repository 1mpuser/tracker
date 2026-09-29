package store

import (
	"context"
	"errors"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/opt"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrUniqueViolation = errors.New("unique violation")

// CategoryUpdate — частичное обновление сферы. nil-указатель = поле не трогаем.
type CategoryUpdate struct {
	Label    *string
	Order    *int
	Archived *bool
}

// DayUpdate — частичное обновление дня (eveningClosed/rating/comment).
type DayUpdate struct {
	EveningClosed *bool
	Rating        *int
	Comment       *string
}

// SettingsUpdate — частичное обновление настроек пользователя.
type SettingsUpdate struct {
	DistractionBudget    *int
	DistractionLabel     *string
	NotificationsEnabled *bool
}

// TaskTemplateUpdate — частичное обновление шаблона задачи.
type TaskTemplateUpdate struct {
	Text  *string
	Order *int
}

// RoutineUpdate — частичное обновление рутины. CategorySet=true меняет
// категорию: *CategoryID — значение, либо null при CategoryID=nil (отвязка).
type RoutineUpdate struct {
	Title       *string
	TimesPerDay *int
	DaysPerWeek *int
	CategoryID  *int64
	CategorySet bool
	Archived    *bool
}

// GtdUpdate — частичное обновление GTD-задачи. opt.String несёт различие
// «не передано» (Set=false) от «передано как null» (Set=true, Value=nil).
// Поля дат: значения парсятся в сервисе; XxxNull=true пишет NULL.
type GtdUpdate struct {
	Title              *string
	Status             *string
	Priority           *bool
	Notes              opt.String
	WaitingFor         opt.String
	AcceptanceCriteria opt.String
	DiscussWith        opt.String
	ScheduledTime      opt.String
	ScheduledDate      *time.Time
	ScheduledDateNull  bool
	PlannedDate        *time.Time
	PlannedDateNull    bool
	DueDate            *time.Time
	DueDateNull        bool
	DecidedAt          *time.Time
	CompletedAt        *time.Time
	CompletedAtNull    bool
	DeferCount         *int
}

// Store — набор операций с БД, нужных auth/admin/bootstrap. Реализована на
// pgx (PGStore), мокается в unit-тестах. userId всегда первым аргументом, где
// речь о чужой записи.
type Store interface {
	// ---- users ----
	FindUserByEmail(ctx context.Context, email string) (*model.User, error)
	FindUserByID(ctx context.Context, id int64) (*model.User, error)
	ListUsers(ctx context.Context) ([]model.User, error)
	UpdateUserPasswordHash(ctx context.Context, id int64, hash string) error
	UpdateUserTimezone(ctx context.Context, id int64, timezone string) error
	UpdateUserBlockedAt(ctx context.Context, id int64, blockedAt *time.Time) error
	UpdateUserAdmin(ctx context.Context, id int64, isAdmin bool) error
	DeleteUser(ctx context.Context, id int64) error

	// ---- sessions ----
	CreateSession(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time, userAgent *string) error
	FindSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error)
	UpdateSession(ctx context.Context, id int64, lastSeenAt, expiresAt time.Time) error
	DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error
	DeleteSessionsByUser(ctx context.Context, userID int64) error
	DeleteSessionsByUserExcept(ctx context.Context, userID int64, tokenHash string) error
	DeleteExpiredSessions(ctx context.Context, now time.Time) error

	// ---- создание учётки одной транзакцией (UserBootstrapService) ----
	CreateUserWithDefaults(ctx context.Context, email string, passwordHash *string, timezone string, distractionBudget int) (*model.User, error)

	// ---- categories (сферы) ----
	ListCategories(ctx context.Context, userID int64) ([]model.Category, error)
	ListActiveCategories(ctx context.Context, userID int64) ([]model.Category, error)
	FindCategoryByKey(ctx context.Context, userID int64, key string) (*model.Category, error)
	FindCategoryByID(ctx context.Context, userID int64, id int64) (*model.Category, error)
	CreateCategory(ctx context.Context, userID int64, key, label string, order int) (*model.Category, error)
	UpdateCategory(ctx context.Context, userID int64, key string, u CategoryUpdate) (*model.Category, error)
	MaxCategoryOrder(ctx context.Context, userID int64) (*int, error)

	// ---- days ----
	FindDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error)
	CreateDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error)
	UpdateDay(ctx context.Context, userID int64, date time.Time, u DayUpdate) (*model.Day, error)
	UpdateDayDistraction(ctx context.Context, userID int64, date time.Time, minutes int) error
	UpdateDayPomodoros(ctx context.Context, userID int64, date time.Time, count int) error
	ListCategoryStatuses(ctx context.Context, dayID int64) ([]model.DayCategoryStatus, error)
	UpsertDayCategoryStatus(ctx context.Context, dayID, categoryID int64, done bool) error
	ListDayCategoryStatusesInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error)
	ListDaysInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error)

	// ---- settings ----
	FindSettings(ctx context.Context, userID int64) (*model.Settings, error)
	CreateSettings(ctx context.Context, userID int64) (*model.Settings, error)
	UpdateSettings(ctx context.Context, userID int64, u SettingsUpdate) (*model.Settings, error)

	// ---- task-templates ----
	ListTaskTemplates(ctx context.Context, userID int64) ([]model.TaskTemplate, error)
	FindTaskTemplateByID(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error)
	CreateTaskTemplate(ctx context.Context, userID int64, text string, order int) (*model.TaskTemplate, error)
	UpdateTaskTemplate(ctx context.Context, userID int64, id int64, u TaskTemplateUpdate) (*model.TaskTemplate, error)
	DeleteTaskTemplate(ctx context.Context, userID int64, id int64) error
	MaxTaskTemplateOrder(ctx context.Context, userID int64) (*int, error)

	// ---- gtd ----
	ListGtdItems(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error)
	ListGtdItemsForDate(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error)
	FindGtdItemByID(ctx context.Context, userID int64, id int64) (*model.GtdItem, error)
	CreateGtdItem(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error)
	UpdateGtdItem(ctx context.Context, userID int64, id int64, u GtdUpdate) (*model.GtdItem, error)
	DeleteGtdItem(ctx context.Context, userID int64, id int64) error
	MaxGtdOrder(ctx context.Context, userID int64) (*int, error)

	// ---- routines ----
	ListRoutines(ctx context.Context, userID int64) ([]model.Routine, error)
	ListRoutinesWithLogs(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error)
	FindRoutineByID(ctx context.Context, userID int64, id int64) (*model.Routine, error)
	CreateRoutine(ctx context.Context, userID int64, title string, timesPerDay, daysPerWeek int, categoryID *int64, order int) (*model.Routine, error)
	UpdateRoutine(ctx context.Context, userID int64, id int64, u RoutineUpdate) (*model.Routine, error)
	ArchiveRoutine(ctx context.Context, userID int64, id int64) error
	MaxRoutineOrder(ctx context.Context, userID int64) (*int, error)
	UpsertRoutineLog(ctx context.Context, routineID int64, date time.Time, count int) error
	DeleteRoutineLog(ctx context.Context, routineID int64, date time.Time) error
	ListRoutineLogs(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error)
}

// IsUniqueViolation проверяет, что ошибка — нарушение уникальности в Postgres
// (код 23505, аналог Prisma P2002).
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return errors.Is(err, ErrUniqueViolation)
}
