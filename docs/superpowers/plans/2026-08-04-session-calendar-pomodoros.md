# Помидорки из календаря Session — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «из Session» в панели помидорок, которая читает календарь Session по CalDAV и проставляет `Day.pomodoros` числом фокус-сеансов за эту дату.

**Architecture:** Логин в iCloud CalDAV выносится из `ICloudService` в отдельный провайдер `CalDavClient` и переиспользуется новым модулем `backend/src/session/`. Разбор ICS и подсчёт живут в чистых функциях без сети. Бэкенд ходит в календарь только по явному `POST /days/:date/pomodoros/sync-session`; фоновых задач нет. Фронт показывает кнопку только когда `GET /settings` вернул `sessionSyncEnabled: true`.

**Tech Stack:** NestJS 11, Prisma 7, `tsdav` 2.3.1 (уже в зависимостях), Jest 30 + ts-jest, Next.js 16 (App Router), Bun. Пакетный менеджер — **bun**, не npm.

## Global Constraints

- Все команды запускаются через **bun** (`bun run test`), из каталогов `backend/` и `frontend/` соответственно.
- Интеграция **выключена по умолчанию**: нужны одновременно `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD` и непустой `SESSION_CALENDAR_NAME`. Без них ни одного сетевого запроса, кнопки во фронте нет, трекер работает с ручным счётчиком.
- **Ошибка чтения никогда не пишет 0 в счётчик.** `0` записывается только когда календарь ответил и подходящих событий нет.
- **Только чтение** — трекер ничего не пишет в календарь Session.
- Порог помидорки: `SESSION_MIN_MINUTES`, по умолчанию `20` минут.
- Пояс для границ суток: `process.env.TZ`, по умолчанию `UTC`.
- Пароль приложения не должен попадать в текст лога — вырезать из строки ошибки, как это сделано в `backend/src/telegram/telegram.service.ts:40`.
- Никаких новых зависимостей ни в бэкенде, ни во фронтенде.
- Комментарии и сообщения в коде — в стиле существующего кода (пояснять «почему», а не «что»).
- Тесты фронта — только `.spec.ts` (jest матчит `.*\.spec\.ts$`), компонентных рендер-тестов нет.

## File Structure

| Файл | Ответственность |
|---|---|
| `backend/src/icloud/caldav.client.ts` (создать) | Логин в iCloud CalDAV, кэш клиента и календарей по имени |
| `backend/src/icloud/icloud.service.ts` (изменить) | Только VTODO-напоминания GTD; клиент берёт у `CalDavClient` |
| `backend/src/icloud/icloud.module.ts` (изменить) | Экспортирует `ICloudService` и `CalDavClient` |
| `backend/src/session/session.helpers.ts` (создать) | Чистые функции: пояс, разбор `VEVENT`, подсчёт |
| `backend/src/session/session.helpers.spec.ts` (создать) | Тесты чистых функций |
| `backend/src/session/session.service.ts` (создать) | `isEnabled()`, `syncDate()` — сеть и конфиг |
| `backend/src/session/session.service.spec.ts` (создать) | Тесты сервиса с замоканным `CalDavClient` |
| `backend/src/session/session.module.ts` (создать) | Проводка модуля |
| `backend/src/days/days.service.ts` (изменить) | Новый `setPomodoros(date, count)` |
| `backend/src/days/days.controller.ts` (изменить) | `POST /days/:date/pomodoros/sync-session` |
| `backend/src/days/days.module.ts` (изменить) | Импорт `SessionModule` |
| `backend/src/settings/settings.service.ts` (изменить) | Подмешивает `sessionSyncEnabled` |
| `backend/src/settings/settings.module.ts` (изменить) | Импорт `SessionModule` |
| `frontend/types/api.ts` (изменить) | Поле `sessionSyncEnabled` в `Settings` |
| `frontend/lib/api.ts` (изменить) | `syncSessionPomodoros(date)` |
| `frontend/components/PomodoroPanel.tsx` (изменить) | Ссылка «из Session», состояние загрузки и ошибки |
| `frontend/components/PomodoroPanel.module.css` (изменить) | Стили ссылки и текста ошибки |
| `frontend/components/Dashboard.tsx` (изменить) | Вызов API, состояние, проброс пропсов |
| `.env.example`, `docker-compose.yml` (изменить) | Новые переменные окружения |
| `README.md` (изменить) | Переписать раздел «Session.app → помидорки трекера» |

---

### Task 1: Выделение `CalDavClient` из `ICloudService`

Чистый рефакторинг без изменения поведения. Логин и поиск календаря переезжают в отдельный провайдер, чтобы модуль Session не дублировал аутентификацию.

**Files:**
- Create: `backend/src/icloud/caldav.client.ts`
- Modify: `backend/src/icloud/icloud.service.ts`, `backend/src/icloud/icloud.module.ts`

**Interfaces:**
- Consumes: ничего (первая задача).
- Produces: `CalDavClient` с методами `hasCredentials(): boolean`, `getClient(): Promise<DAVClient | null>`, `findCalendar(name: string): Promise<DAVCalendar | null>`. Используется в Task 3.

- [ ] **Step 1: Создать `backend/src/icloud/caldav.client.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { DAVClient, DAVCalendar } from 'tsdav';

@Injectable()
export class CalDavClient {
  private readonly logger = new Logger(CalDavClient.name);
  private client: DAVClient | null = null;
  private calendars = new Map<string, DAVCalendar>();

  hasCredentials(): boolean {
    return Boolean(process.env.ICLOUD_APPLE_ID && process.env.ICLOUD_APP_PASSWORD);
  }

  private credentials(): { username: string; password: string } | null {
    const username = process.env.ICLOUD_APPLE_ID;
    const password = process.env.ICLOUD_APP_PASSWORD;
    return username && password ? { username, password } : null;
  }

  async getClient(): Promise<DAVClient | null> {
    const creds = this.credentials();
    if (!creds) return null;
    if (this.client) return this.client;
    try {
      // Присваиваем только после успешного login(): если он бросил, this.client
      // должен остаться null, чтобы следующий вызов повторил попытку, а не
      // переиспользовал навсегда неаутентифицированный экземпляр.
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: creds,
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      await client.login();
      this.client = client;
      return client;
    } catch (e) {
      this.logger.warn(`iCloud login failed: ${e}`);
      return null;
    }
  }

  async findCalendar(name: string): Promise<DAVCalendar | null> {
    const cached = this.calendars.get(name);
    if (cached) return cached;
    const client = await this.getClient();
    if (!client) return null;
    try {
      const calendars = await client.fetchCalendars();
      const found = calendars.find((c) => c.displayName === name);
      if (!found) {
        this.logger.warn(`iCloud calendar "${name}" not found`);
        return null;
      }
      this.calendars.set(name, found);
      return found;
    } catch (e) {
      this.logger.warn(`iCloud calendar discovery failed: ${e}`);
      return null;
    }
  }
}
```

- [ ] **Step 2: Переписать `icloud.service.ts` на новый провайдер**

Файл целиком (публичный API не меняется — меняется только источник клиента и календаря):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { DAVCalendar } from 'tsdav';
import { CalDavClient } from './caldav.client';
import { EffectiveDue, buildReminderIcs, effectiveDue, reminderUid } from './icloud.helpers';

interface ReminderItem {
  id: number;
  title: string;
  status: string;
  dueDate: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  priority: boolean;
}

@Injectable()
export class ICloudService {
  private readonly logger = new Logger(ICloudService.name);

  constructor(private readonly caldav: CalDavClient) {}

  private async getRemindersCalendar(): Promise<DAVCalendar | null> {
    const listName = process.env.ICLOUD_REMINDERS_LIST_NAME || 'GTD';
    return this.caldav.findCalendar(listName);
  }

  private async upsert(filename: string, iCalString: string): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    const client = await this.caldav.getClient();
    if (!calendar || !client) return;
    const url = `${calendar.url}${filename}`;
    await client.deleteCalendarObject({ calendarObject: { url } }).catch(() => undefined);
    await client.createCalendarObject({ calendar, filename, iCalString });
  }

  async syncReminder(item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.caldav.hasCredentials()) return;
    try {
      const uid = reminderUid(item.id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: false });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud syncReminder(${item.id}) failed: ${e}`);
    }
  }

  async completeReminder(id: number, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.caldav.hasCredentials()) return;
    try {
      const uid = reminderUid(id);
      const ics = buildReminderIcs({ uid, title: `GTD: ${item.title}`, due, priority: item.priority, completed: true });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud completeReminder(${id}) failed: ${e}`);
    }
  }

  async removeReminder(id: number): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    const client = await this.caldav.getClient();
    if (!calendar || !client) return;
    try {
      const url = `${calendar.url}${reminderUid(id)}.ics`;
      await client.deleteCalendarObject({ calendarObject: { url } });
    } catch (e) {
      this.logger.warn(`iCloud removeReminder(${id}) failed: ${e}`);
    }
  }

  async syncAllOnStartup(items: ReminderItem[]): Promise<void> {
    for (const item of items) {
      const due = effectiveDue(item);
      if (due) await this.syncReminder(item, due);
    }
  }
}
```

- [ ] **Step 3: Обновить `icloud.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ICloudService } from './icloud.service';
import { CalDavClient } from './caldav.client';

@Module({
  providers: [CalDavClient, ICloudService],
  exports: [CalDavClient, ICloudService],
})
export class ICloudModule {}
```

- [ ] **Step 4: Проверить, что ничего не сломалось**

Run: `cd backend && bun run test`
Expected: PASS, все существующие тесты зелёные (поведение не менялось).

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/icloud/
git commit -m "refactor(backend): вынести логин CalDAV в отдельный провайдер"
```

---

### Task 2: Чистые функции разбора календаря

TDD: сначала тесты, потом реализация. Ни сети, ни Nest, ни переменных окружения — пояс передаётся параметром.

**Files:**
- Create: `backend/src/session/session.helpers.ts`, `backend/src/session/session.helpers.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `interface CalendarEvent { start: Date; end: Date }`
  - `dayWindow(date: string, timeZone: string): { start: Date; end: Date }`
  - `parseEvents(ics: string, timeZone: string): CalendarEvent[]`
  - `countPomodoros(events: CalendarEvent[], window: { start: Date; end: Date }, minMinutes: number): number`

  Всё это использует Task 3.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/src/session/session.helpers.spec.ts`:

```ts
import { countPomodoros, dayWindow, parseEvents } from './session.helpers';

function ics(body: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

describe('dayWindow', () => {
  it('returns UTC midnights for the UTC zone', () => {
    const { start, end } = dayWindow('2026-08-04', 'UTC');
    expect(start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('shifts the window by the named zone offset', () => {
    const { start, end } = dayWindow('2026-08-04', 'Europe/Moscow');
    expect(start.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-04T21:00:00.000Z');
  });

  it('handles a month boundary', () => {
    const { start, end } = dayWindow('2026-08-31', 'UTC');
    expect(start.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('parseEvents', () => {
  it('parses a UTC DTSTART/DTEND pair', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'DTEND:20260804T095500Z', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events).toHaveLength(1);
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
    expect(events[0].end.toISOString()).toBe('2026-08-04T09:55:00.000Z');
  });

  it('resolves a TZID-qualified local time', () => {
    const events = parseEvents(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART;TZID=Europe/Moscow:20260804T123000',
          'DTEND;TZID=Europe/Moscow:20260804T130000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      'UTC',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
    expect(events[0].end.toISOString()).toBe('2026-08-04T10:00:00.000Z');
  });

  it('treats a floating time as being in the given zone', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T123000', 'DTEND:20260804T130000', 'END:VEVENT'].join('\r\n')),
      'Europe/Moscow',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
  });

  it('derives the end from DURATION when DTEND is missing', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'DURATION:PT25M', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events[0].end.toISOString()).toBe('2026-08-04T09:55:00.000Z');
  });

  it('skips all-day events', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260804', 'DTEND;VALUE=DATE:20260805', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events).toEqual([]);
  });

  it('skips an event with neither DTEND nor DURATION', () => {
    const events = parseEvents(ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'END:VEVENT'].join('\r\n')), 'UTC');
    expect(events).toEqual([]);
  });

  it('parses several VEVENTs from one response', () => {
    const events = parseEvents(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260804T093000Z',
          'DTEND:20260804T095500Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'DTSTART:20260804T113000Z',
          'DTEND:20260804T115500Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      'UTC',
    );
    expect(events).toHaveLength(2);
  });

  it('unfolds RFC 5545 folded lines', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T09', ' 3000Z', 'DTEND:20260804T095500Z', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
  });

  it('returns an empty list for garbage input', () => {
    expect(parseEvents('not an ics at all', 'UTC')).toEqual([]);
  });
});

describe('countPomodoros', () => {
  const window = dayWindow('2026-08-04', 'UTC');
  const evt = (startIso: string, endIso: string) => ({ start: new Date(startIso), end: new Date(endIso) });

  it('counts events at or above the minute threshold', () => {
    const events = [
      evt('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z'),
      evt('2026-08-04T10:00:00Z', '2026-08-04T10:20:00Z'),
    ];
    expect(countPomodoros(events, window, 20)).toBe(2);
  });

  it('drops events shorter than the threshold', () => {
    const events = [evt('2026-08-04T09:00:00Z', '2026-08-04T09:15:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(0);
  });

  it('ignores events outside the window', () => {
    const events = [evt('2026-08-05T09:00:00Z', '2026-08-05T09:30:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(0);
  });

  it('counts an event crossing midnight in both days', () => {
    const events = [evt('2026-08-04T23:50:00Z', '2026-08-05T00:20:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(1);
    expect(countPomodoros(events, dayWindow('2026-08-05', 'UTC'), 20)).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(countPomodoros([], window, 20)).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test session.helpers`
Expected: FAIL — `Cannot find module './session.helpers'`.

- [ ] **Step 3: Реализовать `backend/src/session/session.helpers.ts`**

```ts
export interface CalendarEvent {
  start: Date;
  end: Date;
}

export interface DayWindow {
  start: Date;
  end: Date;
}

// Смещение пояса в миллисекундах для конкретного момента: форматируем момент
// в целевом поясе и сравниваем с тем же набором полей, прочитанным как UTC.
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hour12:false в части сред даёт "24" вместо "00" для полуночи.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - at.getTime();
}

// Локальное время в поясе -> абсолютный момент. Второй проход нужен на границах
// перевода часов: смещение зависит от искомого момента, а не от догадки.
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(firstPass), timeZone));
}

export function dayWindow(date: string, timeZone: string): DayWindow {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone),
    // Date.UTC сам переносит через границу месяца и года.
    end: zonedTimeToUtc(year, month, day + 1, 0, 0, 0, timeZone),
  };
}

function unfold(ics: string): string[] {
  return ics
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of raw.split(';').slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return params;
}

function parseIcsTime(value: string, params: Record<string, string>, timeZone: string): Date | null {
  // События «на весь день» пропускаем: сеанс Session всегда со временем, а
  // сутки длиной 24 часа дали бы ложную помидорку.
  if (params.VALUE === 'DATE') return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, params.TZID || timeZone);
}

function parseDurationMs(value: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, d, h, mi, s] = m;
  const ms = ((+(d ?? 0) * 24 + +(h ?? 0)) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return ms > 0 ? ms : null;
}

export function parseEvents(ics: string, timeZone: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let start: Date | null = null;
  let end: Date | null = null;
  let durationMs: number | null = null;
  let inEvent = false;

  for (const line of unfold(ics)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      start = end = durationMs = null;
      continue;
    }
    if (!inEvent) continue;
    if (line.startsWith('END:VEVENT')) {
      const finish = end ?? (start && durationMs ? new Date(start.getTime() + durationMs) : null);
      // Ни DTEND, ни DURATION — считать нечего, событие пропускаем.
      if (start && finish) events.push({ start, end: finish });
      inEvent = false;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const key = name.split(';')[0].toUpperCase();
    if (key === 'DTSTART') start = parseIcsTime(value, parseParams(name), timeZone);
    else if (key === 'DTEND') end = parseIcsTime(value, parseParams(name), timeZone);
    else if (key === 'DURATION') durationMs = parseDurationMs(value);
  }

  return events;
}

export function countPomodoros(events: CalendarEvent[], window: DayWindow, minMinutes: number): number {
  const minMs = minMinutes * 60_000;
  return events.filter(
    (e) =>
      e.end > window.start &&
      e.start < window.end &&
      e.end.getTime() - e.start.getTime() >= minMs,
  ).length;
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && bun run test session.helpers`
Expected: PASS, все кейсы зелёные.

- [ ] **Step 5: Commit**

```bash
git add backend/src/session/session.helpers.ts backend/src/session/session.helpers.spec.ts
git commit -m "feat(backend): разбор VEVENT и подсчёт помидорок из календаря"
```

---

### Task 3: `SessionService` и проводка модуля

**Files:**
- Create: `backend/src/session/session.service.ts`, `backend/src/session/session.service.spec.ts`, `backend/src/session/session.module.ts`

**Interfaces:**
- Consumes: `CalDavClient` из Task 1; `dayWindow`, `parseEvents`, `countPomodoros`, `CalendarEvent` из Task 2.
- Produces: `SessionService` с `isEnabled(): boolean` и `syncDate(date: string): Promise<number | null>` (число — успех, `null` — не настроено или ошибка чтения; никогда не бросает). `SessionModule` экспортирует `SessionService`. Используется в Task 4 и Task 5.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/src/session/session.service.spec.ts`:

```ts
import { SessionService } from './session.service';

function icsEvent(startIso: string, endIso: string): string {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    `DTSTART:${stamp(new Date(startIso).toISOString())}`,
    `DTEND:${stamp(new Date(endIso).toISOString())}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('SessionService', () => {
  const originalEnv = { ...process.env };
  let caldav: any;
  let client: any;
  let service: SessionService;

  beforeEach(() => {
    process.env.ICLOUD_APPLE_ID = 'me@example.com';
    process.env.ICLOUD_APP_PASSWORD = 'app-specific-password';
    process.env.SESSION_CALENDAR_NAME = 'Session';
    process.env.SESSION_MIN_MINUTES = '20';
    process.env.TZ = 'UTC';
    client = { fetchCalendarObjects: jest.fn().mockResolvedValue([]) };
    caldav = {
      hasCredentials: jest.fn().mockReturnValue(true),
      getClient: jest.fn().mockResolvedValue(client),
      findCalendar: jest.fn().mockResolvedValue({ url: 'https://caldav.icloud.com/cal/' }),
    };
    service = new SessionService(caldav);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled when the calendar name is empty', async () => {
    process.env.SESSION_CALENDAR_NAME = '';
    expect(service.isEnabled()).toBe(false);
    expect(await service.syncDate('2026-08-04')).toBeNull();
    expect(caldav.findCalendar).not.toHaveBeenCalled();
  });

  it('is disabled without iCloud credentials', () => {
    caldav.hasCredentials.mockReturnValue(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('returns null when the calendar is not found', async () => {
    caldav.findCalendar.mockResolvedValue(null);
    expect(await service.syncDate('2026-08-04')).toBeNull();
  });

  it('returns null when the CalDAV request throws', async () => {
    client.fetchCalendarObjects.mockRejectedValue(new Error('network down'));
    expect(await service.syncDate('2026-08-04')).toBeNull();
  });

  it('returns 0 when the calendar answers with no events', async () => {
    expect(await service.syncDate('2026-08-04')).toBe(0);
  });

  it('counts qualifying events from the calendar response', async () => {
    client.fetchCalendarObjects.mockResolvedValue([
      { data: icsEvent('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z') },
      { data: icsEvent('2026-08-04T10:00:00Z', '2026-08-04T10:30:00Z') },
      { data: icsEvent('2026-08-04T11:00:00Z', '2026-08-04T11:10:00Z') },
    ]);
    expect(await service.syncDate('2026-08-04')).toBe(2);
  });

  it('asks the calendar for the requested day window', async () => {
    await service.syncDate('2026-08-04');
    expect(client.fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: { start: '2026-08-04T00:00:00.000Z', end: '2026-08-05T00:00:00.000Z' },
      }),
    );
  });

  it('never leaks the app password into the log message', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    client.fetchCalendarObjects.mockRejectedValue(new Error('failed for app-specific-password'));
    await service.syncDate('2026-08-04');
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test session.service`
Expected: FAIL — `Cannot find module './session.service'`.

- [ ] **Step 3: Реализовать `backend/src/session/session.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { CalDavClient } from '../icloud/caldav.client';
import { countPomodoros, dayWindow, parseEvents } from './session.helpers';

const DEFAULT_MIN_MINUTES = 20;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly caldav: CalDavClient) {}

  private calendarName(): string {
    return (process.env.SESSION_CALENDAR_NAME ?? '').trim();
  }

  private minMinutes(): number {
    const parsed = Number(process.env.SESSION_MIN_MINUTES);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_MINUTES;
  }

  private timeZone(): string {
    return process.env.TZ || 'UTC';
  }

  isEnabled(): boolean {
    return this.caldav.hasCredentials() && this.calendarName().length > 0;
  }

  // Число — календарь ответил. null — не настроено или чтение не удалось;
  // вызывающий обязан не трогать счётчик, иначе сетевой сбой обнулил бы день.
  async syncDate(date: string): Promise<number | null> {
    if (!this.isEnabled()) return null;
    try {
      const calendar = await this.caldav.findCalendar(this.calendarName());
      const client = await this.caldav.getClient();
      if (!calendar || !client) return null;

      const timeZone = this.timeZone();
      const window = dayWindow(date, timeZone);
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: window.start.toISOString(), end: window.end.toISOString() },
      });

      const events = objects.flatMap((o) => parseEvents(o.data ?? '', timeZone));
      return countPomodoros(events, window, this.minMinutes());
    } catch (e) {
      this.logger.warn(`Session syncDate(${date}) failed: ${this.redact(String(e))}`);
      return null;
    }
  }

  // Текст ошибки от tsdav/fetch может содержать URL с учётными данными —
  // вырезаем пароль приложения, чтобы он не осел в логах.
  private redact(message: string): string {
    const password = process.env.ICLOUD_APP_PASSWORD;
    return password ? message.split(password).join('<redacted>') : message;
  }
}
```

- [ ] **Step 4: Создать `backend/src/session/session.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { ICloudModule } from '../icloud/icloud.module';

@Module({
  imports: [ICloudModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd backend && bun run test session`
Expected: PASS, тесты хелперов и сервиса зелёные.

- [ ] **Step 6: Commit**

```bash
git add backend/src/session/
git commit -m "feat(backend): сервис чтения календаря Session по CalDAV"
```

---

### Task 4: `setPomodoros` и эндпоинт синхронизации

**Files:**
- Modify: `backend/src/days/days.service.ts`, `backend/src/days/days.controller.ts`, `backend/src/days/days.module.ts`
- Test: `backend/src/days/days.service.spec.ts`

**Interfaces:**
- Consumes: `SessionService.isEnabled()` / `SessionService.syncDate()` из Task 3.
- Produces: `DaysService.setPomodoros(dateStr: string, count: number): Promise<DayView>` и маршрут `POST /days/:date/pomodoros/sync-session`, возвращающий `DayView`. Использует Task 6.

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `backend/src/days/days.service.spec.ts`:

```ts
describe('DaysService.setPomodoros', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          date: new Date('2026-08-04T00:00:00.000Z'),
          youtubeMinutes: 0,
          pomodoros: 7,
          eveningClosed: false,
          rating: null,
          comment: null,
          categories: [],
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
    );
  });

  it('writes an absolute value regardless of the previous count', async () => {
    await service.setPomodoros('2026-08-04', 3);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 3 } });
  });

  it('clamps a negative count to zero', async () => {
    await service.setPomodoros('2026-08-04', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { pomodoros: 0 } });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend && bun run test days.service`
Expected: FAIL — `service.setPomodoros is not a function`.

- [ ] **Step 3: Добавить `setPomodoros` в `days.service.ts`**

Сразу после метода `updatePomodoros` (`backend/src/days/days.service.ts:116-122`):

```ts
  // Абсолютная запись — в отличие от updatePomodoros с его delta/reset.
  // Нужна синхронизации с календарём, где источник правды — число событий.
  async setPomodoros(dateStr: string, count: number): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data: { pomodoros: Math.max(0, count) } });
    return this.getDay(dateStr);
  }
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `cd backend && bun run test days.service`
Expected: PASS.

- [ ] **Step 5: Добавить эндпоинт в `days.controller.ts`**

Импорты в шапке файла:

```ts
import { BadGatewayException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SessionService } from '../session/session.service';
```

Конструктор:

```ts
  constructor(
    private readonly daysService: DaysService,
    private readonly session: SessionService,
  ) {}
```

Метод сразу после `updatePomodoros`:

```ts
  @Post('days/:date/pomodoros/sync-session')
  async syncSessionPomodoros(@Param('date') date: string) {
    if (!this.session.isEnabled()) {
      throw new ConflictException('Синхронизация с календарём Session не настроена');
    }
    const count = await this.session.syncDate(date);
    // null — календарь прочитать не удалось. Счётчик не трогаем: иначе сетевой
    // сбой обнулил бы день. Ноль пишется только когда календарь ответил пустым.
    if (count === null) {
      throw new BadGatewayException('Не удалось прочитать календарь Session');
    }
    return this.daysService.setPomodoros(date, count);
  }
```

- [ ] **Step 6: Подключить `SessionModule` в `days.module.ts`**

```ts
import { SessionModule } from '../session/session.module';
// ...
@Module({
  imports: [CategoriesModule, GtdModule, TelegramModule, SessionModule],
  controllers: [DaysController],
  providers: [DaysService],
  exports: [DaysService],
})
```

- [ ] **Step 7: Проверить сборку и весь набор тестов**

Run: `cd backend && bun run test`
Expected: PASS, все тесты зелёные.

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 8: Commit**

```bash
git add backend/src/days/
git commit -m "feat(backend): эндпоинт синхронизации помидорок с календарём Session"
```

---

### Task 5: Флаг `sessionSyncEnabled` в настройках и переменные окружения

**Files:**
- Modify: `backend/src/settings/settings.service.ts`, `backend/src/settings/settings.module.ts`, `.env.example`, `docker-compose.yml`
- Test: `backend/src/settings/settings.service.spec.ts` (создать)

**Interfaces:**
- Consumes: `SessionService.isEnabled()` из Task 3.
- Produces: `GET /settings` и `PATCH /settings` возвращают объект настроек с дополнительным полем `sessionSyncEnabled: boolean`. Использует Task 6.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/settings/settings.service.spec.ts`:

```ts
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let session: any;
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, youtubeBudget: 60, notificationsEnabled: false }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 1, youtubeBudget: 90, notificationsEnabled: false }),
      },
    };
    session = { isEnabled: jest.fn().mockReturnValue(true) };
    service = new SettingsService(prisma, session);
  });

  it('exposes sessionSyncEnabled from the session service on get', async () => {
    expect(await service.get()).toEqual({
      id: 1,
      youtubeBudget: 60,
      notificationsEnabled: false,
      sessionSyncEnabled: true,
    });
  });

  it('reports the flag as false when the integration is off', async () => {
    session.isEnabled.mockReturnValue(false);
    expect((await service.get()).sessionSyncEnabled).toBe(false);
  });

  it('keeps the flag on the update response', async () => {
    const result = await service.update({ youtubeBudget: 90 });
    expect(result.sessionSyncEnabled).toBe(true);
    expect(result.youtubeBudget).toBe(90);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend && bun run test settings.service`
Expected: FAIL — конструктор `SettingsService` принимает один аргумент, поля `sessionSyncEnabled` нет.

- [ ] **Step 3: Переписать `settings.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SessionService } from '../session/session.service';

interface SettingsRow {
  id: number;
  youtubeBudget: number;
  notificationsEnabled: boolean;
}

export type SettingsView = SettingsRow & { sessionSyncEnabled: boolean };

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private session: SessionService,
  ) {}

  // sessionSyncEnabled в БД не хранится: это отражение переменных окружения,
  // а не пользовательская настройка, поэтому и в PATCH оно не принимается.
  private withFlags(row: SettingsRow): SettingsView {
    return { ...row, sessionSyncEnabled: this.session.isEnabled() };
  }

  private async row(): Promise<SettingsRow> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    if (settings) return settings;
    return this.prisma.settings.create({ data: { id: 1 } });
  }

  async get(): Promise<SettingsView> {
    return this.withFlags(await this.row());
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsView> {
    await this.row();
    const updated = await this.prisma.settings.update({ where: { id: 1 }, data: dto });
    return this.withFlags(updated);
  }
}
```

- [ ] **Step 4: Подключить `SessionModule` в `settings.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd backend && bun run test`
Expected: PASS, весь набор зелёный.

- [ ] **Step 6: Добавить переменные в `.env.example`**

Дописать в конец файла:

```
SESSION_CALENDAR_NAME=
SESSION_MIN_MINUTES=20
TZ=UTC
```

- [ ] **Step 7: Пробросить переменные в `docker-compose.yml`**

В `services.backend.environment`, после строки `TELEGRAM_CHAT_ID`:

```yaml
      SESSION_CALENDAR_NAME: ${SESSION_CALENDAR_NAME:-}
      SESSION_MIN_MINUTES: ${SESSION_MIN_MINUTES:-20}
      TZ: ${TZ:-UTC}
```

- [ ] **Step 8: Проверить, что compose-файл валиден**

Run: `docker compose config --quiet`
Expected: без вывода и с нулевым кодом возврата.

- [ ] **Step 9: Commit**

```bash
git add backend/src/settings/ .env.example docker-compose.yml
git commit -m "feat(backend): флаг sessionSyncEnabled в настройках и env для календаря"
```

---

### Task 6: Кнопка «из Session» во фронтенде

**Files:**
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/components/PomodoroPanel.tsx`, `frontend/components/PomodoroPanel.module.css`, `frontend/components/Dashboard.tsx`
- Test: `frontend/lib/api.spec.ts`

**Interfaces:**
- Consumes: `POST /days/:date/pomodoros/sync-session` из Task 4; поле `sessionSyncEnabled` из Task 5.
- Produces: `syncSessionPomodoros(date: string): Promise<DayView>` в `frontend/lib/api.ts`.

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `describe('api request helper', ...)` в `frontend/lib/api.spec.ts`:

```ts
  it('posts to the session sync endpoint and returns the updated day', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-08-04', pomodoros: 5 }),
    }) as unknown as typeof fetch;

    const result = await syncSessionPomodoros('2026-08-04');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-04/pomodoros/sync-session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ date: '2026-08-04', pomodoros: 5 });
  });
```

И добавить `syncSessionPomodoros` в список импортов в первой строке файла.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && bun run test api`
Expected: FAIL — `syncSessionPomodoros is not a function`.

- [ ] **Step 3: Добавить функцию в `frontend/lib/api.ts`**

Сразу после `updatePomodoros` (`frontend/lib/api.ts:78-80`):

```ts
export function syncSessionPomodoros(date: string): Promise<DayView> {
  return request(`/days/${date}/pomodoros/sync-session`, { method: 'POST' });
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `cd frontend && bun run test api`
Expected: PASS.

- [ ] **Step 5: Добавить поле в `frontend/types/api.ts`**

```ts
export interface Settings {
  id: number;
  youtubeBudget: number;
  notificationsEnabled: boolean;
  sessionSyncEnabled: boolean;
}
```

- [ ] **Step 6: Расширить `PomodoroPanel.tsx`**

Пропсы и разметка. Ссылка не рендерится, если `onSyncSession` не передан — так у пользователя без интеграции панель выглядит ровно как раньше.

```tsx
interface PomodoroPanelProps {
  count: number;
  onAdd: (delta: number) => void;
  onReset: () => void;
  onSyncSession?: () => void;
  syncing?: boolean;
  syncError?: string | null;
}

export default function PomodoroPanel({
  count,
  onAdd,
  onReset,
  onSyncSession,
  syncing = false,
  syncError = null,
}: PomodoroPanelProps) {
```

В блоке `<div className={styles.top}>` заменить одиночную ссылку «сбросить» на группу:

```tsx
        <div className={styles.actions}>
          {onSyncSession && (
            <button
              type="button"
              className={styles.linkAction}
              onClick={onSyncSession}
              disabled={syncing}
            >
              {syncing ? 'читаю…' : 'из Session'}
            </button>
          )}
          <span className={styles.reset} onClick={onReset}>
            сбросить
          </span>
        </div>
```

И сразу после блока `<div className={styles.caption}>…</div>` добавить строку ошибки:

```tsx
      {syncError && <div className={styles.syncError}>{syncError}</div>}
```

- [ ] **Step 7: Добавить стили в `PomodoroPanel.module.css`**

Дописать в конец файла:

```css
.actions {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.linkAction {
  background: none;
  border: none;
  padding: 0;
  font-size: 11.5px;
  font-family: inherit;
  color: var(--pom);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.linkAction:disabled {
  color: var(--text-dim);
  cursor: default;
  text-decoration: none;
}

.syncError {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
}
```

- [ ] **Step 8: Подключить в `Dashboard.tsx`**

Импорт — добавить `syncSessionPomodoros` в список из `@/lib/api`.

Состояние рядом с `const [closingDay, setClosingDay] = useState(false);`:

```tsx
  const [syncingSession, setSyncingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
```

Функция рядом с `resetPomodoro` (`frontend/components/Dashboard.tsx:186`):

```tsx
  async function syncSession() {
    setSyncingSession(true);
    setSessionError(null);
    try {
      setDay(await syncSessionPomodoros(date));
    } catch {
      setSessionError('Не удалось прочитать календарь Session');
    } finally {
      setSyncingSession(false);
    }
  }
```

Рендер `PomodoroPanel` (`frontend/components/Dashboard.tsx:263`):

```tsx
            <PomodoroPanel
              count={day.pomodoros}
              onAdd={addPomodoro}
              onReset={resetPomodoro}
              onSyncSession={settings?.sessionSyncEnabled ? syncSession : undefined}
              syncing={syncingSession}
              syncError={sessionError}
            />
```

- [ ] **Step 9: Проверить типы, тесты и сборку**

Run: `cd frontend && bun run test`
Expected: PASS.

Run: `cd frontend && bunx tsc --noEmit`
Expected: без ошибок типов.

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): кнопка подтягивания помидорок из календаря Session"
```

---

### Task 7: Проверка на живом стеке и документация

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: всё из Task 1–6.
- Produces: ничего для кода.

- [ ] **Step 1: Поднять стек и убедиться, что без настройки ничего не сломалось**

Run: `docker compose up -d --build postgres backend frontend`
Expected: контейнеры поднимаются, `docker compose ps` показывает их живыми.

Run: `curl -s http://localhost:3001/settings`
Expected: JSON с `"sessionSyncEnabled":false` (в `.env` пусто).

Run: `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/days/2026-08-04/pomodoros/sync-session`
Expected: `409`.

Открыть http://localhost:4887 — панель помидорок выглядит как раньше, ссылки «из Session» нет.

- [ ] **Step 2: Проверить включённый режим (если под рукой есть учётка iCloud)**

Заполнить в корневом `.env`: `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD`, `SESSION_CALENDAR_NAME`, `TZ`. Перезапустить: `docker compose up -d --build backend`.

Run: `curl -s http://localhost:3001/settings`
Expected: `"sessionSyncEnabled":true`; на странице появилась ссылка «из Session», клик проставляет число сеансов за сегодня.

Если учётной записи под рукой нет — зафиксировать это в отчёте и не отмечать шаг как выполненный, а не выдавать за проверенное.

- [ ] **Step 3: Переписать раздел README**

Заменить существующий раздел `### Session.app → помидорки трекера` целиком:

````markdown
### Session.app → помидорки трекера

[Session](https://www.stayinsession.com/) пишет каждый завершённый фокус-сеанс отдельным
событием в свой календарь Apple (включается в Session → Settings → Calendar). Трекер умеет
прочитать этот календарь и проставить число сеансов в счётчик помидорок — **по кнопке**,
без фонового синка: ссылка «из Session» в панели помидорок.

Кнопка **перезаписывает** счётчик числом подходящих событий за выбранный день. Ручные
`+1` / `−1` продолжают работать и живут до следующего нажатия.

Настройка (один раз, руками):
1. Включить в Session синхронизацию с календарём и запомнить имя календаря.
2. Убедиться, что этот календарь синкается в iCloud (в Календаре.app он должен лежать
   в разделе iCloud, а не «На моём Mac») — трекер читает его по CalDAV.
3. Заполнить в корневом `.env`:
   - `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD` — те же, что для GTD-напоминаний
     (пароль приложения с appleid.apple.com);
   - `SESSION_CALENDAR_NAME` — имя календаря из шага 1;
   - `SESSION_MIN_MINUTES` — минимальная длина сеанса, который считается помидоркой
     (по умолчанию 20; отсекает перерывы и оборванные сеансы);
   - `TZ` — твой часовой пояс, например `Europe/Moscow`. Без него сутки считаются
     по UTC и вечерние сеансы уедут в следующий день.
4. `docker compose up -d --build backend`.

Без `SESSION_CALENDAR_NAME` или без учётных данных iCloud интеграция выключена: кнопки
в интерфейсе нет, счётчик остаётся обычным ручным, остальной трекер работает как всегда.

Ошибка чтения календаря (нет сети, неверный пароль, календарь не найден) **не обнуляет
счётчик** — показывается сообщение, значение остаётся прежним. Ноль записывается только
если календарь реально ответил и подходящих сеансов в нём нет.

<details>
<summary>Запасной вариант: шорткат «Команды» (если календарь не синкается в iCloud)</summary>

Трекер читает календарь только через iCloud. Если календарь Session лежит локально на Mac,
то же самое делается шорткатом на самом Mac:

1. **«Найти события календаря»**: календарь = `Session`, «Дата начала» = сегодня.
2. **«Количество»** от результата → переменная `N`.
3. «Получить содержимое URL» → `http://Alekseis-MacBook-Pro.local:3001/days/<YYYY-MM-DD>/pomodoros`,
   метод **PATCH**, заголовок `Content-Type: application/json`, тело `{"reset": true}`.
4. Ещё раз то же действие с телом `{"delta": N}`.

Порядок шагов 3–4 важен: сначала обнуление, потом запись, иначе значения сложатся.
`reset: true` перебивает `delta`, поэтому за один запрос это не сделать.

</details>
````

- [ ] **Step 4: Прогнать оба набора тестов начисто**

Run: `cd backend && bun run test`
Expected: PASS.

Run: `cd frontend && bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: подтягивание помидорок из календаря Session"
```
