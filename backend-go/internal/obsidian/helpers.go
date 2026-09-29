// Package obsidian — перенос ObsidianService из backend/src/obsidian: экспорт
// GTD reference-заметок в vault-директорию (OBSIDIAN_EXPORT_DIR).
package obsidian

import (
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/gtd"
)

// NoteFilename — имя файла заметки (obsidian.helpers.ts).
func NoteFilename(item gtd.ItemView) string {
	slug := slugify(item.Title)
	if len(slug) > 80 {
		slug = strings.TrimRight(slug[:80], "-")
	}
	if slug == "" {
		slug = "zametka"
	}
	return slug + "-" + strconv.FormatInt(item.ID, 10) + ".md"
}

// NoteContent — содержимое заметки с front-matter (obsidian.helpers.ts).
func NoteContent(item gtd.ItemView, exported string) string {
	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("title: \"" + escapeYAML(item.Title) + "\"\n")
	b.WriteString("gtdId: " + strconv.FormatInt(item.ID, 10) + "\n")
	b.WriteString("source: tracker-gtd\n")
	b.WriteString("exported: " + exported + "\n")
	b.WriteString("---\n")
	if item.Notes != nil && *item.Notes != "" {
		b.WriteString("\n" + *item.Notes + "\n")
	}
	return b.String()
}

func slugify(title string) string {
	var b strings.Builder
	for _, r := range title {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\r', '\n':
			b.WriteByte('-')
		default:
			b.WriteRune(r)
		}
	}
	slug := collapseDashes(b.String())
	return strings.Trim(slug, "- ")
}

func collapseDashes(s string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if r == '-' {
			if !prevDash {
				b.WriteRune(r)
			}
			prevDash = true
		} else {
			b.WriteRune(r)
			prevDash = false
		}
	}
	return b.String()
}

func escapeYAML(v string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	return r.Replace(v)
}
