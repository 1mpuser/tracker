# GTD ↔ дневные задачи — мост (Этап B) — дизайн

## Мотивация

Этап A дал GTD-ядро (Корзина → воронка → корзины-состояния) отдельным экраном. Но дневное исполнение всё ещё на старой модели `DailyTask`, где живёт «беговая дорожка переносов» (64% открытых задач — перенесённые). Этап B сливает два слоя:

- **GTD — слой хранения** (всё между «поймал» и «делаю»).
- **«Сегодня» — слой исполнения**: тонкий срез GTD, на который ты сегодня подписался.

Мост — понятие `plannedDate` и действие «взять в сегодня». Недоделанное само возвращается в Бэклог — дорожка переносов исчезает.

Выбран вариант **B (настоящий слив)**: `DailyTask` мигрирует в GTD и ретайрится; «Сегодня» питается из GTD; вкладка «Задачи» сворачивается.

## Решения (зафиксировано на брейншторме)

- У `GtdItem` добавляется **`plannedDate`** (день, на который пункт взят). `«взять в сегодня»` = `plannedDate = сегодня`; «снять» = `plannedDate = null`.
- **Экран «Сегодня»** показывает: пункты с `plannedDate = <дата дня>` (любого статуса кроме `archived`, чтобы сделанное показывалось отмеченным) **плюс** календарные пункты со `scheduledDate = <дата дня>`.
- **Недоделанное не переносится**: панель «Сегодня» фильтрует по `plannedDate = сегодня`; вчерашнее недоделанное перестаёт там висеть и остаётся в Бэклоге (`status=backlog`). Ручной перенос и `carry-candidates` удаляются.
- **Быстрый ввод на «Сегодня»** создаёт GTD-пункт сразу как `status=backlog, plannedDate=сегодня` (взял и делаешь, минуя Корзину).
- **Галочка «сделано» на «Сегодня»**: `status=done` (+`completedAt`); снятие галочки → `status=backlog` (остаётся на сегодня, т.к. `plannedDate` не трогаем).
- **Миграция `DailyTask` → `GtdItem`** (в той же Prisma-миграции, data-SQL): `title=text`, `plannedDate=Day.date`; сделанные → `status=done, completedAt=Day.date`; несделанные → `status=backlog`; флаги переноса/`carriedFromDate` отбрасываются. Порядок (`order`) сохраняется.
- **`DailyTask`-таблица остаётся на месте** после миграции (страховка), но приложение её больше **не читает и не пишет**. Реальное `DROP` — отдельной чисткой позже.
- **Вкладка «Задачи»** (обзор `DailyTask`, `TasksScreen`) и её эндпоинт `GET /tasks` **удаляются** (роль у GTD-экрана). Таб-бар: `Главный` · `GTD`.
- **Модалка прошлого дня** (`DayDetailModal`) показывает GTD-пункты, запланированные на выбранную дату, вместо старых dailies.
- **Сферы / YouTube / помидорки / рейтинг / комментарий дня / стрики** — не трогаются.
- **Шаблоны (`TaskTemplate`)** остаются доступны в быстром вводе «Сегодня» (создают GTD-пункт как обычный быстрый ввод). Экран управления шаблонами (в настройках) не трогаем.

## Модель данных

Одно новое поле + data-миграция. Существующие таблицы, кроме добавления столбца в `GtdItem`, не меняются.

```prisma
model GtdItem {
  // ...существующие поля...
  plannedDate DateTime? @db.Date   // день, на который пункт взят в исполнение
}
```

Миграция `add_gtd_planned_date_and_migrate_dailies`:
1. `ALTER TABLE "GtdItem" ADD COLUMN "plannedDate" date;`
2. Data-миграция (raw SQL):
   ```sql
   INSERT INTO "GtdItem" (title, status, "plannedDate", "completedAt", "order", "createdAt", "updatedAt")
   SELECT dt.text,
          (CASE WHEN dt.done THEN 'done' ELSE 'backlog' END)::"GtdStatus",
          d.date,
          (CASE WHEN dt.done THEN d.date::timestamp ELSE NULL END),
          dt."order", dt."createdAt", now()
   FROM "DailyTask" dt JOIN "Day" d ON d.id = dt."dayId";
   ```
   `DailyTask` при этом не удаляется.

## Backend

### `GtdItem` — план на день
- `UpdateGtdItemDto` получает `plannedDate?: string | null` (валидация `YYYY-MM-DD`, как `scheduledDate`); в `GtdService.update` конвертируется через `parseDateParam` (единый источник правды по датам), `null` очищает.
- `GtdItemView` получает `plannedDate: string | null` (сериализация `formatDate`).
- Новый метод `GtdService.getForDate(dateStr): Promise<GtdItemView[]>` — пункты, где `plannedDate = date` **или** (`status='calendar'` и `scheduledDate = date`), исключая `archived`. Отсортированы по `order`.
- Быстрый ввод «на сегодня»: `create` расширяется опциональным поведением — новый метод `GtdService.createForDate(title, dateStr)` создаёт `status=backlog, plannedDate=date` (в отличие от `create`, который кладёт в `inbox`). Эндпоинт `POST /gtd/items/today` `{ title, date }`.

### Интеграция в день
- `DayView` (в `DaysService.getDay`) заменяет поле `dailies: DailyTaskView[]` на **`today: GtdItemView[]`** = `gtdService.getForDate(date)`. `DaysModule` импортирует `GtdModule` (экспортировать `GtdService`).
- `HistoryEntry` не меняется (стрики/хитмапы на сферах/помидорках/youtube — `DailyTask` в них не участвует).

### Ретайр `DailyTask`
- Удаляются: `DailiesModule`, `DailiesController`, `DailiesService`, их DTO и спеки; эндпоинты `POST/PATCH/DELETE /days/:date/dailies`, `/dailies/:id`, `/days/:date/dailies/carry`, `/days/:date/carry-candidates`. Убрать `DailiesModule` из `app.module.ts`.
- Удаляется `GET /tasks` (`getAllTasks` в `dailies`-модуле уходит вместе с ним).
- `DailyTask` модель в `schema.prisma` **остаётся** (таблица — страховка), но код к ней не обращается.

## Frontend

### Типы / API
- `types/api.ts`: `GtdItem` получает `plannedDate: string | null`; `DayView.dailies` → `DayView.today: GtdItem[]`. Удаляются `DailyTaskView`, `CarryCandidate`, `TaskOverviewItem` и связанные api-функции (`addDaily`, `updateDaily`, `deleteDaily`, `getCarryCandidates`, `carryDailies`, `getAllTasks`).
- `lib/api.ts`: `planForToday(title, date)` → `POST /gtd/items/today`; `takeIntoToday(id, date)` = `updateGtdItem(id, { plannedDate: date })`; `clearPlanned(id)` = `updateGtdItem(id, { plannedDate: null })`.

### «Сегодня» на Главном
- `DailiesPanel` заменяется на **`TodayPanel`**: список `day.today` (галочка-тоггл `done↔backlog` через `updateGtdItem`), быстрый ввод (`planForToday`), доступ к шаблонам как раньше. Без кнопки «перенести с прошлых дней». Календарные-на-сегодня видны в общем списке (помечены иконкой даты).
- `Dashboard` прокидывает `day.today` и хендлеры; вся логика `daily*`/`carry*` удаляется.

### GTD-экран
- В бакетах Бэклог / Когда-нибудь / Календарь у пункта добавляется действие **«в сегодня»** (`takeIntoToday`) — ставит `plannedDate=сегодня`. У пунктов с `plannedDate=сегодня` — «убрать из сегодня» (`clearPlanned`).

### Таб «Задачи» и обзор
- Удаляются `TasksScreen`/`TasksScreen.module.css`; из `Dashboard` убирается таб `tasks`, его рендер и `tasksRefreshKey`-проводка. Таб-бар остаётся `Главный` · `GTD`.

### Модалка прошлого дня
- `DayDetailModal` показывает `day.today` (GTD-пункты на выбранную дату) вместо `dailies`, **read-only** (просто список с отметкой done/не-done). Правки dailies/перенос убираются.

## Декомпозиция реализации (два плана)

Дизайн один, реализация — двумя планами (каждый — рабочее, тестируемое ПО):

- **План B1 — backend + миграция:** `plannedDate`, data-миграция `DailyTask→GtdItem`, `getForDate`/`createForDate`, `DayView.today`, `plannedDate` в update-DTO/`GtdItemView`, ретайр dailies-эндпоинтов и `GET /tasks`. По завершении API целен, фронт временно сломан по типам — поэтому B2 идёт сразу следом.
- **План B2 — frontend-переделка:** `TodayPanel`, «взять/убрать в сегодня» на GTD-экране, удаление `TasksScreen`+таба, правка `DayDetailModal`, чистка мёртвых типов/api. По завершении UI целен на новой модели.

## Тесты (TDD)
- **Backend** (`gtd.service.spec.ts`, `days.service.spec.ts`): `getForDate` (planned=date ∪ calendar scheduledDate=date, исключая archived); `createForDate` (backlog+plannedDate); `update` с `plannedDate` (через `parseDateParam`, `null` очищает); `getDay` возвращает `today` вместо `dailies`. Data-миграция проверяется вручную на реальной БД контроллером (SQL идемпотентно-additive).
- **Frontend** (`lib/api.spec.ts`): `planForToday`/`takeIntoToday`/`clearPlanned` дёргают правильные пути/тела. Компоненты — гейт `bun run build`.

## Не входит в объём (Этап B)
- Физический `DROP TABLE "DailyTask"` — отдельная чистка позже.
- Воскресный крон Weekly Review, приоритет/дедлайн/оценка, экспорт Заметок в Obsidian — Этап C.
- Изменения сфер/YouTube/помидорок/стриков/рейтинга.
- Пере-дизайн управления шаблонами.
