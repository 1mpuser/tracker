# GTD этап D — авто-синк с iCloud Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически синкать GTD-пункты с эффективной датой (`dueDate`, либо `scheduledDate` у пунктов в статусе `calendar`) в iCloud Reminders (список «GTD») через CalDAV — без автоматического синка с Calendar (события пользователь ставит сам).

**Architecture:** Новый модуль `backend/src/icloud/` (CalDAV-клиент `tsdav`, авторизация паролем приложения). Чистая функция `effectiveDue()` определяет, есть ли у пункта дата для напоминания. `ICloudService` — сеть, env-gated, graceful (никогда не бросает). Интеграция — хуки в `GtdService.update`/`remove`, по образцу уже существующего `ObsidianService`. Детерминированные имена CalDAV-объектов по id (`gtd-rem-<id>.ics`), без изменений схемы БД.

**Tech Stack:** NestJS + Prisma, `tsdav` (CalDAV), Bun, Jest, Docker Compose. Спека: `docs/superpowers/specs/2026-07-25-gtd-icloud-sync-design.md`.

## Global Constraints

- Рантайм — **Bun** (`bunx jest`, `bun run build`, `bun add`).
- **Никогда не бросает в вызывающий код** — все CalDAV-вызовы в try/catch → `Logger.warn`. Без `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` — тихий no-op (как `ObsidianService`).
- **Без изменений схемы БД.**
- **Single-writer, без ETag/If-Match** — обновление объекта делается как «удалить если есть → создать заново» (тот же приём, что `ObsidianService.syncNote`: `removeById` + `writeFile`), не conditional PATCH.
- Список «GTD» в Reminders создаётся пользователем вручную (уже создан). `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD` уже в корневом `.env`.
- Юнит-тесты **не мокают/не импортируют реальный `ICloudService`/`tsdav`** в `gtd.service.spec.ts` — только `jest.fn()`-заглушки объектом, как уже сделано для `obsidian` в этом файле. `ICloudService` (сетевой код) не юнит-тестируется — гейт: `bun run build` + ручная проверка на живом аккаунте.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** postgres поднят; `bun install` в `backend/`. Backend-команды — из `backend/`. Корневой `.env` уже содержит `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD`; список «GTD» в Reminders создан пользователем заранее.

---

### Task 1: Зависимость `tsdav` + docker-compose env + `.env.example` + README

**Files:**
- Modify: `backend/package.json` (через `bun add`, не руками)
- Modify: `docker-compose.yml`, `.env.example`, `README.md`

**Interfaces:**
- Produces: контейнер backend получает `ICLOUD_APPLE_ID`, `ICLOUD_APP_PASSWORD`, `ICLOUD_REMINDERS_LIST_NAME` из окружения (пусто, если не заданы в корневом `.env` — интеграция тогда выключена).

- [ ] **Step 1: Добавить зависимость**

Run (из `backend/`): `bun add tsdav`
Expected: `tsdav` появляется в `dependencies` в `backend/package.json` с версией, которую сам разрешит Bun (не проставлять версию руками).

- [ ] **Step 2: Прокинуть env в docker-compose**

В `docker-compose.yml`, сервис `backend`, в блок `environment:` (после `OBSIDIAN_EXPORT_DIR: /vault`) добавить:
```yaml
      ICLOUD_APPLE_ID: ${ICLOUD_APPLE_ID:-}
      ICLOUD_APP_PASSWORD: ${ICLOUD_APP_PASSWORD:-}
      ICLOUD_REMINDERS_LIST_NAME: ${ICLOUD_REMINDERS_LIST_NAME:-GTD}
```
(Пустой дефолт `:-` — если переменной нет в `.env`, контейнер получит пустую строку, интеграция должна воспринимать пустую строку как «не задано», см. Task 3.)

- [ ] **Step 3: `.env.example`**

В `.env.example` добавить (без реальных значений):
```
ICLOUD_APPLE_ID=
ICLOUD_APP_PASSWORD=
ICLOUD_REMINDERS_LIST_NAME=GTD
```

- [ ] **Step 4: README**

В `README.md`, рядом с существующей секцией «Obsidian-экспорт Заметок (GTD)», добавить:
```markdown
### iCloud Reminders (GTD)

GTD-пункты с дедлайном (`dueDate`), а также пункты в статусе «Календарь» (по их дате),
автоматически синкаются в список **«GTD»** в iCloud Reminders — это даёт настоящее
системное напоминание на телефоне/часах. Календарные события (Calendar.app) НЕ
создаются автоматически — пользователь ставит их сам.

Настройка (один раз, руками):
1. Сгенерировать пароль приложения на appleid.apple.com → «Вход и безопасность» →
   «Пароли для приложений».
2. Создать пустой список **«GTD»** в Reminders.app (или на icloud.com).
3. Заполнить в корневом `.env`: `ICLOUD_APPLE_ID` (email Apple ID),
   `ICLOUD_APP_PASSWORD` (пароль приложения из шага 1).

Без этих двух переменных интеграция молча выключена — остальной трекер работает как обычно.
```

- [ ] **Step 5: Проверка**

Run (из корня репозитория): `docker compose config >/dev/null && echo "compose OK"`
Expected: `compose OK`.
Run (из `backend/`): `bun run build`
Expected: чисто (новая зависимость не ломает сборку). Если сборка падает именно из-за `tsdav` (ESM/CJS-несовместимость с Nest-сборкой) — не обходить хаком, сообщить как BLOCKED с точным текстом ошибки.

- [ ] **Step 6: Коммит**

```bash
git add backend/package.json backend/bun.lock docker-compose.yml .env.example README.md
git commit -m "chore(backend): add tsdav dependency, wire ICLOUD_* env into docker-compose"
```
(Если lockfile называется иначе — добавить фактическое имя lock-файла, который обновил `bun add`.)

---

### Task 2: Чистые хелперы — `effectiveDue`, `reminderUid`, `buildReminderIcs`

**Files:**
- Create: `backend/src/icloud/icloud.helpers.ts`
- Test: `backend/src/icloud/icloud.helpers.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EffectiveDue { date: string; time: string | null; }
  export function effectiveDue(item: { dueDate: string | null; status: string; scheduledDate: string | null; scheduledTime: string | null }): EffectiveDue | null
  export function reminderUid(id: number): string   // "gtd-rem-<id>"
  export function buildReminderIcs(params: { uid: string; title: string; due: EffectiveDue | null; priority: boolean; completed: boolean }): string
  ```

- [ ] **Step 1: Написать падающие тесты**

Create `backend/src/icloud/icloud.helpers.spec.ts`:
```ts
import { buildReminderIcs, effectiveDue, reminderUid } from './icloud.helpers';

describe('effectiveDue', () => {
  it('uses dueDate when set, regardless of status', () => {
    expect(
      effectiveDue({ dueDate: '2026-08-01', status: 'backlog', scheduledDate: null, scheduledTime: null }),
    ).toEqual({ date: '2026-08-01', time: null });
  });

  it('falls back to scheduledDate/scheduledTime when status is calendar and no dueDate', () => {
    expect(
      effectiveDue({ dueDate: null, status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '14:30' }),
    ).toEqual({ date: '2026-08-02', time: '14:30' });
  });

  it('returns null when status is calendar but no scheduledDate somehow', () => {
    expect(effectiveDue({ dueDate: null, status: 'calendar', scheduledDate: null, scheduledTime: null })).toBeNull();
  });

  it('returns null when neither dueDate nor calendar-with-scheduledDate applies', () => {
    expect(
      effectiveDue({ dueDate: null, status: 'someday', scheduledDate: '2026-08-02', scheduledTime: null }),
    ).toBeNull();
  });

  it('prefers dueDate over scheduledDate when both are present', () => {
    expect(
      effectiveDue({ dueDate: '2026-08-01', status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '09:00' }),
    ).toEqual({ date: '2026-08-01', time: null });
  });
});

describe('reminderUid', () => {
  it('builds a deterministic id-based uid', () => {
    expect(reminderUid(42)).toBe('gtd-rem-42');
  });
});

describe('buildReminderIcs', () => {
  it('includes a date-only DUE when time is null', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-1',
      title: 'Позвонить в банк',
      due: { date: '2026-08-01', time: null },
      priority: false,
      completed: false,
    });
    expect(ics).toContain('UID:gtd-rem-1');
    expect(ics).toContain('SUMMARY:Позвонить в банк');
    expect(ics).toContain('DUE;VALUE=DATE:20260801');
    expect(ics).toContain('STATUS:NEEDS-ACTION');
  });

  it('includes a date+time DUE when time is set', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-2',
      title: 'Встреча',
      due: { date: '2026-08-01', time: '14:30' },
      priority: true,
      completed: false,
    });
    expect(ics).toContain('DUE:20260801T143000');
    expect(ics).toContain('PRIORITY:1');
  });

  it('marks completed items as STATUS:COMPLETED', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-3',
      title: 'Сделано',
      due: { date: '2026-08-01', time: null },
      priority: false,
      completed: true,
    });
    expect(ics).toContain('STATUS:COMPLETED');
  });

  it('omits DUE entirely when due is null', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-4',
      title: 'Без даты',
      due: null,
      priority: false,
      completed: false,
    });
    expect(ics).not.toContain('DUE');
  });

  it('escapes commas, semicolons and backslashes in the title', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-5',
      title: 'A, B; C\\D',
      due: null,
      priority: false,
      completed: false,
    });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run (из `backend/`): `bunx jest icloud.helpers.spec.ts`
Expected: FAIL — модуль `./icloud.helpers` не найден.

- [ ] **Step 3: Реализовать**

Create `backend/src/icloud/icloud.helpers.ts`:
```ts
export interface EffectiveDue {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM or null
}

export function effectiveDue(item: {
  dueDate: string | null;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
}): EffectiveDue | null {
  if (item.dueDate) return { date: item.dueDate, time: null };
  if (item.status === 'calendar' && item.scheduledDate) {
    return { date: item.scheduledDate, time: item.scheduledTime };
  }
  return null;
}

export function reminderUid(id: number): string {
  return `gtd-rem-${id}`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildReminderIcs(params: {
  uid: string;
  title: string;
  due: EffectiveDue | null;
  priority: boolean;
  completed: boolean;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tracker-gtd//EN',
    'BEGIN:VTODO',
    `UID:${params.uid}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
  ];
  if (params.due) {
    if (params.due.time) {
      const compactDate = params.due.date.replace(/-/g, '');
      const compactTime = params.due.time.replace(':', '') + '00';
      lines.push(`DUE:${compactDate}T${compactTime}`);
    } else {
      lines.push(`DUE;VALUE=DATE:${params.due.date.replace(/-/g, '')}`);
    }
  }
  lines.push(`PRIORITY:${params.priority ? '1' : '0'}`);
  lines.push(`STATUS:${params.completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}
```

- [ ] **Step 4: Запустить — проходит**

Run (из `backend/`): `bunx jest icloud.helpers.spec.ts`
Expected: PASS (все тесты).

- [ ] **Step 5: Сборка**

Run (из `backend/`): `bun run build` → чисто.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/icloud/icloud.helpers.ts backend/src/icloud/icloud.helpers.spec.ts
git commit -m "feat(backend): icloud helpers — effectiveDue, reminderUid, buildReminderIcs"
```

---

### Task 3: `ICloudService` (CalDAV) + `ICloudModule`

**Files:**
- Create: `backend/src/icloud/icloud.service.ts`, `backend/src/icloud/icloud.module.ts`

**Interfaces:**
- Consumes: `tsdav` (`DAVClient`), хелперы из Task 2.
- Produces:
  ```ts
  interface ReminderItem { id: number; title: string; status: string; dueDate: string | null; scheduledDate: string | null; scheduledTime: string | null; priority: boolean; }
  class ICloudService {
    syncReminder(item: ReminderItem, due: EffectiveDue): Promise<void>
    completeReminder(id: number, item: ReminderItem, due: EffectiveDue): Promise<void>
    removeReminder(id: number): Promise<void>
    syncAllOnStartup(items: ReminderItem[]): Promise<void>  // сам вычисляет effectiveDue по каждому и пропускает те, где null
  }
  ```

- [ ] **Step 1: Реализовать `ICloudService`**

Create `backend/src/icloud/icloud.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { DAVClient } from 'tsdav';
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
  private client: DAVClient | null = null;
  private remindersCalendar: { url: string } | null = null;

  private credentials(): { username: string; password: string } | null {
    const username = process.env.ICLOUD_APPLE_ID;
    const password = process.env.ICLOUD_APP_PASSWORD;
    return username && password ? { username, password } : null;
  }

  private async getRemindersCalendar(): Promise<{ url: string } | null> {
    const creds = this.credentials();
    if (!creds) return null;
    if (this.remindersCalendar) return this.remindersCalendar;
    try {
      if (!this.client) {
        this.client = new DAVClient({
          serverUrl: 'https://caldav.icloud.com',
          credentials: creds,
          authMethod: 'Basic',
          defaultAccountType: 'caldav',
        });
        await this.client.login();
      }
      const listName = process.env.ICLOUD_REMINDERS_LIST_NAME || 'GTD';
      const calendars = await this.client.fetchCalendars();
      const found = calendars.find((c: any) => c.displayName === listName) as { url: string } | undefined;
      if (!found) {
        this.logger.warn(`iCloud reminders list "${listName}" not found`);
        return null;
      }
      this.remindersCalendar = found;
      return found;
    } catch (e) {
      this.logger.warn(`iCloud calendar discovery failed: ${e}`);
      return null;
    }
  }

  private async upsert(filename: string, iCalString: string): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    if (!calendar || !this.client) return;
    const url = `${calendar.url}${filename}`;
    await this.client.deleteCalendarObject({ calendarObject: { url } } as any).catch(() => undefined);
    await this.client.createCalendarObject({ calendar, filename, iCalString } as any);
  }

  async syncReminder(item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.credentials()) return;
    try {
      const uid = reminderUid(item.id);
      const ics = buildReminderIcs({ uid, title: item.title, due, priority: item.priority, completed: false });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud syncReminder(${item.id}) failed: ${e}`);
    }
  }

  async completeReminder(id: number, item: ReminderItem, due: EffectiveDue): Promise<void> {
    if (!this.credentials()) return;
    try {
      const uid = reminderUid(id);
      const ics = buildReminderIcs({ uid, title: item.title, due, priority: item.priority, completed: true });
      await this.upsert(`${uid}.ics`, ics);
    } catch (e) {
      this.logger.warn(`iCloud completeReminder(${id}) failed: ${e}`);
    }
  }

  async removeReminder(id: number): Promise<void> {
    const calendar = await this.getRemindersCalendar();
    if (!calendar || !this.client) return;
    try {
      const url = `${calendar.url}${reminderUid(id)}.ics`;
      await this.client.deleteCalendarObject({ calendarObject: { url } } as any);
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

**Важно:** `tsdav`'s точные названия методов/параметров (`fetchCalendars`, `createCalendarObject`, `deleteCalendarObject`, поля `displayName`/`url`) нужно свериться с типами из `node_modules/tsdav` после установки (Task 1). Если сигнатуры отличаются от использованных выше — адаптировать код, сохранив то же поведение (login → найти календарь по `displayName` → создать/удалить объект по предсказуемому имени файла), а не менять архитектуру.

- [ ] **Step 2: Модуль**

Create `backend/src/icloud/icloud.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ICloudService } from './icloud.service';

@Module({
  providers: [ICloudService],
  exports: [ICloudService],
})
export class ICloudModule {}
```

- [ ] **Step 3: Сборка**

Run (из `backend/`): `bun run build`
Expected: чисто. Если падает из-за `tsdav` (ESM/CJS) — не обходить хаком, сообщить BLOCKED с точным текстом ошибки для пересмотра выбора библиотеки.

- [ ] **Step 4: Живая smoke-проверка (обязательно, не пропускать)**

В `backend/` временно создать одноразовый скрипт (не коммитить) `smoke-icloud.ts`:
```ts
import 'dotenv/config';
import { ICloudService } from './src/icloud/icloud.service';

async function main() {
  const svc = new ICloudService();
  const testItem = {
    id: 999999,
    title: '__smoke test__',
    status: 'backlog',
    dueDate: '2026-08-01',
    scheduledDate: null,
    scheduledTime: null,
    priority: false,
  };
  await svc.syncReminder(testItem, { date: '2026-08-01', time: null });
  console.log('syncReminder called — check Reminders.app list "GTD" for "__smoke test__"');
}
main();
```
Run: `cd backend && ICLOUD_APPLE_ID=<из .env> ICLOUD_APP_PASSWORD=<из .env> bunx tsx smoke-icloud.ts` (или `bun run smoke-icloud.ts`, если `bun` может выполнить TS напрямую — предпочтительно, без доп. зависимостей).
Ожидаемо: в списке «GTD» в Reminders.app (или на icloud.com/reminders) появляется «__smoke test__» со сроком 01.08.2026.
Затем вручную вызвать `removeReminder(999999)` тем же способом (второй запуск скрипта с другим содержимым) и убедиться, что пункт исчез.
**Удалить `smoke-icloud.ts` после проверки** (не должен попасть в коммит).

Если объект не появляется — проверить (в таком порядке): правильно ли называется список в Reminders (должен точно совпадать, включая регистр, с `ICLOUD_REMINDERS_LIST_NAME`/дефолтом `GTD`), верны ли `ICLOUD_APPLE_ID`/`ICLOUD_APP_PASSWORD`, не протухла или отозвана ли пароль-фраза приложения. Сообщить BLOCKED с подробностями, если не заводится после проверки этих трёх пунктов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/icloud/icloud.service.ts backend/src/icloud/icloud.module.ts
git commit -m "feat(backend): ICloudService — CalDAV sync to iCloud Reminders (env-gated, graceful)"
```

---

### Task 4: Интеграция в `GtdService` + старт-синк

**Files:**
- Modify: `backend/src/gtd/gtd.service.ts`, `backend/src/gtd/gtd.module.ts`, `backend/src/main.ts`
- Modify: `backend/src/gtd/gtd.service.spec.ts`

**Interfaces:**
- Consumes: `ICloudService` (Task 3), `effectiveDue` (Task 2).

- [ ] **Step 1: Обновить существующие тесты `GtdService` под новый конструктор**

`GtdService` получает третий аргумент `icloud`. Во всех местах `backend/src/gtd/gtd.service.spec.ts`, где сейчас `new GtdService(prisma, obsidian)`, добавить мок и третий аргумент:
```ts
const icloud = {
  syncReminder: jest.fn(),
  completeReminder: jest.fn(),
  removeReminder: jest.fn(),
  syncAllOnStartup: jest.fn(),
};
service = new GtdService(prisma, obsidian, icloud as any);
```
(Заменить каждое существующее `new GtdService(prisma, obsidian)` на `new GtdService(prisma, obsidian, icloud as any)`, добавив объявление `icloud` в соответствующий `beforeEach`.)

Добавить новый `describe` в конец файла:
```ts
describe('GtdService reminders (effectiveDue-driven)', () => {
  let service: GtdService;
  let prisma: any;
  let obsidian: any;
  let icloud: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    obsidian = { syncNote: jest.fn(), removeNote: jest.fn() };
    icloud = { syncReminder: jest.fn(), completeReminder: jest.fn(), removeReminder: jest.fn() };
    service = new GtdService(prisma, obsidian, icloud as any);
  });

  function row(overrides: Partial<any> = {}) {
    return {
      id: 1, title: 'T', notes: null, status: 'inbox', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null,
      priority: false, waitingFor: null, order: 0, completedAt: null,
      ...overrides,
    };
  }

  it('syncs a reminder when a dueDate is set', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'backlog' }));
    prisma.gtdItem.update.mockResolvedValue(row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }));

    await service.update(1, { dueDate: '2026-08-01' });

    expect(icloud.syncReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, dueDate: '2026-08-01' }),
      { date: '2026-08-01', time: null },
    );
    expect(icloud.removeReminder).not.toHaveBeenCalled();
    expect(icloud.completeReminder).not.toHaveBeenCalled();
  });

  it('syncs a reminder when status becomes calendar with a scheduledDate', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'backlog' }));
    prisma.gtdItem.update.mockResolvedValue(
      row({ status: 'calendar', scheduledDate: new Date('2026-08-02T00:00:00.000Z'), scheduledTime: '10:00' }),
    );

    await service.update(1, { status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '10:00' });

    expect(icloud.syncReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: 'calendar' }),
      { date: '2026-08-02', time: '10:00' },
    );
  });

  it('completes (not removes) the reminder when a due item transitions to done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.update.mockResolvedValue(
      row({ status: 'done', dueDate: new Date('2026-08-01T00:00:00.000Z'), completedAt: new Date() }),
    );

    await service.update(1, { status: 'done' });

    expect(icloud.completeReminder).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'done' }),
      { date: '2026-08-01', time: null },
    );
    expect(icloud.removeReminder).not.toHaveBeenCalled();
    expect(icloud.syncReminder).not.toHaveBeenCalled();
  });

  it('removes the reminder when the effective due disappears (not done)', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.update.mockResolvedValue(row({ status: 'backlog', dueDate: null }));

    await service.update(1, { dueDate: null });

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
    expect(icloud.syncReminder).not.toHaveBeenCalled();
    expect(icloud.completeReminder).not.toHaveBeenCalled();
  });

  it('removes the reminder on delete when the item had an effective due date', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(
      row({ status: 'backlog', dueDate: new Date('2026-08-01T00:00:00.000Z') }),
    );
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
  });

  it('removes the reminder on delete when the item was done (had a completed reminder)', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'done' }));
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).toHaveBeenCalledWith(1);
  });

  it('does not touch icloud on delete for an item with no due and not done', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(row({ status: 'someday' }));
    prisma.gtdItem.delete.mockResolvedValue({ id: 1 });

    await service.remove(1);

    expect(icloud.removeReminder).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run (из `backend/`): `bunx jest gtd.service.spec.ts`
Expected: FAIL (конструктор трёхаргументный ещё не реализован в коде, `icloud` пока не существует как зависимость).

- [ ] **Step 3: Реализовать интеграцию**

В `backend/src/gtd/gtd.service.ts`:

Импорт:
```ts
import { ICloudService } from '../icloud/icloud.service';
import { effectiveDue } from '../icloud/icloud.helpers';
```

Конструктор:
```ts
constructor(
  private prisma: PrismaService,
  private obsidian: ObsidianService,
  private icloud: ICloudService,
) {}
```

Заменить тело `update(...)` (весь метод, начиная с `const existing = ...` и до конца) на:
```ts
async update(
  id: number,
  patch: { title?: string; notes?: string; status?: string; scheduledDate?: string | null; scheduledTime?: string | null; waitingFor?: string | null; plannedDate?: string | null; dueDate?: string | null; priority?: boolean },
): Promise<GtdItemView> {
  const existing = await this.prisma.gtdItem.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException(`GtdItem ${id} not found`);
  }

  const data: any = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.waitingFor !== undefined) data.waitingFor = patch.waitingFor;
  if (patch.scheduledDate !== undefined) {
    data.scheduledDate = patch.scheduledDate ? parseDateParam(patch.scheduledDate) : null;
  }
  if (patch.plannedDate !== undefined) {
    data.plannedDate = patch.plannedDate ? parseDateParam(patch.plannedDate) : null;
  }
  if (patch.dueDate !== undefined) {
    data.dueDate = patch.dueDate ? parseDateParam(patch.dueDate) : null;
  }
  if (patch.scheduledTime !== undefined) data.scheduledTime = patch.scheduledTime || null;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === 'done' && existing.status !== 'done') {
      data.completedAt = new Date();
    } else if (patch.status !== 'done' && existing.status === 'done') {
      data.completedAt = null;
    }
  }

  const updated = await this.prisma.gtdItem.update({ where: { id }, data });
  const existingView = this.toView(existing);
  const updatedView = this.toView(updated);

  if (updatedView.status === 'reference') {
    await this.obsidian.syncNote(updatedView);
  } else if (existingView.status === 'reference') {
    await this.obsidian.removeNote(id);
  }

  const dueBefore = effectiveDue(existingView);
  const dueAfter = effectiveDue(updatedView);

  if (updatedView.status === 'done' && dueBefore) {
    await this.icloud.completeReminder(id, updatedView, dueBefore);
  } else if (dueAfter) {
    await this.icloud.syncReminder(updatedView, dueAfter);
  } else if (dueBefore) {
    await this.icloud.removeReminder(id);
  }

  return updatedView;
}
```

Заменить тело `remove(...)` на:
```ts
async remove(id: number): Promise<{ id: number }> {
  const existing = await this.prisma.gtdItem.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException(`GtdItem ${id} not found`);
  }
  const existingView = this.toView(existing);
  if (existingView.status === 'reference') {
    await this.obsidian.removeNote(id);
  }
  if (effectiveDue(existingView) || existingView.status === 'done') {
    await this.icloud.removeReminder(id);
  }
  await this.prisma.gtdItem.delete({ where: { id } });
  return { id };
}
```

В `backend/src/gtd/gtd.module.ts` импортировать `ICloudModule`:
```ts
import { Module } from '@nestjs/common';
import { GtdController } from './gtd.controller';
import { GtdService } from './gtd.service';
import { ObsidianModule } from '../obsidian/obsidian.module';
import { ICloudModule } from '../icloud/icloud.module';

@Module({
  imports: [ObsidianModule, ICloudModule],
  controllers: [GtdController],
  providers: [GtdService],
  exports: [GtdService],
})
export class GtdModule {}
```

- [ ] **Step 4: Запустить — проходит**

Run (из `backend/`): `bunx jest gtd.service.spec.ts` → PASS (все describe, включая новый).
Run (из `backend/`): `bunx jest` → весь сьют зелёный.
Run (из `backend/`): `bun run build` → чисто.

- [ ] **Step 5: Bulk-синк на старте в `main.ts`**

В `backend/src/main.ts` добавить импорт:
```ts
import { ICloudService } from './icloud/icloud.service';
```

Рядом с существующим Obsidian-блоком (внутри того же `try`, после `obsidian.syncAllReference(...)`, либо отдельным блоком сразу после — оба варианта ок, важно не прервать процесс при ошибке):
```ts
  try {
    const gtd = app.get(GtdService);
    const obsidian = app.get(ObsidianService);
    await obsidian.syncAllReference(await gtd.getItems('reference'));

    const icloud = app.get(ICloudService);
    await icloud.syncAllOnStartup(await gtd.getItems());
  } catch (e) {
    // startup export/sync is best-effort; never block boot
    console.warn('Startup sync skipped:', e);
  }
```
(`gtd.getItems()` без аргумента уже возвращает все активные пункты, кроме `done`/`archived` — `syncAllOnStartup` сам отфильтрует по `effectiveDue`.)

- [ ] **Step 6: Сборка + полный прогон**

Run (из `backend/`): `bun run build` → чисто; `bunx jest` → весь сьют зелёный.

- [ ] **Step 7: Живая проверка end-to-end (обязательно)**

Пересобрать стек (`docker compose up -d --build`), затем через реальный API (`curl` или UI):
- Создать тестовый GTD-пункт, поставить ему `dueDate` → в списке «GTD» в Reminders.app появляется соответствующее напоминание с этим сроком.
- Отметить пункт `done` → напоминание в Reminders помечается выполненным, **не исчезает**.
- Снять `dueDate` у ещё-не-done пункта → напоминание удаляется.
- Перевести пункт в статус `calendar` с `scheduledDate`/`scheduledTime` (без `dueDate`) → напоминание появляется с этой датой/временем.
- Удалить тестовый пункт полностью, убедиться, что связанное напоминание (если было) тоже удалено.
- Перезапустить backend-контейнер, убедиться, что существующие активные пункты с эффективной датой заново появляются/остаются в списке «GTD» (bulk-синк на старте).

- [ ] **Step 8: Коммит**

```bash
git add backend/src/gtd backend/src/main.ts
git commit -m "feat(backend): sync GTD reminders (effectiveDue) into iCloud on change + startup"
```

---

## Self-Review

**Spec coverage:**
- `tsdav` зависимость, env-переменные, docker-compose, README → Task 1. ✅
- `effectiveDue` (приоритет `dueDate` над `scheduledDate`, null-случаи), `reminderUid`, `buildReminderIcs` (дата/дата+время/completed/priority/экранирование) → Task 2. ✅
- `ICloudService`: env-gated, graceful, delete-then-recreate (без ETag), обнаружение списка по имени, `syncReminder`/`completeReminder`/`removeReminder`/`syncAllOnStartup` → Task 3. ✅
- Интеграция в `GtdService.update`/`remove` (done→complete не remove, исчезновение даты→remove, calendar-статус тоже триггерит) + `GtdModule` + bulk-синк на старте → Task 4. ✅
- Без автоматического Calendar/VEVENT-синка — нигде не реализуется. ✅
- Вне объёма (двусторонняя синхронизация, программное создание списка, UI-индикация) — не трогается. ✅

**Placeholder scan:** конкретный код/команды в каждом шаге; единственное сознательное «не на 100% гарантированное» — точные имена методов `tsdav`, explicitly помечено как «сверить после установки» с инструкцией, что делать при расхождении — не заглушка, а честная пометка риска внешней библиотеки.

**Type consistency:** `ReminderItem`/`EffectiveDue` согласованы между `icloud.helpers.ts` (Task 2), `icloud.service.ts` (Task 3) и вызовами из `gtd.service.ts` (Task 4) — везде одинаковый набор полей (`id, title, status, dueDate, scheduledDate, scheduledTime, priority`). `GtdService` трёхаргументный конструктор обновлён и в коде, и во всех тестовых конструкторах (Task 4 Step 1).
