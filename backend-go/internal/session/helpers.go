// Package session — перенос SessionService из backend/src/session: подсчёт
// помидоров по CalDAV-календарю Session. Учётные данные из интеграций.
package session

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// CalendarEvent — событие календаря.
type CalendarEvent struct {
	Start time.Time
	End   time.Time
}

// DayWindow — границы дня (полночь-полночь) в часовом поясе пользователя.
func DayWindow(date string, timeZone string) (start, end time.Time, err error) {
	parts := strings.Split(date, "-")
	y, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	d, _ := strconv.Atoi(parts[2])
	loc, err := time.LoadLocation(timeZone)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	// time.Date сам переносит через границу месяца/года.
	start = time.Date(y, time.Month(m), d, 0, 0, 0, 0, loc).UTC()
	end = time.Date(y, time.Month(m), d+1, 0, 0, 0, 0, loc).UTC()
	return start, end, nil
}

func unfold(ics string) []string {
	ics = strings.ReplaceAll(ics, "\r\n", "\n")
	// unfold: строки, продолжающиеся пробелом/табом, склеиваются с предыдущей.
	var out []string
	for _, line := range strings.Split(ics, "\n") {
		if (strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")) && len(out) > 0 {
			out[len(out)-1] = out[len(out)-1] + line[1:]
			continue
		}
		out = append(out, line)
	}
	return out
}

func parseParams(raw string) map[string]string {
	parts := strings.Split(raw, ";")
	params := map[string]string{}
	for _, part := range parts[1:] {
		eq := strings.Index(part, "=")
		if eq > 0 {
			params[strings.ToUpper(part[:eq])] = part[eq+1:]
		}
	}
	return params
}

var icsTimeRe = regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$`)

func parseICSTime(value string, params map[string]string, timeZone string) (time.Time, bool) {
	// События «на весь день» (VALUE=DATE) пропускаем: сеанс Session всегда со
	// временем, а сутки 24h дали бы ложную помидорку.
	if params["VALUE"] == "DATE" {
		return time.Time{}, false
	}
	m := icsTimeRe.FindStringSubmatch(strings.TrimSpace(value))
	if m == nil {
		return time.Time{}, false
	}
	y, _ := strconv.Atoi(m[1])
	mo, _ := strconv.Atoi(m[2])
	d, _ := strconv.Atoi(m[3])
	h, _ := strconv.Atoi(m[4])
	mi, _ := strconv.Atoi(m[5])
	s, _ := strconv.Atoi(m[6])
	if m[7] == "Z" {
		return time.Date(y, time.Month(mo), d, h, mi, s, 0, time.UTC), true
	}
	// RFC 5545 разрешает закавычивать TZID="Europe/Moscow" — снимаем.
	tzid := strings.Trim(params["TZID"], `"`)
	if tzid == "" {
		tzid = timeZone
	}
	loc, err := time.LoadLocation(tzid)
	if err != nil {
		// Неизвестный/битый пояс (Windows-имя, опечатка) — событие пропускаем,
		// не роняя разбор всего календаря.
		return time.Time{}, false
	}
	return time.Date(y, time.Month(mo), d, h, mi, s, 0, loc).UTC(), true
}

var durationRe = regexp.MustCompile(`^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)

func parseDurationMs(value string) (time.Duration, bool) {
	m := durationRe.FindStringSubmatch(strings.TrimSpace(value))
	if m == nil {
		return 0, false
	}
	d, _ := strconv.Atoi(m[1])
	h, _ := strconv.Atoi(m[2])
	mi, _ := strconv.Atoi(m[3])
	s, _ := strconv.Atoi(m[4])
	ms := time.Duration(((d*24+h)*3600+mi*60+s)*1000) * time.Millisecond
	if ms <= 0 {
		return 0, false
	}
	return ms, true
}

// ParseEvents разбирает ICS-строку календаря в события (VEVENT).
func ParseEvents(ics, timeZone string) []CalendarEvent {
	var events []CalendarEvent
	var start, end time.Time
	var duration time.Duration
	inEvent := false
	nest := 0

	for _, line := range unfold(ics) {
		if strings.HasPrefix(line, "BEGIN:VEVENT") {
			inEvent = true
			start, end, duration = time.Time{}, time.Time{}, 0
			nest = 0
			continue
		}
		if !inEvent {
			continue
		}
		if nest == 0 && strings.HasPrefix(line, "END:VEVENT") {
			finish := end
			if finish.IsZero() && !start.IsZero() && duration > 0 {
				finish = start.Add(duration)
			}
			if !start.IsZero() && !finish.IsZero() {
				events = append(events, CalendarEvent{Start: start, End: finish})
			}
			inEvent = false
			continue
		}
		if strings.HasPrefix(line, "BEGIN:") {
			nest++
			continue
		}
		if strings.HasPrefix(line, "END:") {
			if nest > 0 {
				nest--
			}
			continue
		}
		if nest > 0 {
			continue
		}
		colon := strings.Index(line, ":")
		if colon < 0 {
			continue
		}
		name := line[:colon]
		value := line[colon+1:]
		key := strings.ToUpper(strings.Split(name, ";")[0])
		switch key {
		case "DTSTART":
			if t, ok := parseICSTime(value, parseParams(name), timeZone); ok {
				start = t
			}
		case "DTEND":
			if t, ok := parseICSTime(value, parseParams(name), timeZone); ok {
				end = t
			}
		case "DURATION":
			if d, ok := parseDurationMs(value); ok {
				duration = d
			}
		}
	}
	return events
}

// CountPomodoros считает события, пересекающиеся с окном дня и длиной ≥ minMinutes.
func CountPomodoros(events []CalendarEvent, start, end time.Time, minMinutes int) int {
	min := time.Duration(minMinutes) * time.Minute
	count := 0
	for _, e := range events {
		if e.End.After(start) && e.Start.Before(end) && e.End.Sub(e.Start) >= min {
			count++
		}
	}
	return count
}
