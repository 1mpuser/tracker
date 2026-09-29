package model

import "time"

// Category соответствует строке таблицы "Category" (сфера). Поля совпадают с
// JSON-контрактом backend/src/categories.
type Category struct {
	ID       int64  `json:"id"`
	Key      string `json:"key"`
	Label    string `json:"label"`
	Order    int    `json:"order"`
	Archived bool   `json:"archived"`
	UserID   int64  `json:"userId"`
}

// Day соответствует строке таблицы "Day".
type Day struct {
	ID                      int64
	Date                    time.Time
	DistractionMinutes      int
	Pomodoros               int
	EveningClosed           bool
	Rating                  *int
	Comment                 *string
	TelegramMessageID       *int
	WeeklyTelegramMessageID *int
	UserID                  int64
	CreatedAt               time.Time
}

// DayCategoryStatus — статус сферы в конкретный день (таблица "DayCategoryStatus").
type DayCategoryStatus struct {
	ID         int64
	DayID      int64
	CategoryID int64
	Done       bool
}

// TaskTemplate соответствует строке таблицы "TaskTemplate".
type TaskTemplate struct {
	ID     int64  `json:"id"`
	Text   string `json:"text"`
	Order  int    `json:"order"`
	UserID int64  `json:"userId"`
}

// Settings соответствует строке таблицы "Settings".
type Settings struct {
	ID                   int64
	UserID               int64
	DistractionBudget    int
	DistractionLabel     string
	NotificationsEnabled bool
	TelegramBotToken     *string
	IcloudAppleID        *string
	IcloudAppPasswordEnc *string
	IcloudRemindersList  string
	SessionCalendarName  *string
	SessionMinMinutes    int
}

// GtdItem соответствует строке таблицы "GtdItem".
type GtdItem struct {
	ID                 int64
	Title              string
	Notes              *string
	Status             string
	ParentID           *int64
	ScheduledDate      *time.Time
	ScheduledTime      *string
	PlannedDate        *time.Time
	DueDate            *time.Time
	Priority           bool
	WaitingFor         *string
	AcceptanceCriteria *string
	DiscussWith        *string
	Order              int
	UserID             int64
	CreatedAt          time.Time
	UpdatedAt          time.Time
	CompletedAt        *time.Time
	DecidedAt          *time.Time
	DeferCount         int
}

// Routine соответствует строке таблицы "Routine".
type Routine struct {
	ID          int64     `json:"id"`
	Title       string    `json:"title"`
	TimesPerDay int       `json:"timesPerDay"`
	DaysPerWeek int       `json:"daysPerWeek"`
	CategoryID  *int64    `json:"categoryId"`
	Archived    bool      `json:"archived"`
	Order       int       `json:"order"`
	UserID      int64     `json:"userId"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RoutineLog — отметка выполнения рутины в конкретный день (таблица "RoutineLog").
type RoutineLog struct {
	ID        int64
	RoutineID int64
	Date      time.Time
	Count     int
}

// RoutineWithLogs — рутина вместе с её отметками (для недельного среза).
type RoutineWithLogs struct {
	Routine
	Logs []RoutineLog
}
