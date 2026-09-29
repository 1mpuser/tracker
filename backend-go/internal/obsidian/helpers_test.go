package obsidian

import (
	"strings"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/gtd"
)

func TestNoteFilename(t *testing.T) {
	cases := []struct {
		title string
		want  string
	}{
		{"Прочитать книгу", "Прочитать книгу-1.md"},
		{"a/b\\c:d*e?f\"g<h>i|j", "a-b-c-d-e-f-g-h-i-j-1.md"},
		{"  много   пробелов  ", "много   пробелов-1.md"},
		{"", "zametka-1.md"},
	}
	for _, c := range cases {
		got := NoteFilename(gtd.ItemView{ID: 1, Title: c.title})
		if got != c.want {
			t.Fatalf("title=%q got=%q want=%q", c.title, got, c.want)
		}
	}
}

func TestNoteFilenameTruncates(t *testing.T) {
	long := strings.Repeat("a", 120)
	got := NoteFilename(gtd.ItemView{ID: 2, Title: long})
	if len(got) > 90 {
		t.Fatalf("too long: %d %q", len(got), got)
	}
	if !strings.HasSuffix(got, "-2.md") {
		t.Fatalf("no id suffix: %q", got)
	}
}

func TestNoteContent(t *testing.T) {
	notes := "Текст<br>с новой строкой"
	content := NoteContent(gtd.ItemView{ID: 7, Title: `Кавычки "и"`, Notes: &notes}, "2026-08-14")
	for _, want := range []string{
		"title: \"Кавычки \\\"и\\\"\"",
		"gtdId: 7",
		"source: tracker-gtd",
		"exported: 2026-08-14",
		"Текст<br>с новой строкой",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("нет %q в:\n%s", want, content)
		}
	}
}
