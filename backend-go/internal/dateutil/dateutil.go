// Package dateutil — единственный источник работы с датами в backend-go.
// Повторяет backend/src/common/date.util.ts. «Сегодня» считается в поясе
// пользователя (AuthUser.timezone), контейнер всегда в UTC.
package dateutil

import (
	"errors"
	"fmt"
	"regexp"
	"time"
)

// InvalidDateError — некорректная строка даты. Маппится в 400 в обработчиках.
type InvalidDateError struct {
	Value string
}

func (e *InvalidDateError) Error() string {
	return fmt.Sprintf("Invalid date: %s", e.Value)
}

// IsInvalidDate проверяет, что ошибка — некорректная дата (аналог
// BadRequestException из parseDateParam).
func IsInvalidDate(err error) bool {
	var ie *InvalidDateError
	return errors.As(err, &ie)
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ParseDateParam разбирает строку YYYY-MM-DD как полночь UTC.
// Обязательный round-trip через FormatDate и сравнение с входом — защита от
// календарного переполнения (2026-02-30 → 2026-03-02). Не «упрощать»:
// даже если Go не страдает от исходного JS-бага, поведение должно быть
// идентичным.
func ParseDateParam(dateStr string) (time.Time, error) {
	if !dateRe.MatchString(dateStr) {
		return time.Time{}, &InvalidDateError{Value: dateStr}
	}
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return time.Time{}, &InvalidDateError{Value: dateStr}
	}
	if FormatDate(date) != dateStr {
		return time.Time{}, &InvalidDateError{Value: dateStr}
	}
	return date.UTC(), nil
}

// FormatDate возвращает YYYY-MM-DD для даты (в UTC).
func FormatDate(date time.Time) string {
	return date.UTC().Format("2006-01-02")
}

// AddDays прибавляет дни, не дрейфуя через границу месяца.
func AddDays(date time.Time, days int) time.Time {
	return date.AddDate(0, 0, days)
}

// TodayDate — полночь UTC сегодняшнего календарного дня для самой даты
// (без учёта пояса пользователя; используется только как утилита).
func TodayDate() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

// TodayFor — «сегодня» в часовом поясе пользователя. Единственный источник
// «какого дня сейчас» для бизнес-логики.
func TodayFor(timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
}

// MondayOf — понедельник той недели (пн–вс), в которую попадает date.
func MondayOf(date time.Time) time.Time {
	day := int(date.UTC().Weekday()) // 0 — воскресенье
	var diff int
	if day == 0 {
		diff = -6
	} else {
		diff = 1 - day
	}
	return AddDays(date.UTC(), diff)
}

// WeekdayShort — короткое имя дня недели, как WEEKDAY_SHORT в stats.service.ts
// (индексация как у Date#getUTCDay(): 0 — воскресенье).
var WeekdayShort = [...]string{"Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"}

// WeekdayFull — полное имя дня недели, как WEEKDAYS_FULL в weekly.helpers.ts.
var WeekdayFull = [...]string{"воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"}
