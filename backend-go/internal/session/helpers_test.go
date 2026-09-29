package session

import (
	"testing"
	"time"
)

func TestDayWindowMoscow(t *testing.T) {
	start, end, err := DayWindow("2026-08-14", "Europe/Moscow")
	if err != nil {
		t.Fatalf("dayWindow: %v", err)
	}
	// полночь по МСК = 21:00 UTC предыдущего дня (лето, +3)
	startUTC := start.UTC().Format("2006-01-02T15:04:05Z")
	if startUTC != "2026-08-13T21:00:00Z" {
		t.Fatalf("start=%s", startUTC)
	}
	// конец окна: 2026-08-14T21:00Z
	if end.UTC().Format("2006-01-02T15:04:05Z") != "2026-08-14T21:00:00Z" {
		t.Fatalf("end=%s", end.UTC().Format("2006-01-02T15:04:05Z"))
	}
}

func TestParseEvents(t *testing.T) {
	ics := "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260814T140000\r\nDTEND:20260814T145500\r\nSUMMARY:S\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
	events := ParseEvents(ics, "Europe/Moscow")
	if len(events) != 1 {
		t.Fatalf("len=%d events=%+v", len(events), events)
	}
	// in Moscow 14:00 = 11:00 UTC
	if events[0].Start.UTC().Format("15:04") != "11:00" {
		t.Fatalf("start=%s", events[0].Start.UTC().Format("15:04"))
	}
}

func TestParseEventsSkipsAllDay(t *testing.T) {
	ics := "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260814\r\nDTEND;VALUE=DATE:20260815\r\nEND:VEVENT\r\n"
	if len(ParseEvents(ics, "Europe/Moscow")) != 0 {
		t.Fatal("вседневные события должны пропускаться")
	}
}

func TestCountPomodoros(t *testing.T) {
	start, end, _ := DayWindow("2026-08-14", "Europe/Moscow")
	events := []CalendarEvent{
		{Start: start.Add(30 * time.Minute), End: start.Add(110 * time.Minute)},         // 80 мин — зачёт
		{Start: start.Add(2 * time.Hour), End: start.Add(2*time.Hour + 10*time.Minute)}, // 10 мин — нет
	}
	if got := CountPomodoros(events, start, end, 20); got != 1 {
		t.Fatalf("got %d, want 1", got)
	}
}

func TestParseEventsSkipsBrokenTZID(t *testing.T) {
	ics := "BEGIN:VEVENT\r\nDTSTART;TZID=\"Russian Standard Time\":20260814T140000\r\nDTEND;TZID=\"Russian Standard Time\":20260814T145500\r\nEND:VEVENT\r\n"
	if len(ParseEvents(ics, "Europe/Moscow")) != 0 {
		t.Fatal("битый TZID должен пропускаться, а не ронять разбор")
	}
}
