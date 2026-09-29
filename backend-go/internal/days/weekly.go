package days

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/stats"
)

// POMODORO_MIN — порог «зачётного» дня (frontend/lib/pomodoro.ts).
const POMODORO_MIN = 4

const daysInWeek = 7

var monthsGenitive = [...]string{
	"января", "февраля", "марта", "апреля", "мая", "июня",
	"июля", "августа", "сентября", "октября", "ноября", "декабря",
}

// BuildWeekSummary собирает текст недельной сводки (weekly.helpers.ts).
// Вызывается только для уже закрытого дня; здесь текст читается из
// реальных чисел недели, чтобы пост не разошёлся с ними.
func BuildWeekSummary(st stats.WeekStats) string {
	qualified := 0
	for _, d := range st.Days {
		if d.Pomodoros >= POMODORO_MIN {
			qualified++
		}
	}

	var b strings.Builder
	b.WriteString("📊 Неделя " + formatWeekRange(st.WeekStart, st.WeekEnd))
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("🍅 Помидорок: %d (в среднем %s/день)", st.TotalPomodoros, trimFloat(st.AvgPomodoros)))
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("✅ В зачёте: %d из %d дней", qualified, daysInWeek))

	if st.BestDay != nil {
		weekday := dateutil.WeekdayFull[weekdayIndex(st.BestDay.Date)]
		b.WriteString("\n")
		b.WriteString(fmt.Sprintf("🔥 Лучший день: %s — %d", weekday, st.BestDay.Pomodoros))
	}

	if st.AvgRating != nil {
		b.WriteString("\n")
		b.WriteString(fmt.Sprintf("⭐ Средняя оценка: %s/10 (по %d %s)", trimFloat(*st.AvgRating), st.RatedDays, pluralDays(st.RatedDays)))
	}

	if len(st.Categories) > 0 {
		b.WriteString("\n\nСферы за неделю")
		var touched []stats.CategoryCount
		var untouched []stats.CategoryCount
		for _, c := range st.Categories {
			if c.DoneCount > 0 {
				touched = append(touched, c)
			} else {
				untouched = append(untouched, c)
			}
		}
		for _, c := range touched {
			b.WriteString("\n" + categoryIcon(c.DoneCount) + " " + c.Label + fmt.Sprintf(" %d/%d", c.DoneCount, daysInWeek))
		}
		if len(untouched) > 0 {
			labels := make([]string, 0, len(untouched))
			for _, c := range untouched {
				labels = append(labels, c.Label)
			}
			b.WriteString("\nНе тронуты: " + strings.Join(labels, ", "))
		}
	}

	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("📺 %s: %s мин/день при бюджете %d", st.DistractionLabel, trimFloat(st.DistractionAvgMin), st.DistractionBudget))

	return b.String()
}

func formatWeekRange(weekStart, weekEnd string) string {
	return dayAndMonth(weekStart) + " — " + dayAndMonth(weekEnd) + " " + yearOf(weekEnd)
}

func dayAndMonth(dateStr string) string {
	d, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		return dateStr
	}
	return fmt.Sprintf("%d %s", d.Day(), monthsGenitive[int(d.Month())-1])
}

func yearOf(dateStr string) string {
	d, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		return ""
	}
	return strconv.Itoa(d.Year())
}

func weekdayIndex(dateStr string) int {
	d, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		return 0
	}
	return int(d.Weekday())
}

func categoryIcon(doneCount int) string {
	if doneCount >= 5 {
		return "✅"
	}
	return "⚠️"
}

func pluralDays(count int) string {
	mod100 := count % 100
	if mod100 >= 11 && mod100 <= 14 {
		return "дням"
	}
	if count%10 == 1 {
		return "дню"
	}
	return "дням"
}

// trimFloat печатает float64 без лишних нулей (как JS-число в шаблоне).
func trimFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
