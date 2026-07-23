# GTD Этап C.2 — дедлайн + флаг важности — дизайн

## Мотивация

GTD-пунктам не хватает двух действенных атрибутов: **дедлайна** (срок «надо к») и **важности** (флаг). Оценку времени сознательно не вводим (редко заполняется, трение — YAGNI). Вторая из трёх фич Этапа C (после воскресного напоминания; далее — экспорт в Obsidian).

## Решения (зафиксировано на брейншторме)

- **`dueDate` (дедлайн)** — дата «надо к», отдельно от `scheduledDate` (календарь = «делаю в этот день»). Бейдж ⏰ с датой; **просроченные красным** (`dueDate < сегодня` и не `done`). Ставится/снимается действием.
- **`priority` (важное)** — булев флаг (не уровни — уровни = шум). Маркер ❗; важные — вверх списка. Тогл действием.
- **Сортировка** отображаемого списка: сначала важные (`priority` desc), потом по ближайшему дедлайну (`dueDate` asc, без даты — в конец), потом по `order`. Чистая функция в `lib/gtd.ts` (TDD).
- Оценку времени НЕ вводим.

## Модель данных

Два additive-поля, миграция `add_gtd_due_priority`:

```prisma
model GtdItem {
  // ...
  dueDate  DateTime? @db.Date
  priority Boolean   @default(false)
}
```

## Backend

- `UpdateGtdItemDto`: `dueDate?: string | null` (валидация `YYYY-MM-DD`, как `scheduledDate`/`plannedDate`); `priority?: boolean` (`@IsOptional @IsBoolean`).
- `GtdService.update`: `dueDate` → `parseDateParam` (null очищает), `priority` пишется как есть. Расширить тип `patch`.
- `GtdItemView`: `dueDate: string | null` (сериализация `formatDate`), `priority: boolean`. `toView` мапит оба.
- `getItems`/`getForDate`/`createForDate` — новые поля попадают в вывод автоматически через `toView` (createForDate создаёт с `priority=false`, `dueDate=null` по умолчанию БД). Backend-сортировку не меняем — сортировка на фронте.

## Frontend

- `types/api.ts`: `GtdItem` получает `dueDate: string | null`, `priority: boolean`.
- `lib/api.ts`: `updateGtdItem` `Pick` расширяется `'dueDate' | 'priority'`.
- `lib/gtd.ts`: `sortGtdItems(items: GtdItem[]): GtdItem[]` — стабильная сортировка по `priority` desc → `dueDate` asc (null в конец) → `order` asc. Не мутирует вход. Покрывается спекой (`gtd.spec.ts`).
- `GtdScreen.tsx`:
  - Действия у пункта (в базовом списке, не-inbox): **⏰** — задать/сменить дедлайн (`window.prompt('Дедлайн (YYYY-MM-DD):')` → `updateGtdItem(id, { dueDate })`; пустой ввод — снять: `{ dueDate: null }`); **❗** — тогл `priority` (`updateGtdItem(id, { priority: !item.priority })`).
  - Бейджи у пункта: `❗` если `priority`; `⏰ <dueDate>` если есть дедлайн, класс `.overdue` (красный) если `dueDate < todayLocal()` и `status !== 'done'`.
  - Отображаемый список прогоняется через `sortGtdItems`.
- `TodayPanel.tsx`: показывает бейджи `❗` и `⏰ <dueDate>` (с красным для просрочки) — только показ, без действий. Список «сегодня» тоже сортируется `sortGtdItems`.

Цвет просрочки — из токенов (`--danger`/`--danger-soft`, они есть в `globals.css`).

## Тесты (TDD)
- **Backend** (`gtd.service.spec.ts`): `update` с `dueDate` (через `parseDateParam`, `null` очищает) и `priority` (true/false); `getForDate`/`getItems` возвращают `dueDate`/`priority` в выводе (через `toView`).
- **Frontend** (`lib/gtd.spec.ts`): `sortGtdItems` — важные выше; при равной важности ближайший дедлайн выше; без дедлайна — в конец своей группы; стабильность по `order`; вход не мутируется.
- Компоненты — гейт `bun run build`.

## Не входит в объём
- Оценка времени (минуты) — не вводим (при желании доклеим позже).
- Уровни приоритета (low/med/high) — только булев флаг.
- Backend-сортировка/фильтры по дедлайну, напоминания о дедлайнах — не в этой фиче.
- C.3 (экспорт Заметок в Obsidian) — отдельная спека.
- DROP старой таблицы `DailyTask` — отдельная чистка.
