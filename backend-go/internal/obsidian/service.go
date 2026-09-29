package obsidian

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/model"
)

// Service — экспорт GTD reference-заметок в ваулт Obsidian. Реализует
// gtd.ObsidianProvider. Выключен, если OBSIDIAN_EXPORT_DIR пуст.
type Service struct {
	dir string
}

// NewService создаёт сервис; dir — OBSIDIAN_EXPORT_DIR ("" — экспорт выключен).
func NewService(dir string) *Service {
	return &Service{dir: dir}
}

func (s *Service) removeByID(ctx context.Context, dir string, id int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	suffix := "-" + strconv.FormatInt(id, 10) + ".md"
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), suffix) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}

// SyncNote пишет/обновляет заметку reference-задачи. Даты в шапке — «сегодня»
// в поясе пользователя (как в Node-версии).
func (s *Service) SyncNote(ctx context.Context, user model.AuthUser, item gtd.ItemView) error {
	if s.dir == "" {
		return nil
	}
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		log.Printf("Obsidian syncNote(%d) failed: %v", item.ID, err)
		return nil
	}
	s.removeByID(ctx, s.dir, item.ID)
	today, err := dateutil.TodayFor(user.Timezone)
	if err != nil {
		today = dateutil.TodayDate()
	}
	content := NoteContent(item, dateutil.FormatDate(today))
	file := filepath.Join(s.dir, NoteFilename(item))
	if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
		log.Printf("Obsidian syncNote(%d) failed: %v", item.ID, err)
	}
	return nil
}

// RemoveNote удаляет заметку задачи.
func (s *Service) RemoveNote(ctx context.Context, user model.AuthUser, id int64) error {
	if s.dir == "" {
		return nil
	}
	s.removeByID(ctx, s.dir, id)
	return nil
}

// SyncAllReference синхронизирует все reference-задачи пользователя (startup).
func (s *Service) SyncAllReference(ctx context.Context, user model.AuthUser, items []gtd.ItemView) {
	for _, item := range items {
		_ = s.SyncNote(ctx, user, item)
	}
}

// Enabled — включён ли экспорт (для флага obsidianEnabled).
func (s *Service) Enabled() bool { return s.dir != "" }

var _ gtd.ObsidianProvider = (*Service)(nil)
