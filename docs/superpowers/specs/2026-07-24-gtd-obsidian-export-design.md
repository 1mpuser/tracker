# GTD Этап C.3 — авто-экспорт Заметок в Obsidian — дизайн

## Мотивация

`reference`-пункты («Заметки») в GTD — это справочный материал, которому место в базе знаний. Пользователь ведёт Obsidian (iCloud-хранилище `main-obsidian`). Нужно, чтобы **как только пункт становится Заметкой, он сам появлялся `.md`-файлом в Obsidian**, а при уходе из Заметок/удалении — исчезал. Третья, финальная фича Этапа C.

## Решения (зафиксировано на брейншторме)

- **Куда:** подпапка `GTD` в хранилище `main-obsidian`. На хосте: `/Users/1mpuser/Library/Mobile Documents/iCloud~md~obsidian/Documents/main-obsidian/GTD`. Монтируется в backend-контейнер как `/vault` через env-переменную (не хардкод пути в компоуз).
- **Когда:** **автоматически** — при переходе пункта в `reference` (и при правке его `title`/`notes`, пока он reference) бэкенд пишет/перезаписывает файл; при уходе из `reference` (смена статуса) или удалении — файл убирается. Плюс **bulk-синк всех reference на старте бэкенда** (чтобы уже существующие Заметки появились после ближайшего рестарта и как самовосстановление).
- **Формат:** один `.md` на заметку. Имя `<slug>-<id>.md` (`slug` — заголовок с заменой ФС-небезопасных символов, кириллица сохраняется). Содержимое:
  ```md
  ---
  title: "<title>"
  gtdId: <id>
  source: tracker-gtd
  exported: <YYYY-MM-DD>
  ---

  <notes>
  ```
- **Устойчивость:** экспорт **никогда не роняет приложение**. Если каталог экспорта недоступен/не смонтирован — операция тихо пропускается (лог-варнинг). Ошибки записи ловятся и логируются, не пробрасываются в GTD-операции.
- **Односторонний** экспорт (трекер → Obsidian). Обратно не читаем/не синкаем.

## Инфраструктура (docker-compose + env)

- `docker-compose.yml`, сервис `backend`:
  - `volumes:` добавить `- ${OBSIDIAN_VAULT_DIR:-./data/obsidian-export}:/vault`
  - `environment:` добавить `OBSIDIAN_EXPORT_DIR: /vault`
- `.env` (gitignored, у пользователя): `OBSIDIAN_VAULT_DIR=/Users/1mpuser/Library/Mobile Documents/iCloud~md~obsidian/Documents/main-obsidian/GTD`
- `.env.example` + README: задокументировать `OBSIDIAN_VAULT_DIR` (по умолчанию, если не задан — пишет в локальную `./data/obsidian-export`, экспорт работает, просто не в Obsidian).
- В контейнере путь всегда `/vault` (смонтирован), поэтому экспорт активен всегда; куда именно — решает `OBSIDIAN_VAULT_DIR` на хосте.

## Backend

Новый модуль `backend/src/obsidian/` (изолированный: только fs + env, без зависимостей от других сервисов).

- **Чистые хелперы** (тестируемые, TDD):
  - `noteFilename(item: { id: number; title: string }): string` → `<slug>-<id>.md`; `slug` = `title`, где символы `/\:*?"<>|` и переводы строк заменены на `-`, схлопнуты повторные `-`, обрезаны пробелы, длина ограничена (например 80). Пустой заголовок → `zametka`.
  - `noteContent(item: { id: number; title: string; notes: string | null }, exported: string): string` → markdown с frontmatter (см. формат). `exported` — строка даты, передаётся снаружи (не `new Date()` внутри, чтобы функция была чистой/тестируемой).
- **`ObsidianService`:**
  - `private dir(): string | null` — `process.env.OBSIDIAN_EXPORT_DIR ?? null`.
  - `async syncNote(item)` — если `dir()` есть: `mkdir -p`, удалить любой существующий `*-<id>.md` в каталоге (обработка переименований), записать `noteFilename`/`noteContent`. Всё в try/catch → лог-варнинг, не бросать.
  - `async removeNote(id)` — удалить `*-<id>.md` (если есть). try/catch.
  - `async syncAllReference(items)` — записать все переданные reference-пункты (для bulk-синка на старте).
- **`ObsidianModule`** экспортирует `ObsidianService`.

### Интеграция в `GtdService`
- `GtdModule` импортирует `ObsidianModule`; `GtdService` получает `ObsidianService` в конструктор.
- В `update(id, patch)`: после `prisma.update`, если новый `status === 'reference'` → `obsidian.syncNote(updated)`; иначе, если `existing.status === 'reference'` и новый статус другой → `obsidian.removeNote(id)`. (Правка title/notes у reference-пункта попадает в первую ветку — файл перезаписывается.)
- В `remove(id)`: если `existing.status === 'reference'` → `obsidian.removeNote(id)` перед/после удаления из БД.
- Экспорт-вызовы — «fire and forget» с проглатыванием ошибок внутри `ObsidianService`, чтобы не влиять на ответ API.

### Bulk-синк на старте
- В `main.ts` (после `app.listen` или в `onModuleInit` подходящего провайдера): получить все `reference`-пункты (`gtdService.getItems('reference')`) и `obsidian.syncAllReference(...)`. Тихо, с проглатыванием ошибок. Так существующие Заметки появляются в vault после рестарта.

## Frontend

Изменений в UI нет (экспорт полностью на бэкенде). Опционально позже — индикатор «экспортировано», но не в этой фиче.

## Тесты (TDD)
- **Backend** (`obsidian.service.spec.ts` или `obsidian.helpers.spec.ts`): чистые хелперы —
  - `noteFilename`: обычный заголовок → `slug-<id>.md`; заголовок с `/:*?` → санитизирован; кириллица сохранена; пустой → `zametka-<id>.md`; длинный обрезан.
  - `noteContent`: содержит frontmatter с `title`/`gtdId`/`source: tracker-gtd`/`exported`, тело = `notes` (или пусто при `null`).
- fs-запись/no-op-без-каталога и интеграция в `update`/`remove` — проверяются контроллером вручную (запись реального файла в тест-каталог), не юнит-тестом (fs-моки хрупкие).

## Не входит в объём
- Импорт/двусторонний синк из Obsidian — только экспорт.
- UI-индикация экспорта, ручная кнопка «синхронизировать» — не в этой фиче (авто + старт-синк достаточно).
- Экспорт других статусов (Бэклог/Проекты и т.д.) — только `reference`.
- Настройка формата/шаблона файла из UI — зашито.
- Вложенные структуры/линки между заметками, теги Obsidian — плоский экспорт по одному файлу.
