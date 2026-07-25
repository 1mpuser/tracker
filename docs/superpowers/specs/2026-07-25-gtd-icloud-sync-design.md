# GTD Этап D — авто-синк с iCloud Календарём и Напоминаниями — дизайн

## Мотивация

GTD-пункты со статусом «Календарь» и «Бэклог» живут только внутри трекера — ни настоящих системных напоминаний (alert на экране блокировки), ни видимости на телефоне без захода в веб-интерфейс. iCloud Календарь и Напоминания дают это бесплатно через открытый протокол **CalDAV**, без необходимости строить нативное iOS-приложение или пуш-инфраструктуру (APNs). Четвёртая фича Этапа C/D, повторяет уже проверенный архитектурный паттерн Obsidian-экспорта.

## Решения (зафиксировано на брейншторме)

- **Оба сразу** (Календарь + Напоминания), **односторонний пуш** (трекер → iCloud), без чтения обратно.
- **Общий модуль** `backend/src/icloud/`: один CalDAV-клиент на оба назначения. Библиотека — **`tsdav`** (новая зависимость `backend/package.json`; заточена под iCloud, Basic Auth паролем приложения).
- **Авторизация** — пароль приложения (appleid.apple.com), не основной пароль Apple ID. Хранится в env, как `OBSIDIAN_VAULT_DIR`.
- **Env-gated и graceful**: без `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` — тихий no-op. Любая сетевая ошибка CalDAV ловится и логируется, никогда не пробрасывается в API-ответ (тот же принцип, что у `ObsidianService`).
- **Без изменений схемы БД.** Детерминированные имена объектов по id пункта (`gtd-cal-<id>.ics` для событий, `gtd-rem-<id>.ics` для напоминаний) — создание/обновление/удаление адресуются напрямую по предсказуемому URL, без поиска/листинга. Ровно тот же приём, что `<slug>-<id>.md` у Obsidian.
- **Календарь и список — отдельные, создаются пользователем вручную один раз** (в Calendar.app / Reminders.app или на icloud.com): календарь «GTD», список напоминаний «GTD Бэклог». Программное создание календарей через CalDAV (`MKCALENDAR`) капризно и не входит в объём — обнаружение существующих по `displayName` через `tsdav.fetchCalendars()`.
- **Единственный писатель.** Предполагается, что пользователь не редактирует события/напоминания в этих двух местах вручную (или не полагается на сохранность ручных правок) — обновления идут простым `PUT` без ETag/If-Match конфликт-контроля. Это сознательное упрощение для single-writer сценария.
- **Календарь — только `status = calendar`.** Событие: `title`→SUMMARY, `notes`→DESCRIPTION. Если есть `scheduledTime` — точное время, длительность по умолчанию 30 минут (у GTD-пунктов нет своего понятия длительности). Без времени — событие на весь день. Уход из статуса `calendar` (в любой другой) или удаление пункта → событие удаляется.
- **Напоминания — только `status = backlog`** (не «Ожидание» — осознанно не сейчас, см. «Не входит в объём»). `title`→SUMMARY, `dueDate` (если есть)→DUE, `priority`→PRIORITY. Три исхода при смене статуса:
  - Пункт **в** `backlog` (вошёл или остаётся) → создать/обновить напоминание, статус NEEDS-ACTION.
  - Пункт из `backlog` **в `done`** → напоминание помечается **выполненным** (COMPLETED), объект **не удаляется** — в Reminders остаётся история.
  - Пункт из `backlog` в **любой другой статус** (не `done`) → напоминание удаляется.
  - Удаление GTD-пункта, у которого `existing.status` — `backlog` или `done` (т.е. когда-либо имел напоминание) → напоминание удаляется.

## Инфраструктура

- Новая зависимость: `tsdav` в `backend/package.json`.
- Новые env-переменные (все опциональны — отсутствие `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` отключает интеграцию целиком):
  - `ICLOUD_APPLE_ID` — Apple ID (email).
  - `ICLOUD_APP_PASSWORD` — пароль приложения.
  - `ICLOUD_CALENDAR_NAME` — имя календаря (дефолт `GTD`).
  - `ICLOUD_REMINDERS_LIST_NAME` — имя списка напоминаний (дефолт `GTD Бэклог`).
- `.env.example` — добавить все четыре строки (без реальных значений). Корневой `.env` (gitignored) — пользователь заполняет сам.
- README — секция с шагами ручной настройки: сгенерировать пароль приложения, создать календарь «GTD» и список «GTD Бэклог», заполнить `.env`.
- Docker: без изменений `docker-compose.yml` (в отличие от Obsidian — тут не файловая система, а сетевой CalDAV-клиент, монтировать нечего).

## Backend

Новый модуль `backend/src/icloud/`, по образцу `backend/src/obsidian/`.

### Чистые хелперы (TDD) — `icloud.helpers.ts`

- `buildEventIcs({ uid, title, notes, date, time }): string` — минимальный VEVENT: `SUMMARY`, `DESCRIPTION`, `UID`; `DTSTART;VALUE=DATE` (весь день) если `time` пуст, иначе `DTSTART`/`DTEND` с `time` и `time+30мин`.
- `buildReminderIcs({ uid, title, dueDate, priority, completed }): string` — минимальный VTODO: `SUMMARY`, `UID`, `DUE` (если `dueDate` задан), `PRIORITY` (маппинг `priority: boolean` → CalDAV-приоритет, например `1` при true, `0`/отсутствует при false), `STATUS: NEEDS-ACTION` либо `COMPLETED` по `completed`.

### `ICloudService`

- `private calendarUrl: string | null`, `private remindersUrl: string | null` — резолвятся лениво через `tsdav.DAVClient.login()` + `fetchCalendars()`, поиск по `displayName === ICLOUD_CALENDAR_NAME`/`ICLOUD_REMINDERS_LIST_NAME`; кешируются на время жизни процесса.
- `async syncCalendarEvent(item)` — env-gated; создаёт/обновляет объект `gtd-cal-<id>.ics` в календаре.
- `async removeCalendarEvent(id)` — удаляет объект по этому href, если есть.
- `async syncReminder(item)` — создаёт/обновляет `gtd-rem-<id>.ics`, `completed=false`.
- `async completeReminder(id, item)` — обновляет тот же объект, `completed=true` (не удаляет).
- `async removeReminder(id)` — удаляет объект.
- `async syncAllOnStartup(calendarItems, backlogItems)` — bulk-синк активных `calendar`- и `backlog`-пунктов при старте (историю уже завершённых напоминаний не трогает — они уже отмечены COMPLETED на момент перехода).
- Все публичные методы — try/catch → `Logger.warn`, никогда не бросают.

### Интеграция в `GtdService`

Конструктор получает третью зависимость `icloud: ICloudService` (после `prisma`, `obsidian`).

В `update(id, patch)`, рядом с существующим Obsidian-блоком (после `prisma.update`, перед `return this.toView(updated)`):

```ts
if (updated.status === 'calendar') {
  await this.icloud.syncCalendarEvent(updated);
} else if (existing.status === 'calendar') {
  await this.icloud.removeCalendarEvent(id);
}

if (updated.status === 'backlog') {
  await this.icloud.syncReminder(updated);
} else if (updated.status === 'done' && existing.status === 'backlog') {
  await this.icloud.completeReminder(id, updated);
} else if (existing.status === 'backlog') {
  await this.icloud.removeReminder(id);
}
```

В `remove(id)`, рядом с существующим Obsidian-блоком:

```ts
if (existing.status === 'calendar') {
  await this.icloud.removeCalendarEvent(id);
}
if (existing.status === 'backlog' || existing.status === 'done') {
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
  await icloud.syncAllOnStartup(await gtd.getItems('calendar'), await gtd.getItems('backlog'));
} catch (e) {
  console.warn('iCloud startup sync skipped:', e);
}
```

## Тесты (TDD)

- **Чистые хелперы** (`icloud.helpers.spec.ts`): `buildEventIcs` — весь день vs точное время, корректный UID/SUMMARY/DESCRIPTION; `buildReminderIcs` — с/без DUE, priority true/false, NEEDS-ACTION/COMPLETED.
- **`GtdService` интеграция** (мок `icloud` как мок `obsidian` — `{syncCalendarEvent, removeCalendarEvent, syncReminder, completeReminder, removeReminder}`, все `jest.fn()`): вход/выход из `calendar`; вход в `backlog`; `backlog→done` вызывает `completeReminder`, не `removeReminder`; `backlog→другое (не done)` вызывает `removeReminder`; удаление пункта со статусом `backlog`/`done`/`calendar` вызывает соответствующий remove.
- **`ICloudService`** (реальные сетевые вызовы CalDAV) — не юнит-тестируется (как и файловые операции `ObsidianService`) — проверяется вручную на живом iCloud-аккаунте, шаг зафиксирован в плане реализации.

## Не входит в объём

- Двусторонняя синхронизация (отметил выполненным в Reminders на телефоне → статус в GTD не меняется; правки события в Calendar.app не читаются обратно) — потребовала бы периодического опроса iCloud, не событийной модели. Будущая фича, если понадобится.
- Статус «Ожидание» → Reminders — не сейчас.
- Программное создание календаря/списка через CalDAV — пользователь создаёт вручную.
- Учёт конфликтов при ручном редактировании событий/напоминаний пользователем в самих Calendar.app/Reminders.app (single-writer допущение).
- UI-индикация «синхронизировано с iCloud» в трекере.
