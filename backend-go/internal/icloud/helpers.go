// Package icloud — перенос ICloudService из backend/src/icloud (CalDAV
// Reminders). Учётные данные берутся из integrаций пользователя, не из env.
package icloud

import (
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/gtd"
)

// ReminderUID — стабильный UID напоминания по id GTD-задачи (icloud.helpers.ts).
func ReminderUID(id int64) string {
	return "gtd-rem-" + strconv.FormatInt(id, 10)
}

// EscapeICSText экранирует текст для значения ICS-поля (icloud.helpers.ts).
func EscapeICSText(text string) string {
	r := strings.NewReplacer(`\`, `\\`, `,`, `\,`, `;`, `\;`, "\n", `\n`)
	return r.Replace(text)
}

// BuildReminderICS собирает VTODO (buildReminderIcs в icloud.helpers.ts).
func BuildReminderICS(uid, title string, due *gtd.EffectiveDue, priority, completed bool) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString("PRODID:-//tracker-gtd//EN\r\n")
	b.WriteString("BEGIN:VTODO\r\n")
	b.WriteString("UID:" + uid + "\r\n")
	b.WriteString("SUMMARY:" + EscapeICSText(title) + "\r\n")
	if due != nil && due.Date != "" {
		if due.Time != nil && *due.Time != "" {
			compact := strings.ReplaceAll(due.Date, "-", "")
			t := strings.ReplaceAll(*due.Time, ":", "") + "00"
			b.WriteString("DUE:" + compact + "T" + t + "\r\n")
		} else {
			b.WriteString("DUE;VALUE=DATE:" + strings.ReplaceAll(due.Date, "-", "") + "\r\n")
		}
	}
	prio := "0"
	if priority {
		prio = "1"
	}
	b.WriteString("PRIORITY:" + prio + "\r\n")
	status := "NEEDS-ACTION"
	if completed {
		status = "COMPLETED"
	}
	b.WriteString("STATUS:" + status + "\r\n")
	b.WriteString("END:VTODO\r\n")
	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}
