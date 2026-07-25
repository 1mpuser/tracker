# GTD Этап D — авто-синк с iCloud Напоминаниями — дизайн

## Мотивация

GTD-пункты с датой (дедлайн или календарная дата) видны только внутри трекера — ни системных напоминаний (alert на экране блокировки), ни видимости на телефоне без захода в веб-интерфейс. iCloud Напоминания дают это бесплатно через открытый протокол **CalDAV**, без нативного iOS-приложения или пуш-инфраструктуры (APNs).

## Решения (зафиксировано на брейншторме, включая правки по ходу)

- **Только Reminders.** Никакого автоматического синка с Calendar (VEVENT) — настоящие календарные события с конкретным «с какого момента по какое» пользователь ставит в Calendar.app сам, руками, когда реально что-то делает. Apple и так показывает Напоминания с датой в виде календаря — отдельный VEVENT для того же дублировал бы одно и то же в двух местах.
- **Один список** в Reminders — «GTD» (не привязан к конкретному GTD-статусу вроде «Бэклог» — это была первая версия дизайна, отклонена: Бэклог — это нерассортированный пул, а не то, что реально пора делать).
- **Триггер — «эффективная дата» пункта**, а не статус:
  ```
  эффективная_дата(item) =
    item.dueDate, если задан
    иначе item.scheduledDate (+ scheduledTime), если item.status === 'calendar'
    иначе — нет эффективной даты
  ```
  `dueDate` имеет приоритет: если поставлены оба (редкий случай — календарный пункт с ещё и дедлайном), напоминание ставится по `dueDate`.
- **Переходы:**
  - У пункта появилась эффективная дата (задан `dueDate`, или пункт стал `calendar` с `scheduledDate`) → создать/обновить напоминание, NEEDS-ACTION, `DUE` = эффективная дата.
  - Пункт с эффективной датой стал `done` → напоминание помечается **выполненным** (COMPLETED), **не удаляется** — история остаётся в Reminders.
  - Эффективная дата пропала (сняли `dueDate`, ушли из `calendar` без дедлайна), а статус не `done` → напоминание удаляется.
  - Удаление GTD-пункта, у которого была эффективная дата (или он `done` — мог сохранять завершённое напоминание) → напоминание удаляется (best-effort: если объекта уже нет, `DELETE` просто ловится и логируется, не падает).
- **Общая инфраструктура** — та же, что у Obsidian: `backend/src/icloud/`, библиотека **`tsdav`**, авторизация паролем приложения (`ICLOUD_APP_PASSWORD` — уже есть в `backend/.env`, перенесём в корневой при реализации), env-gated (нет `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` → тихий no-op), детерминированное имя объекта по id (`gtd-rem-<id>.ics`) — без поиска/листинга, без изменений схемы БД, single-writer (без ETag/If-Match — предполагается, что список в Reminders не редактируется руками).
- Список **«GTD» в Reminders создаётся пользователем вручную один раз** (программное создание списков через CalDAV не входит в объём — обнаружение по `displayName` через `tsdav.fetchCalendars()`).

## Инфраструктура

- Новая зависимость: `tsdav` в `backend/package.json`.
- Env-переменные (все опциональны — без `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` интеграция выключена):
  - `ICLOUD_APPLE_ID` — email Apple ID.
  - `ICLOUD_APP_PASSWORD` — пароль приложения (appleid.apple.com → «Вход и безопасность» → «Пароли для приложений»; показывается один раз при создании).
  - `ICLOUD_REMINDERS_LIST_NAME` — имя списка (дефолт `GTD`).
- `.env.example` — добавить три строки без значений. Корневой `.env` (gitignored) — пользователь заполняет.
- README — секция с шагами: сгенерировать пароль приложения, создать список «GTD» в Reminders, заполнить `.env`.
- `docker-compose.yml` — без изменений (сетевой CalDAV-клиент, не файловая система — монтировать нечего).

## Backend

Новый модуль `backend/src/icloud/`, по образцу `backend/src/obsidian/`.

### Чистый хелпер «эффективная дата» (TDD) — в `backend/src/gtd/` или `icloud.helpers.ts`

```ts
function effectiveDue(item: { dueDate: string | null; status: string; scheduledDate: string | null; scheduledTime: string | null }):
  { date: string; time: string | null } | null {
  if (item.dueDate) return { date: item.dueDate, time: null };
  if (item.status === 'calendar' && item.scheduledDate) return { date: item.scheduledDate, time: item.scheduledTime };
  return null;
}
```

### Чистый хелпер построения VTODO — `icloud.helpers.ts`

- `buildReminderIcs({ uid, title, due, priority, completed }): string` — минимальный VTODO: `SUMMARY`, `UID`, `DUE` (дата или дата+время, если задано), `PRIORITY` (`priority: boolean` → `1`/нет значения), `STATUS: NEEDS-ACTION` либо `COMPLETED`.

### `ICloudService`

- `private remindersUrl: string | null` — резолвится лениво через `tsdav.DAVClient.login()` + `fetchCalendars()`, поиск по `displayName === ICLOUD_REMINDERS_LIST_NAME`; кешируется на время жизни процесса.
- `async syncReminder(item, due)` — env-gated; создаёт/обновляет объект `gtd-rem-<id>.ics`, `completed=false`, `DUE` из `due`.
- `async completeReminder(id, item)` — обновляет тот же объект, `completed=true` (не удаляет).
- `async removeReminder(id)` — удаляет объект по href, если есть.
- `async syncAllOnStartup(itemsWithEffectiveDue)` — bulk-синк при старте бэкенда для всех активных пунктов, у которых сейчас есть эффективная дата (не трогает уже завершённые/COMPLETED — они не меняются при рестарте).
- Все публичные методы — try/catch → `Logger.warn`, никогда не бросают.

### Интеграция в `GtdService`

Конструктор получает третью зависимость `icloud: ICloudService` (после `prisma`, `obsidian`).

В `update(id, patch)`, рядом с существующим Obsidian-блоком (после `prisma.update`, перед `return this.toView(updated)`):

```ts
const dueBefore = effectiveDue(existing);
const dueAfter = effectiveDue(updated);

if (updated.status === 'done' && dueBefore) {
  await this.icloud.completeReminder(id, updated);
} else if (dueAfter) {
  await this.icloud.syncReminder(updated, dueAfter);
} else if (dueBefore) {
  await this.icloud.removeReminder(id);
}
```

В `remove(id)`, рядом с существующим Obsidian-блоком:

```ts
if (effectiveDue(existing) || existing.status === 'done') {
  await this.icloud.removeReminder(id);
}
```

`GtdModule` импортирует новый `ICloudModule` (рядом с `ObsidianModule`).

### `main.ts` — bulk-синк на старте

Рядом с существующим Obsidian bulk-sync после `app.listen(...)`:

```ts
try {
  const gtd = app.get(GtdService);
  const icloud = app.get(ICloudService);
  const active = (await Promise.all(
    ['backlog', 'calendar', 'someday', 'waiting', 'project'].map((s) => gtd.getItems(s)),
  )).flat();
  await icloud.syncAllOnStartup(active.filter((i) => effectiveDue(i)));
} catch (e) {
  console.warn('iCloud startup sync skipped:', e);
}
```

## Тесты (TDD)

- **`effectiveDue`** (чистая функция): `dueDate` задан → возвращает его вне зависимости от статуса; `dueDate` не задан, `status='calendar'` со `scheduledDate` → возвращает его (+time если есть); ни того ни другого → `null`; оба заданы → приоритет `dueDate`.
- **`buildReminderIcs`**: с датой/с датой+временем, `priority` true/false, `NEEDS-ACTION`/`COMPLETED`.
- **`GtdService` интеграция** (мок `icloud`, как мок `obsidian`): появление эффективной даты → `syncReminder`; переход в `done` при наличии даты → `completeReminder`, не `removeReminder`; исчезновение эффективной даты (не done) → `removeReminder`; удаление пункта с эффективной датой или `done` → `removeReminder`.
- **`ICloudService`** (реальные CalDAV-вызовы) — не юнит-тестируется, проверяется вручную на живом iCloud-аккаунте (шаг фиксируется в плане реализации).

## Не входит в объём

- Автоматический синк с Calendar (VEVENT) — сознательно отклонён, календарные события пользователь ставит сам.
- Двусторонняя синхронизация (отметил выполненным в Reminders на телефоне → статус в GTD не меняется) — потребовала бы периодического опроса iCloud. Будущая фича, если понадобится.
- Программное создание списка Reminders через CalDAV — пользователь создаёт вручную.
- Учёт конфликтов при ручном редактировании напоминаний пользователем в самом Reminders.app (single-writer допущение).
- UI-индикация «синхронизировано с iCloud» в трекере.
