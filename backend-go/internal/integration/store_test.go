package integration

import (
	"context"
	"testing"
	"time"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store"
)

// Проверка SQL-слоя для routines/gtd/task-templates/days на реальной БД:
// ловит ошибки в запросах, которые unit-тесты (мок) не видят.
func TestStoreRoutinesRoundTrip(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	r, err := st.CreateRoutine(ctx, u.ID, "Гигиена", 2, 7, nil, 0)
	if err != nil {
		t.Fatalf("create routine: %v", err)
	}
	date := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)
	if err := st.UpsertRoutineLog(ctx, r.ID, date, 2); err != nil {
		t.Fatalf("upsert log: %v", err)
	}
	withLogs, err := st.ListRoutinesWithLogs(ctx, u.ID, time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC), time.Date(2026, 8, 16, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("list with logs: %v", err)
	}
	if len(withLogs) != 1 || len(withLogs[0].Logs) != 1 || withLogs[0].Logs[0].Count != 2 {
		t.Fatalf("withLogs=%+v", withLogs)
	}
	// обновление и архивация
	dw := 5
	if _, err := st.UpdateRoutine(ctx, u.ID, r.ID, store.RoutineUpdate{DaysPerWeek: &dw}); err != nil {
		t.Fatalf("update routine: %v", err)
	}
	if err := st.ArchiveRoutine(ctx, u.ID, r.ID); err != nil {
		t.Fatalf("archive routine: %v", err)
	}
	list, err := st.ListRoutines(ctx, u.ID)
	if err != nil {
		t.Fatalf("list routines: %v", err)
	}
	for _, item := range list {
		if item.ID == r.ID {
			t.Fatalf("archived routine still listed")
		}
	}
}

func TestStoreGtdRoundTrip(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	nilParent := (*int64)(nil)
	item, err := st.CreateGtdItem(ctx, u.ID, "Задача", "backlog", nilParent, 0, nil, time.Now())
	if err != nil {
		t.Fatalf("create gtd: %v", err)
	}
	if item.ID == 0 {
		t.Fatal("no id returned")
	}
	// существующая: обновляем статус и дату
	d := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	upd, err := st.UpdateGtdItem(ctx, u.ID, item.ID, store.GtdUpdate{
		Status:        strPtr2("calendar"),
		ScheduledDate: &d,
	})
	if err != nil {
		t.Fatalf("update gtd: %v", err)
	}
	if upd.Status != "calendar" || upd.ScheduledDate == nil || upd.ScheduledDate.Format("2006-01-02") != "2026-07-25" {
		t.Fatalf("upd=%+v", upd)
	}
	items, err := st.ListGtdItemsForDate(ctx, u.ID, d)
	if err != nil {
		t.Fatalf("list for date: %v", err)
	}
	if len(items) != 1 || items[0].ID != item.ID {
		t.Fatalf("for date items=%+v", items)
	}
	if err := st.DeleteGtdItem(ctx, u.ID, item.ID); err != nil {
		t.Fatalf("delete gtd: %v", err)
	}
}

func TestStoreTaskTemplatesRoundTrip(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	tt, err := st.CreateTaskTemplate(ctx, u.ID, "Тренировка", 0)
	if err != nil {
		t.Fatalf("create tt: %v", err)
	}
	text := "Английский"
	upd, err := st.UpdateTaskTemplate(ctx, u.ID, tt.ID, store.TaskTemplateUpdate{Text: &text})
	if err != nil {
		t.Fatalf("update tt: %v", err)
	}
	if upd.Text != "Английский" {
		t.Fatalf("got %q", upd.Text)
	}
	list, err := st.ListTaskTemplates(ctx, u.ID)
	if err != nil {
		t.Fatalf("list tt: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("want 1, got %d", len(list))
	}
	if err := st.DeleteTaskTemplate(ctx, u.ID, tt.ID); err != nil {
		t.Fatalf("delete tt: %v", err)
	}
}

func TestStoreTelegramChatRoundTrip(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	chat, err := st.CreateTelegramChat(ctx, u.ID, "Канал", "-1001", true, true)
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	// занятый chatId для этого пользователя → unique violation
	if _, err := st.CreateTelegramChat(ctx, u.ID, "Дубль", "-1001", true, true); !store.IsUniqueViolation(err) {
		t.Fatalf("ожидался unique violation, got %v", err)
	}
	list, err := st.ListTelegramChats(ctx, u.ID)
	if err != nil {
		t.Fatalf("list chats: %v", err)
	}
	if len(list) != 1 || list[0].ChatID != "-1001" || !list[0].Daily {
		t.Fatalf("list=%+v", list)
	}
	weekly := false
	if _, err := st.UpdateTelegramChat(ctx, u.ID, chat.ID, store.TelegramChatUpdate{Weekly: &weekly}); err != nil {
		t.Fatalf("update chat: %v", err)
	}
	found, err := st.FindTelegramChatByID(ctx, u.ID, chat.ID)
	if err != nil {
		t.Fatalf("find chat: %v", err)
	}
	if found.Weekly {
		t.Fatalf("weekly должен быть false")
	}
	if err := st.DeleteTelegramChat(ctx, u.ID, chat.ID); err != nil {
		t.Fatalf("delete chat: %v", err)
	}
}

func TestStoreTelegramPostRoundTrip(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	chat, err := st.CreateTelegramChat(ctx, u.ID, "Канал", "-1001", true, true)
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	day := time.Date(2026, 8, 14, 0, 0, 0, 0, time.UTC)
	row, err := st.CreateDay(ctx, u.ID, day)
	if err != nil {
		t.Fatalf("create day: %v", err)
	}

	post, err := st.CreateTelegramPost(ctx, row.ID, chat.ChatID, "day", 0)
	if err != nil {
		t.Fatalf("create post: %v", err)
	}
	// уникальность [dayId, chatId, kind]
	if _, err := st.CreateTelegramPost(ctx, row.ID, chat.ChatID, "day", 0); !store.IsUniqueViolation(err) {
		t.Fatalf("ожидался unique violation, got %v", err)
	}
	if err := st.UpdateTelegramPostMessageID(ctx, post.ID, 42); err != nil {
		t.Fatalf("update post msgid: %v", err)
	}
	found, err := st.FindTelegramPost(ctx, row.ID, chat.ChatID, "day")
	if err != nil {
		t.Fatalf("find post: %v", err)
	}
	if found.MessageID != 42 {
		t.Fatalf("found=%+v", found)
	}
	if err := st.DeleteTelegramPost(ctx, post.ID); err != nil {
		t.Fatalf("delete post: %v", err)
	}
}

func TestStoreDayUpdateFields(t *testing.T) {
	pool := setupPool(t)
	st := store.NewPGStore(pool)
	ctx := context.Background()
	u := newUser(t, st)

	date := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)
	day, err := st.CreateDay(ctx, u.ID, date)
	if err != nil {
		t.Fatalf("create day: %v", err)
	}
	closed := true
	rating := 8
	if _, err := st.UpdateDay(ctx, u.ID, date, store.DayUpdate{EveningClosed: &closed, Rating: &rating}); err != nil {
		t.Fatalf("update day: %v", err)
	}
	got, err := st.FindDay(ctx, u.ID, date)
	if err != nil {
		t.Fatalf("find day: %v", err)
	}
	if !got.EveningClosed || got.Rating == nil || *got.Rating != 8 {
		t.Fatalf("got=%+v", got)
	}
	// статус сферы
	cat, err := st.ListActiveCategories(ctx, u.ID)
	if err != nil {
		t.Fatalf("list active: %v", err)
	}
	if len(cat) == 0 {
		t.Fatal("no default categories")
	}
	if err := st.UpsertDayCategoryStatus(ctx, day.ID, cat[0].ID, true); err != nil {
		t.Fatalf("upsert status: %v", err)
	}
	statuses, err := st.ListCategoryStatuses(ctx, day.ID)
	if err != nil {
		t.Fatalf("list statuses: %v", err)
	}
	if len(statuses) != 1 || !statuses[0].Done {
		t.Fatalf("statuses=%+v", statuses)
	}
}

func strPtr2(s string) *string { return &s }

var _ = model.AuthUser{}
