// Package telegram — перенос telegram-модуля из backend/src/telegram:
// тупой HTTP-клиент Bot API, конфиг (токен/чаты из Settings/TelegramChat),
// рассылка сводок с идемпотентностью через TelegramPost.
package telegram

import (
	"fmt"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/days"
)

// TELEGRAM_CAPTION_LIMIT — Telegram обрезает подпись к фото на 1024 символах.
const TELEGRAM_CAPTION_LIMIT = 1024

// POMODORO_MIN — порог «зачётного» дня (frontend/lib/pomodoro.ts).
const POMODORO_MIN = 4

var monthsGenitive = [...]string{
	"января", "февраля", "марта", "апреля", "мая", "июня",
	"июля", "августа", "сентября", "октября", "ноября", "декабря",
}

var weekdaysGenitive = [...]string{
	"воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота",
}

// EscapeHTML экранирует текст для HTML-разметки Telegram.
func EscapeHTML(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

func formatRuDate(dateStr string) string {
	d, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		return dateStr
	}
	return fmt.Sprintf("%d %s %d, %s", d.Day(), monthsGenitive[int(d.Month())-1], d.Year(), weekdaysGenitive[int(d.Weekday())])
}

func pomodoroLine(pomodoros int) string {
	if pomodoros >= POMODORO_MIN {
		return fmt.Sprintf("🍅 Помидорок: %d — день в зачёте", pomodoros)
	}
	if pomodoros > 0 {
		return fmt.Sprintf("🍅 Помидорок: %d — до зачёта не хватило %d", pomodoros, POMODORO_MIN-pomodoros)
	}
	return fmt.Sprintf("🍅 Помидорок: %d", pomodoros)
}

// DaySummaryInput — вход сводки дня (telegram.helpers.ts DaySummaryInput).
type DaySummaryInput struct {
	Date       string
	Pomodoros  int
	Rating     *int
	Comment    *string
	Categories []DayCategorySummary
}

// DayCategorySummary — сфера в сводке.
type DayCategorySummary struct {
	Label string
	Done  bool
}

// FromDayView собирает вход сводки из views.DayView.
func FromDayView(view days.DayView) DaySummaryInput {
	input := DaySummaryInput{
		Date:      view.Date,
		Pomodoros: view.Pomodoros,
		Rating:    view.Rating,
		Comment:   view.Comment,
	}
	for _, c := range view.Categories {
		input.Categories = append(input.Categories, DayCategorySummary{Label: c.Label, Done: c.Done})
	}
	return input
}

// BuildDaySummary собирает текст дневной сводки (telegram.helpers.ts).
func BuildDaySummary(day DaySummaryInput) string {
	var lines []string
	lines = append(lines, "📅 "+formatRuDate(day.Date), "")
	lines = append(lines, pomodoroLine(day.Pomodoros))

	if day.Rating != nil {
		lines = append(lines, fmt.Sprintf("⭐ Оценка: %d/10", *day.Rating))
	}

	if len(day.Categories) > 0 {
		var done, untouched []DayCategorySummary
		for _, c := range day.Categories {
			if c.Done {
				done = append(done, c)
			} else {
				untouched = append(untouched, c)
			}
		}
		if len(done) == 0 {
			lines = append(lines, "", "Сферы не тронуты")
		} else {
			lines = append(lines, "", fmt.Sprintf("Сферы — %d / %d", len(done), len(day.Categories)))
			for _, c := range done {
				lines = append(lines, "✅ "+EscapeHTML(c.Label))
			}
			if len(untouched) > 0 {
				labels := make([]string, 0, len(untouched))
				for _, c := range untouched {
					labels = append(labels, EscapeHTML(c.Label))
				}
				lines = append(lines, "Не тронуты: "+strings.Join(labels, ", "))
			}
		}
	}

	if day.Comment != nil && strings.TrimSpace(*day.Comment) != "" {
		lines = append(lines, "", "💬 "+EscapeHTML(strings.TrimSpace(*day.Comment)))
	}

	return strings.Join(lines, "\n")
}

// FitsInCaption — помещается ли текст в подпись к фото.
func FitsInCaption(text string) bool {
	return len(text) <= TELEGRAM_CAPTION_LIMIT
}
