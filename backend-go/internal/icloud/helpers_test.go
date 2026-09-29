package icloud

import (
	"strings"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/gtd"
)

func TestReminderUID(t *testing.T) {
	if ReminderUID(42) != "gtd-rem-42" {
		t.Fatalf("uid=%q", ReminderUID(42))
	}
}

func TestBuildReminderICSWithTime(t *testing.T) {
	due := &gtd.EffectiveDue{Date: "2026-08-14", Time: strPtr("09:30")}
	ics := BuildReminderICS("gtd-rem-1", "GTD: Прочитать", due, true, false)
	for _, want := range []string{
		"BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VTODO",
		"UID:gtd-rem-1", "SUMMARY:GTD: Прочитать",
		"DUE:20260814T093000", "PRIORITY:1", "STATUS:NEEDS-ACTION",
		"END:VTODO", "END:VCALENDAR",
	} {
		if !strings.Contains(ics, want) {
			t.Fatalf("нет %q в:\n%s", want, ics)
		}
	}
}

func TestBuildReminderICSDateOnlyCompleted(t *testing.T) {
	due := &gtd.EffectiveDue{Date: "2026-08-14"}
	ics := BuildReminderICS("gtd-rem-9", "GTD: Архив", due, false, true)
	if !strings.Contains(ics, "DUE;VALUE=DATE:20260814") {
		t.Fatalf("VDATE нет:\n%s", ics)
	}
	if !strings.Contains(ics, "PRIORITY:0") {
		t.Fatalf("приоритет не 0:\n%s", ics)
	}
	if !strings.Contains(ics, "STATUS:COMPLETED") {
		t.Fatalf("статус не COMPLETED:\n%s", ics)
	}
}

func TestEffectiveDueOf(t *testing.T) {
	if EffectiveDueOf(gtd.ItemView{Status: "archived", DueDate: strPtr("2026-08-14")}) != nil {
		t.Fatal("архивная задача не должна иметь effective due")
	}
	d := EffectiveDueOf(gtd.ItemView{Status: "calendar", ScheduledDate: strPtr("2026-08-14"), ScheduledTime: strPtr("10:00")})
	if d == nil || d.Date != "2026-08-14" || d.Time == nil || *d.Time != "10:00" {
		t.Fatalf("d=%+v", d)
	}
}

func strPtr(s string) *string { return &s }
