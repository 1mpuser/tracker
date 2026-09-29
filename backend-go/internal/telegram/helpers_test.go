package telegram

import (
	"strings"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/days"
)

func TestBuildDaySummary(t *testing.T) {
	rating := 8
	comment := "прочитал <книгу>"
	cats := []DayCategorySummary{
		{Label: "Работа", Done: true},
		{Label: "Спорт", Done: false},
	}
	summary := BuildDaySummary(DaySummaryInput{
		Date:       "2026-08-14",
		Pomodoros:  5,
		Rating:     &rating,
		Comment:    &comment,
		Categories: cats,
	})
	if !strings.Contains(summary, "📅 14 августа 2026, пятница") {
		t.Fatalf("дата не та:\n%s", summary)
	}
	if !strings.Contains(summary, "🍅 Помидорок: 5 — день в зачёте") {
		t.Fatalf("помидорки не та:\n%s", summary)
	}
	if !strings.Contains(summary, "⭐ Оценка: 8/10") {
		t.Fatalf("оценка не та:\n%s", summary)
	}
	if !strings.Contains(summary, "Сферы — 1 / 2") {
		t.Fatalf("сферы не та:\n%s", summary)
	}
	if !strings.Contains(summary, "✅ Работа") {
		t.Fatalf("нет закрытой сферы:\n%s", summary)
	}
	if !strings.Contains(summary, "Не тронуты: Спорт") {
		t.Fatalf("нет нетронутых:\n%s", summary)
	}
	// HTML-экранирование комментария
	if !strings.Contains(summary, "💬 прочитал &lt;книгу&gt;") {
		t.Fatalf("комментарий не экранирован:\n%s", summary)
	}
}

func TestBuildDaySummaryNoCategoriesTouched(t *testing.T) {
	summary := BuildDaySummary(DaySummaryInput{
		Date:       "2026-08-14",
		Pomodoros:  2,
		Categories: []DayCategorySummary{{Label: "Спорт", Done: false}},
	})
	if !strings.Contains(summary, "Сферы не тронуты") {
		t.Fatalf("ожидалось «Сферы не тронуты»:\n%s", summary)
	}
}

func TestEscapeHTML(t *testing.T) {
	got := EscapeHTML(`a & b < c > d`)
	if got != "a &amp; b &lt; c &gt; d" {
		t.Fatalf("got %q", got)
	}
}

func TestFitsInCaption(t *testing.T) {
	if !FitsInCaption(strings.Repeat("x", TELEGRAM_CAPTION_LIMIT)) {
		t.Fatal("ровно на лимите должно помещаться")
	}
	if FitsInCaption(strings.Repeat("x", TELEGRAM_CAPTION_LIMIT+1)) {
		t.Fatal("больше лимита не должно помещаться")
	}
}

func TestFromDayView(t *testing.T) {
	rating := 7
	input := FromDayView(days.DayView{
		Date:       "2026-08-14",
		Pomodoros:  3,
		Rating:     &rating,
		Comment:    nil,
		Categories: []days.DayCategoryView{{Key: "sport", Label: "Спорт", Done: true}},
	})
	if input.Date != "2026-08-14" || input.Pomodoros != 3 || input.Rating == nil || *input.Rating != 7 {
		t.Fatalf("input=%+v", input)
	}
	if len(input.Categories) != 1 || input.Categories[0].Label != "Спорт" || !input.Categories[0].Done {
		t.Fatalf("categories=%+v", input.Categories)
	}
}
