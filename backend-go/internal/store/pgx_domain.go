package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/opt"
	"github.com/jackc/pgx/v5"
)

const categoryCols = `"id", "key", "label", "order", "archived", "userId"`
const dayCols = `"id", "date", "distractionMinutes", "pomodoros", "eveningClosed", "rating", "comment", "telegramMessageId", "weeklyTelegramMessageId", "userId", "createdAt"`
const dayCategoryStatusCols = `"id", "dayId", "categoryId", "done"`
const settingsCols = `"id", "userId", "distractionBudget", "distractionLabel", "notificationsEnabled", "telegramBotToken", "icloudAppleId", "icloudAppPasswordEnc", "icloudRemindersList", "sessionCalendarName", "sessionMinMinutes"`
const taskTemplateCols = `"id", "text", "order", "userId"`
const gtdCols = `"id", "title", "notes", "status", "parentId", "scheduledDate", "scheduledTime", "plannedDate", "dueDate", "priority", "waitingFor", "acceptanceCriteria", "discussWith", "order", "userId", "createdAt", "updatedAt", "completedAt", "decidedAt", "deferCount"`
const routineCols = `"id", "title", "timesPerDay", "daysPerWeek", "categoryId", "archived", "order", "userId", "createdAt"`
const routineLogCols = `"id", "routineId", "date", "count"`

func scanCategory(row pgx.Row) (*model.Category, error) {
	var c model.Category
	if err := row.Scan(&c.ID, &c.Key, &c.Label, &c.Order, &c.Archived, &c.UserID); err != nil {
		return nil, err
	}
	return &c, nil
}

func scanDay(row pgx.Row) (*model.Day, error) {
	var d model.Day
	if err := row.Scan(&d.ID, &d.Date, &d.DistractionMinutes, &d.Pomodoros, &d.EveningClosed, &d.Rating, &d.Comment, &d.TelegramMessageID, &d.WeeklyTelegramMessageID, &d.UserID, &d.CreatedAt); err != nil {
		return nil, err
	}
	return &d, nil
}

func scanDayCategoryStatus(row pgx.Row) (*model.DayCategoryStatus, error) {
	var s model.DayCategoryStatus
	if err := row.Scan(&s.ID, &s.DayID, &s.CategoryID, &s.Done); err != nil {
		return nil, err
	}
	return &s, nil
}

func scanSettings(row pgx.Row) (*model.Settings, error) {
	var s model.Settings
	if err := row.Scan(&s.ID, &s.UserID, &s.DistractionBudget, &s.DistractionLabel, &s.NotificationsEnabled, &s.TelegramBotToken, &s.IcloudAppleID, &s.IcloudAppPasswordEnc, &s.IcloudRemindersList, &s.SessionCalendarName, &s.SessionMinMinutes); err != nil {
		return nil, err
	}
	return &s, nil
}

func scanTaskTemplate(row pgx.Row) (*model.TaskTemplate, error) {
	var t model.TaskTemplate
	if err := row.Scan(&t.ID, &t.Text, &t.Order, &t.UserID); err != nil {
		return nil, err
	}
	return &t, nil
}

func scanGtdItem(row pgx.Row) (*model.GtdItem, error) {
	var g model.GtdItem
	if err := row.Scan(&g.ID, &g.Title, &g.Notes, &g.Status, &g.ParentID, &g.ScheduledDate, &g.ScheduledTime, &g.PlannedDate, &g.DueDate, &g.Priority, &g.WaitingFor, &g.AcceptanceCriteria, &g.DiscussWith, &g.Order, &g.UserID, &g.CreatedAt, &g.UpdatedAt, &g.CompletedAt, &g.DecidedAt, &g.DeferCount); err != nil {
		return nil, err
	}
	return &g, nil
}

func scanRoutine(row pgx.Row) (*model.Routine, error) {
	var r model.Routine
	if err := row.Scan(&r.ID, &r.Title, &r.TimesPerDay, &r.DaysPerWeek, &r.CategoryID, &r.Archived, &r.Order, &r.UserID, &r.CreatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

func scanRoutineLog(row pgx.Row) (*model.RoutineLog, error) {
	var l model.RoutineLog
	if err := row.Scan(&l.ID, &l.RoutineID, &l.Date, &l.Count); err != nil {
		return nil, err
	}
	return &l, nil
}

// setBuilder собирает SET-фразу с нумерованными параметрами.
type setBuilder struct {
	cols []string
	args []any
}

func (b *setBuilder) add(col string, v any) {
	b.cols = append(b.cols, col)
	b.args = append(b.args, v)
}

func (b *setBuilder) build() (string, []any) {
	parts := make([]string, len(b.cols))
	for i, c := range b.cols {
		parts[i] = fmt.Sprintf("%q = $%d", c, i+1)
	}
	return strings.Join(parts, ", "), b.args
}

func (s *setBuilder) addOptString(col string, f opt.String) {
	if f.Set {
		s.add(col, f.Value)
	}
}

// setNullOr adds a nullable time field: v nil (with wantNull) => NULL.
func (s *setBuilder) addTime(col string, v *time.Time, null bool) {
	if null {
		s.add(col, nil)
	} else if v != nil {
		s.add(col, *v)
	}
}

// ===== categories =====

func (s *PGStore) ListCategories(ctx context.Context, userID int64) ([]model.Category, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+categoryCols+` FROM "Category" WHERE "userId" = $1 ORDER BY "order" ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Key, &c.Label, &c.Order, &c.Archived, &c.UserID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *PGStore) ListActiveCategories(ctx context.Context, userID int64) ([]model.Category, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+categoryCols+` FROM "Category" WHERE "userId" = $1 AND "archived" = false ORDER BY "order" ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Key, &c.Label, &c.Order, &c.Archived, &c.UserID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *PGStore) FindCategoryByKey(ctx context.Context, userID int64, key string) (*model.Category, error) {
	return scanCategory(s.pool.QueryRow(ctx, `SELECT `+categoryCols+` FROM "Category" WHERE "userId" = $1 AND "key" = $2`, userID, key))
}

func (s *PGStore) FindCategoryByID(ctx context.Context, userID int64, id int64) (*model.Category, error) {
	return scanCategory(s.pool.QueryRow(ctx, `SELECT `+categoryCols+` FROM "Category" WHERE "userId" = $1 AND "id" = $2`, userID, id))
}

func (s *PGStore) CreateCategory(ctx context.Context, userID int64, key, label string, order int) (*model.Category, error) {
	return scanCategory(s.pool.QueryRow(ctx,
		`INSERT INTO "Category" ("userId", "key", "label", "order") VALUES ($1, $2, $3, $4) RETURNING `+categoryCols,
		userID, key, label, order))
}

func (s *PGStore) UpdateCategory(ctx context.Context, userID int64, key string, u CategoryUpdate) (*model.Category, error) {
	var sb setBuilder
	if u.Label != nil {
		sb.add("label", *u.Label)
	}
	if u.Order != nil {
		sb.add("order", *u.Order)
	}
	if u.Archived != nil {
		sb.add("archived", *u.Archived)
	}
	if len(sb.cols) == 0 {
		return s.FindCategoryByKey(ctx, userID, key)
	}
	set, args := sb.build()
	args = append(args, userID, key)
	return scanCategory(s.pool.QueryRow(ctx,
		`UPDATE "Category" SET `+set+` WHERE "userId" = $`+fmt.Sprint(len(args)-1)+` AND "key" = $`+fmt.Sprint(len(args))+` RETURNING `+categoryCols,
		args...))
}

func (s *PGStore) MaxCategoryOrder(ctx context.Context, userID int64) (*int, error) {
	return queryMaxOrder(ctx, s.pool.QueryRow(ctx, `SELECT max("order") FROM "Category" WHERE "userId" = $1`, userID))
}

// ===== days =====

func (s *PGStore) FindDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
	return scanDay(s.pool.QueryRow(ctx, `SELECT `+dayCols+` FROM "Day" WHERE "userId" = $1 AND "date" = $2`, userID, date))
}

func (s *PGStore) CreateDay(ctx context.Context, userID int64, date time.Time) (*model.Day, error) {
	return scanDay(s.pool.QueryRow(ctx,
		`INSERT INTO "Day" ("userId", "date") VALUES ($1, $2) RETURNING `+dayCols,
		userID, date))
}

func (s *PGStore) UpdateDay(ctx context.Context, userID int64, date time.Time, u DayUpdate) (*model.Day, error) {
	var sb setBuilder
	if u.EveningClosed != nil {
		sb.add("eveningClosed", *u.EveningClosed)
	}
	if u.Rating != nil {
		sb.add("rating", *u.Rating)
	}
	if u.Comment != nil {
		sb.add("comment", *u.Comment)
	}
	if len(sb.cols) == 0 {
		return s.FindDay(ctx, userID, date)
	}
	set, args := sb.build()
	args = append(args, userID, date)
	return scanDay(s.pool.QueryRow(ctx,
		`UPDATE "Day" SET `+set+` WHERE "userId" = $`+fmt.Sprint(len(args)-1)+` AND "date" = $`+fmt.Sprint(len(args))+` RETURNING `+dayCols,
		args...))
}

func (s *PGStore) UpdateDayDistraction(ctx context.Context, userID int64, date time.Time, minutes int) error {
	_, err := s.pool.Exec(ctx, `UPDATE "Day" SET "distractionMinutes" = $1 WHERE "userId" = $2 AND "date" = $3`, minutes, userID, date)
	return err
}

func (s *PGStore) UpdateDayPomodoros(ctx context.Context, userID int64, date time.Time, count int) error {
	_, err := s.pool.Exec(ctx, `UPDATE "Day" SET "pomodoros" = $1 WHERE "userId" = $2 AND "date" = $3`, count, userID, date)
	return err
}

func (s *PGStore) ListCategoryStatuses(ctx context.Context, dayID int64) ([]model.DayCategoryStatus, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+dayCategoryStatusCols+` FROM "DayCategoryStatus" WHERE "dayId" = $1`, dayID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.DayCategoryStatus
	for rows.Next() {
		var st model.DayCategoryStatus
		if err := rows.Scan(&st.ID, &st.DayID, &st.CategoryID, &st.Done); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *PGStore) UpsertDayCategoryStatus(ctx context.Context, dayID, categoryID int64, done bool) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO "DayCategoryStatus" ("dayId", "categoryId", "done") VALUES ($1, $2, $3)
		 ON CONFLICT ("dayId", "categoryId") DO UPDATE SET "done" = $3`,
		dayID, categoryID, done)
	return err
}

func (s *PGStore) ListDayCategoryStatusesInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.DayCategoryStatus, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT dcs.`+dayCategoryStatusCols+` FROM "DayCategoryStatus" dcs
		 JOIN "Day" d ON d."id" = dcs."dayId"
		 WHERE d."userId" = $1 AND d."date" >= $2 AND d."date" <= $3`,
		userID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.DayCategoryStatus
	for rows.Next() {
		var st model.DayCategoryStatus
		if err := rows.Scan(&st.ID, &st.DayID, &st.CategoryID, &st.Done); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *PGStore) ListDaysInRange(ctx context.Context, userID int64, start, end time.Time) ([]model.Day, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+dayCols+` FROM "Day" WHERE "userId" = $1 AND "date" >= $2 AND "date" <= $3 ORDER BY "date" ASC`, userID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Day
	for rows.Next() {
		var d model.Day
		if err := rows.Scan(&d.ID, &d.Date, &d.DistractionMinutes, &d.Pomodoros, &d.EveningClosed, &d.Rating, &d.Comment, &d.TelegramMessageID, &d.WeeklyTelegramMessageID, &d.UserID, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ===== settings =====

func (s *PGStore) FindSettings(ctx context.Context, userID int64) (*model.Settings, error) {
	return scanSettings(s.pool.QueryRow(ctx, `SELECT `+settingsCols+` FROM "Settings" WHERE "userId" = $1`, userID))
}

func (s *PGStore) CreateSettings(ctx context.Context, userID int64) (*model.Settings, error) {
	return scanSettings(s.pool.QueryRow(ctx,
		`INSERT INTO "Settings" ("userId") VALUES ($1) RETURNING `+settingsCols,
		userID))
}

func (s *PGStore) UpdateSettings(ctx context.Context, userID int64, u SettingsUpdate) (*model.Settings, error) {
	var sb setBuilder
	if u.DistractionBudget != nil {
		sb.add("distractionBudget", *u.DistractionBudget)
	}
	if u.DistractionLabel != nil {
		sb.add("distractionLabel", *u.DistractionLabel)
	}
	if u.NotificationsEnabled != nil {
		sb.add("notificationsEnabled", *u.NotificationsEnabled)
	}
	if len(sb.cols) == 0 {
		return s.FindSettings(ctx, userID)
	}
	set, args := sb.build()
	args = append(args, userID)
	return scanSettings(s.pool.QueryRow(ctx,
		`UPDATE "Settings" SET `+set+` WHERE "userId" = $`+fmt.Sprint(len(args))+` RETURNING `+settingsCols,
		args...))
}

// ===== task-templates =====

func (s *PGStore) ListTaskTemplates(ctx context.Context, userID int64) ([]model.TaskTemplate, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+taskTemplateCols+` FROM "TaskTemplate" WHERE "userId" = $1 ORDER BY "order" ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.TaskTemplate
	for rows.Next() {
		var t model.TaskTemplate
		if err := rows.Scan(&t.ID, &t.Text, &t.Order, &t.UserID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *PGStore) FindTaskTemplateByID(ctx context.Context, userID int64, id int64) (*model.TaskTemplate, error) {
	return scanTaskTemplate(s.pool.QueryRow(ctx, `SELECT `+taskTemplateCols+` FROM "TaskTemplate" WHERE "userId" = $1 AND "id" = $2`, userID, id))
}

func (s *PGStore) CreateTaskTemplate(ctx context.Context, userID int64, text string, order int) (*model.TaskTemplate, error) {
	return scanTaskTemplate(s.pool.QueryRow(ctx,
		`INSERT INTO "TaskTemplate" ("userId", "text", "order") VALUES ($1, $2, $3) RETURNING `+taskTemplateCols,
		userID, text, order))
}

func (s *PGStore) UpdateTaskTemplate(ctx context.Context, userID int64, id int64, u TaskTemplateUpdate) (*model.TaskTemplate, error) {
	var sb setBuilder
	if u.Text != nil {
		sb.add("text", *u.Text)
	}
	if u.Order != nil {
		sb.add("order", *u.Order)
	}
	if len(sb.cols) == 0 {
		return s.FindTaskTemplateByID(ctx, userID, id)
	}
	set, args := sb.build()
	args = append(args, id, userID)
	return scanTaskTemplate(s.pool.QueryRow(ctx,
		`UPDATE "TaskTemplate" SET `+set+` WHERE "id" = $`+fmt.Sprint(len(args)-1)+` AND "userId" = $`+fmt.Sprint(len(args))+` RETURNING `+taskTemplateCols,
		args...))
}

func (s *PGStore) DeleteTaskTemplate(ctx context.Context, userID int64, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "TaskTemplate" WHERE "userId" = $1 AND "id" = $2`, userID, id)
	return err
}

func (s *PGStore) MaxTaskTemplateOrder(ctx context.Context, userID int64) (*int, error) {
	return queryMaxOrder(ctx, s.pool.QueryRow(ctx, `SELECT max("order") FROM "TaskTemplate" WHERE "userId" = $1`, userID))
}

// ===== gtd =====

func (s *PGStore) ListGtdItems(ctx context.Context, userID int64, status *string) ([]model.GtdItem, error) {
	var rows pgx.Rows
	var err error
	if status != nil {
		rows, err = s.pool.Query(ctx, `SELECT `+gtdCols+` FROM "GtdItem" WHERE "userId" = $1 AND "status" = $2 ORDER BY "order" ASC`, userID, *status)
	} else {
		rows, err = s.pool.Query(ctx, `SELECT `+gtdCols+` FROM "GtdItem" WHERE "userId" = $1 AND "status" NOT IN ('done', 'archived') ORDER BY "order" ASC`, userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanGtdRows(rows)
}

func (s *PGStore) ListGtdItemsForDate(ctx context.Context, userID int64, date time.Time) ([]model.GtdItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+gtdCols+` FROM "GtdItem"
		 WHERE "userId" = $1 AND "status" <> 'archived'
		   AND ("plannedDate" = $2 OR ("status" = 'calendar' AND "scheduledDate" = $2))
		 ORDER BY "order" ASC`,
		userID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanGtdRows(rows)
}

func scanGtdRows(rows pgx.Rows) ([]model.GtdItem, error) {
	var out []model.GtdItem
	for rows.Next() {
		var g model.GtdItem
		if err := rows.Scan(&g.ID, &g.Title, &g.Notes, &g.Status, &g.ParentID, &g.ScheduledDate, &g.ScheduledTime, &g.PlannedDate, &g.DueDate, &g.Priority, &g.WaitingFor, &g.AcceptanceCriteria, &g.DiscussWith, &g.Order, &g.UserID, &g.CreatedAt, &g.UpdatedAt, &g.CompletedAt, &g.DecidedAt, &g.DeferCount); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (s *PGStore) FindGtdItemByID(ctx context.Context, userID int64, id int64) (*model.GtdItem, error) {
	return scanGtdItem(s.pool.QueryRow(ctx, `SELECT `+gtdCols+` FROM "GtdItem" WHERE "userId" = $1 AND "id" = $2`, userID, id))
}

func (s *PGStore) CreateGtdItem(ctx context.Context, userID int64, title, status string, parentID *int64, order int, plannedDate *time.Time, decidedAt time.Time) (*model.GtdItem, error) {
	return scanGtdItem(s.pool.QueryRow(ctx,
		`INSERT INTO "GtdItem" ("userId", "title", "status", "parentId", "order", "plannedDate", "decidedAt", "updatedAt")
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING `+gtdCols,
		userID, title, status, parentID, order, plannedDate, decidedAt))
}

func (s *PGStore) UpdateGtdItem(ctx context.Context, userID int64, id int64, u GtdUpdate) (*model.GtdItem, error) {
	var sb setBuilder
	if u.Title != nil {
		sb.add("title", *u.Title)
	}
	if u.Status != nil {
		sb.add("status", *u.Status)
	}
	if u.Priority != nil {
		sb.add("priority", *u.Priority)
	}
	sb.addOptString("notes", u.Notes)
	sb.addOptString("waitingFor", u.WaitingFor)
	sb.addOptString("acceptanceCriteria", u.AcceptanceCriteria)
	sb.addOptString("discussWith", u.DiscussWith)
	sb.addOptString("scheduledTime", u.ScheduledTime)
	sb.addTime("scheduledDate", u.ScheduledDate, u.ScheduledDateNull)
	sb.addTime("plannedDate", u.PlannedDate, u.PlannedDateNull)
	sb.addTime("dueDate", u.DueDate, u.DueDateNull)
	if u.DecidedAt != nil {
		sb.add("decidedAt", *u.DecidedAt)
	}
	if u.DeferCount != nil {
		sb.add("deferCount", *u.DeferCount)
	}
	sb.addTime("completedAt", u.CompletedAt, u.CompletedAtNull)
	if len(sb.cols) == 0 {
		return s.FindGtdItemByID(ctx, userID, id)
	}
	sb.add("updatedAt", time.Now())
	set, args := sb.build()
	args = append(args, id, userID)
	return scanGtdItem(s.pool.QueryRow(ctx,
		`UPDATE "GtdItem" SET `+set+` WHERE "id" = $`+fmt.Sprint(len(args)-1)+` AND "userId" = $`+fmt.Sprint(len(args))+` RETURNING `+gtdCols,
		args...))
}

func (s *PGStore) DeleteGtdItem(ctx context.Context, userID int64, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "GtdItem" WHERE "userId" = $1 AND "id" = $2`, userID, id)
	return err
}

func (s *PGStore) MaxGtdOrder(ctx context.Context, userID int64) (*int, error) {
	return queryMaxOrder(ctx, s.pool.QueryRow(ctx, `SELECT max("order") FROM "GtdItem" WHERE "userId" = $1`, userID))
}

// ===== routines =====

func (s *PGStore) ListRoutines(ctx context.Context, userID int64) ([]model.Routine, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+routineCols+` FROM "Routine" WHERE "userId" = $1 AND "archived" = false ORDER BY "order" ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Routine
	for rows.Next() {
		var r model.Routine
		if err := rows.Scan(&r.ID, &r.Title, &r.TimesPerDay, &r.DaysPerWeek, &r.CategoryID, &r.Archived, &r.Order, &r.UserID, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *PGStore) ListRoutinesWithLogs(ctx context.Context, userID int64, start, end time.Time) ([]model.RoutineWithLogs, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT r.`+routineCols+`, l.`+routineLogCols+`
		 FROM "Routine" r
		 LEFT JOIN "RoutineLog" l ON l."routineId" = r."id" AND l."date" >= $2 AND l."date" <= $3
		 WHERE r."userId" = $1 AND r."archived" = false
		 ORDER BY r."order" ASC, l."date" ASC`,
		userID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[int64]*model.RoutineWithLogs{}
	var order []int64
	for rows.Next() {
		var r model.Routine
		var lID *int64
		var lDate *time.Time
		var lCount *int
		var lRoutineID *int64
		if err := rows.Scan(&r.ID, &r.Title, &r.TimesPerDay, &r.DaysPerWeek, &r.CategoryID, &r.Archived, &r.Order, &r.UserID, &r.CreatedAt, &lID, &lRoutineID, &lDate, &lCount); err != nil {
			return nil, err
		}
		entry, ok := byID[r.ID]
		if !ok {
			entry = &model.RoutineWithLogs{Routine: r, Logs: nil}
			byID[r.ID] = entry
			order = append(order, r.ID)
		}
		if lID != nil && lDate != nil && lCount != nil {
			entry.Logs = append(entry.Logs, model.RoutineLog{ID: *lID, RoutineID: *lRoutineID, Date: *lDate, Count: *lCount})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]model.RoutineWithLogs, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}
	return out, nil
}

func (s *PGStore) FindRoutineByID(ctx context.Context, userID int64, id int64) (*model.Routine, error) {
	return scanRoutine(s.pool.QueryRow(ctx, `SELECT `+routineCols+` FROM "Routine" WHERE "userId" = $1 AND "id" = $2`, userID, id))
}

func (s *PGStore) CreateRoutine(ctx context.Context, userID int64, title string, timesPerDay, daysPerWeek int, categoryID *int64, order int) (*model.Routine, error) {
	return scanRoutine(s.pool.QueryRow(ctx,
		`INSERT INTO "Routine" ("userId", "title", "timesPerDay", "daysPerWeek", "categoryId", "order")
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING `+routineCols,
		userID, title, timesPerDay, daysPerWeek, categoryID, order))
}

func (s *PGStore) UpdateRoutine(ctx context.Context, userID int64, id int64, u RoutineUpdate) (*model.Routine, error) {
	var sb setBuilder
	if u.Title != nil {
		sb.add("title", *u.Title)
	}
	if u.TimesPerDay != nil {
		sb.add("timesPerDay", *u.TimesPerDay)
	}
	if u.DaysPerWeek != nil {
		sb.add("daysPerWeek", *u.DaysPerWeek)
	}
	if u.CategorySet {
		sb.add("categoryId", u.CategoryID)
	}
	if u.Archived != nil {
		sb.add("archived", *u.Archived)
	}
	if len(sb.cols) == 0 {
		return s.FindRoutineByID(ctx, userID, id)
	}
	set, args := sb.build()
	args = append(args, id, userID)
	return scanRoutine(s.pool.QueryRow(ctx,
		`UPDATE "Routine" SET `+set+` WHERE "id" = $`+fmt.Sprint(len(args)-1)+` AND "userId" = $`+fmt.Sprint(len(args))+` RETURNING `+routineCols,
		args...))
}

func (s *PGStore) ArchiveRoutine(ctx context.Context, userID int64, id int64) error {
	_, err := s.pool.Exec(ctx, `UPDATE "Routine" SET "archived" = true WHERE "userId" = $1 AND "id" = $2`, userID, id)
	return err
}

func (s *PGStore) MaxRoutineOrder(ctx context.Context, userID int64) (*int, error) {
	return queryMaxOrder(ctx, s.pool.QueryRow(ctx, `SELECT max("order") FROM "Routine" WHERE "userId" = $1`, userID))
}

func (s *PGStore) UpsertRoutineLog(ctx context.Context, routineID int64, date time.Time, count int) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO "RoutineLog" ("routineId", "date", "count") VALUES ($1, $2, $3)
		 ON CONFLICT ("routineId", "date") DO UPDATE SET "count" = $3`,
		routineID, date, count)
	return err
}

func (s *PGStore) DeleteRoutineLog(ctx context.Context, routineID int64, date time.Time) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM "RoutineLog" WHERE "routineId" = $1 AND "date" = $2`, routineID, date)
	return err
}

func (s *PGStore) ListRoutineLogs(ctx context.Context, routineIDs []int64, start, end time.Time) ([]model.RoutineLog, error) {
	if len(routineIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT `+routineLogCols+` FROM "RoutineLog" WHERE "routineId" = ANY($1) AND "date" >= $2 AND "date" <= $3`,
		routineIDs, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.RoutineLog
	for rows.Next() {
		var l model.RoutineLog
		if err := rows.Scan(&l.ID, &l.RoutineID, &l.Date, &l.Count); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// queryMaxOrder читает max(order) с учётом NULL (пустая таблица => NULL).
func queryMaxOrder(ctx context.Context, row pgx.Row) (*int, error) {
	var v *int
	if err := row.Scan(&v); err != nil {
		return nil, err
	}
	return v, nil
}
