# GTD: семантика бакетов и принудительный разбор — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать разницу между «Бэклог недели» и «Потом» проверяемым фактом и заставить систему требовать решений по залежавшимся и просроченным задачам.

**Architecture:** Два новых поля на `GtdItem` (`decidedAt`, `deferCount`), проставляемые бэкендом в существующем `GtdService.update()`. Вся логика «протухло / просрочено / пора эскалировать» — чистые функции в `frontend/lib/gtd.ts`, покрытые тестами. UI-изменения точечные: переименование лейблов, бейджи в строке, очередь просроченных в `InboxProcessor`, разбор протухших в `WeeklyReview`.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + CSS Modules (frontend), Bun как рантайм и пакетный менеджер, Jest для тестов, Postgres в Docker.

**Спека:** `docs/superpowers/specs/2026-08-12-gtd-bucket-semantics-design.md`

## Global Constraints

- Пакетный менеджер и рантайм — **Bun** (`bun install`, `bun run`, `bunx`), не npm/yarn/pnpm.
- Enum `GtdStatus` в базе **не меняется**. Переименования только в подписях UI.
- Никаких новых цветов: только существующие CSS-токены из `frontend/app/globals.css` и существующие классы CSS-модулей.
- Никаких новых HTTP-эндпоинтов: всё через существующий `PATCH /gtd/:id`.
- Порог протухания — **7 дней**. Порог эскалации — **`deferCount >= 3`**.
- Неделя, даты и «сегодня» на фронте — только через `todayLocal()` из `frontend/lib/date.ts`.
- Все сообщения UI — на русском, тон существующего интерфейса.
- Коммит после каждой задачи. Без trailer'ов об AI-авторстве.

---

### Task 1: Backend — поля `decidedAt` и `deferCount`

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `GtdItem`)
- Create: `backend/prisma/migrations/<timestamp>_add_gtd_decided_at_defer_count/migration.sql` (генерируется Prisma, затем дополняется вручную)
- Modify: `backend/src/gtd/gtd.service.ts` (интерфейс `GtdItemView`, метод `toView`, метод `update`)
- Test: `backend/src/gtd/gtd.service.spec.ts` (новый `describe` в конце файла)

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces: `GtdItemView.decidedAt: string | null` (ISO-строка), `GtdItemView.deferCount: number`. Приходят в каждом ответе `GET /gtd` и `PATCH /gtd/:id`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/gtd/gtd.service.spec.ts`:

```ts
describe('GtdService.update — decidedAt и deferCount', () => {
  let service: GtdService;
  let prisma: any;

  function existing(over: any = {}) {
    return {
      id: 1, title: 'Прибраться в квартире', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: 0, completedAt: null,
      decidedAt: new Date('2026-07-20T10:00:00Z'), deferCount: 0, ...over,
    };
  }

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    const icloud = {
      syncReminder: jest.fn(), completeReminder: jest.fn(),
      removeReminder: jest.fn(), syncAllOnStartup: jest.fn(),
    };
    service = new GtdService(prisma, obsidian as any, icloud as any);
  });

  it('ставит decidedAt, когда в патче есть status', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'inbox' }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog' }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.decidedAt).toBeInstanceOf(Date);
  });

  it('не трогает decidedAt и deferCount при правке заголовка', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(existing({ title: 'Новое' }));

    await service.update(1, { title: 'Новое' });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.decidedAt).toBeUndefined();
    expect(data.deferCount).toBeUndefined();
  });

  it('инкрементирует deferCount при повторном обещании backlog → backlog', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'backlog', deferCount: 2 }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog', deferCount: 3 }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.deferCount).toBe(3);
  });

  it('не инкрементирует deferCount при переходе someday → backlog', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing({ status: 'someday', deferCount: 2 }));
    prisma.gtdItem.update.mockResolvedValue(existing({ status: 'backlog', deferCount: 2 }));

    await service.update(1, { status: 'backlog' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.deferCount).toBeUndefined();
  });

  it('отдаёт decidedAt строкой ISO и deferCount числом', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(
      existing({ deferCount: 3, decidedAt: new Date('2026-08-01T09:00:00Z') }),
    );

    const view = await service.update(1, { title: 'x' });

    expect(view.decidedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(view.deferCount).toBe(3);
  });

  it('отдаёт decidedAt как null, когда поле пустое', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue(existing());
    prisma.gtdItem.update.mockResolvedValue(existing({ decidedAt: null }));

    const view = await service.update(1, { title: 'x' });

    expect(view.decidedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest gtd.service.spec.ts -t "decidedAt"`
Expected: FAIL — `data.decidedAt` равен `undefined`, `view.decidedAt` отсутствует в объекте.

- [ ] **Step 3: Добавить поля в схему**

В `backend/prisma/schema.prisma`, в модель `GtdItem`, сразу после строки `completedAt   DateTime?`:

```prisma
  decidedAt     DateTime?
  deferCount    Int       @default(0)
```

- [ ] **Step 4: Сгенерировать миграцию**

Run: `cd backend && bunx prisma migrate dev --name add_gtd_decided_at_defer_count`
Expected: создаётся каталог `backend/prisma/migrations/<timestamp>_add_gtd_decided_at_defer_count/` с `migration.sql`, клиент Prisma перегенерирован.

- [ ] **Step 5: Дописать бэкфилл в миграцию**

Открыть свежесозданный `migration.sql` и добавить последней строкой:

```sql
UPDATE "GtdItem" SET "decidedAt" = "createdAt" WHERE "decidedAt" IS NULL;
```

Затем применить её заново к уже накатанной базе (Prisma выполнила файл до правки, поэтому бэкфилл надо выполнить руками один раз):

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c 'UPDATE "GtdItem" SET "decidedAt" = "createdAt" WHERE "decidedAt" IS NULL;'`
Expected: `UPDATE 62` (число строк может отличаться).

- [ ] **Step 6: Расширить `GtdItemView` и `toView`**

В `backend/src/gtd/gtd.service.ts`, в интерфейс `GtdItemView` после `completedAt: string | null;`:

```ts
  decidedAt: string | null;
  deferCount: number;
```

В методе `toView`, после строки `completedAt: item.completedAt ? item.completedAt.toISOString() : null,`:

```ts
      decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
      deferCount: item.deferCount,
```

- [ ] **Step 7: Проставлять поля в `update`**

В `backend/src/gtd/gtd.service.ts` заменить блок `if (patch.status !== undefined) { ... }` целиком на:

```ts
    if (patch.status !== undefined) {
      data.status = patch.status;
      // Любое решение о судьбе задачи продлевает ей жизнь — даже если статус тот же.
      // Кнопка «Беру» в разборе шлёт backlog → backlog и попадает сюда.
      data.decidedAt = new Date();
      if (patch.status === 'backlog' && existing.status === 'backlog') {
        data.deferCount = existing.deferCount + 1;
      }
      if (patch.status === 'done' && existing.status !== 'done') {
        data.completedAt = new Date();
      } else if (patch.status !== 'done' && existing.status === 'done') {
        data.completedAt = null;
      }
    }
```

- [ ] **Step 8: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest gtd.service.spec.ts`
Expected: PASS, включая все ранее существовавшие тесты файла.

- [ ] **Step 9: Коммит**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/gtd/gtd.service.ts backend/src/gtd/gtd.service.spec.ts
git commit -m "feat(backend): decidedAt и deferCount у GtdItem"
```

---

### Task 2: Тип на фронте и чистые функции протухания

**Files:**
- Modify: `frontend/types/api.ts:94-110` (интерфейс `GtdItem`)
- Modify: `frontend/lib/gtd.ts` (новые экспорты в конец файла)
- Test: `frontend/lib/gtd.spec.ts`

**Interfaces:**
- Consumes: `GtdItemView.decidedAt`, `GtdItemView.deferCount` из Task 1.
- Produces:
  - `lastDecisionDate(item: GtdItem): string | null`
  - `staleDays(item: GtdItem, today: string): number`
  - `isStale(item: GtdItem, today: string): boolean`
  - `isOverdue(item: GtdItem, today: string): boolean`
  - `needsEscalation(item: GtdItem): boolean`
  - `staleItems(items: GtdItem[], today: string): GtdItem[]`
  - `overdueItems(items: GtdItem[], today: string): GtdItem[]`

- [ ] **Step 1: Расширить тип `GtdItem`**

В `frontend/types/api.ts`, в интерфейс `GtdItem` после `completedAt: string | null;`:

```ts
  decidedAt: string | null;
  deferCount: number;
```

Это сломает компиляцию существующих фабрик в `frontend/lib/gtd.spec.ts` — они чинятся в Step 2.

- [ ] **Step 2: Написать падающие тесты**

В `frontend/lib/gtd.spec.ts` добавить `decidedAt: null, deferCount: 0,` в объекты, возвращаемые тремя существующими фабриками (`item`, `it2`, `step`) — перед строкой с `...over` там, где она есть. Затем добавить в конец файла:

```ts
import {
  lastDecisionDate, staleDays, isStale, isOverdue, needsEscalation, staleItems, overdueItems,
} from './gtd';

describe('протухание и просрочка', () => {
  function task(over: Partial<GtdItem>): GtdItem {
    return {
      id: over.id ?? 1, title: over.title ?? 'задача', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: 0, completedAt: null,
      decidedAt: null, deferCount: 0, ...over,
    };
  }

  describe('lastDecisionDate', () => {
    it('возвращает null, когда нет ни decidedAt, ни plannedDate', () => {
      expect(lastDecisionDate(task({}))).toBeNull();
    });

    it('берёт дневную часть decidedAt', () => {
      expect(lastDecisionDate(task({ decidedAt: '2026-07-24T22:15:00.000Z' }))).toBe('2026-07-24');
    });

    it('свежий plannedDate перевешивает старый decidedAt', () => {
      const t = task({ decidedAt: '2026-07-24T10:00:00.000Z', plannedDate: '2026-08-08' });
      expect(lastDecisionDate(t)).toBe('2026-08-08');
    });

    it('старый plannedDate не перевешивает свежий decidedAt', () => {
      const t = task({ decidedAt: '2026-08-10T10:00:00.000Z', plannedDate: '2026-07-20' });
      expect(lastDecisionDate(t)).toBe('2026-08-10');
    });
  });

  describe('staleDays', () => {
    it('считает дни от последнего решения до сегодня', () => {
      expect(staleDays(task({ decidedAt: '2026-08-05T10:00:00.000Z' }), '2026-08-12')).toBe(7);
    });

    it('возвращает Infinity, когда решения не было вовсе', () => {
      expect(staleDays(task({}), '2026-08-12')).toBe(Infinity);
    });
  });

  describe('isStale', () => {
    it('ровно 7 дней — протухла', () => {
      expect(isStale(task({ decidedAt: '2026-08-05T10:00:00.000Z' }), '2026-08-12')).toBe(true);
    });

    it('6 дней — ещё нет', () => {
      expect(isStale(task({ decidedAt: '2026-08-06T10:00:00.000Z' }), '2026-08-12')).toBe(false);
    });

    it('свежий plannedDate спасает старую decidedAt', () => {
      const t = task({ decidedAt: '2026-07-19T10:00:00.000Z', plannedDate: '2026-08-08' });
      expect(isStale(t, '2026-08-12')).toBe(false);
    });

    it('не backlog — никогда не протухает', () => {
      const t = task({ status: 'someday', decidedAt: '2026-07-01T10:00:00.000Z' });
      expect(isStale(t, '2026-08-12')).toBe(false);
    });
  });

  describe('isOverdue', () => {
    it('вчерашняя дата в календаре — просрочка', () => {
      const t = task({ status: 'calendar', scheduledDate: '2026-08-11' });
      expect(isOverdue(t, '2026-08-12')).toBe(true);
    });

    it('сегодняшняя дата — не просрочка', () => {
      const t = task({ status: 'calendar', scheduledDate: '2026-08-12' });
      expect(isOverdue(t, '2026-08-12')).toBe(false);
    });

    it('дата у задачи не из календаря игнорируется', () => {
      const t = task({ status: 'backlog', scheduledDate: '2026-07-27' });
      expect(isOverdue(t, '2026-08-12')).toBe(false);
    });
  });

  describe('needsEscalation', () => {
    it('два откладывания — рано', () => {
      expect(needsEscalation(task({ deferCount: 2 }))).toBe(false);
    });

    it('три откладывания — пора', () => {
      expect(needsEscalation(task({ deferCount: 3 }))).toBe(true);
    });
  });

  describe('staleItems и overdueItems', () => {
    it('staleItems отдаёт только протухшие, от самых старых', () => {
      const items = [
        task({ id: 1, decidedAt: '2026-08-11T10:00:00.000Z' }),
        task({ id: 2, decidedAt: '2026-07-19T10:00:00.000Z' }),
        task({ id: 3, decidedAt: '2026-07-24T10:00:00.000Z' }),
      ];
      expect(staleItems(items, '2026-08-12').map((i) => i.id)).toEqual([2, 3]);
    });

    it('overdueItems отдаёт только просроченные, от самых старых', () => {
      const items = [
        task({ id: 1, status: 'calendar', scheduledDate: '2026-08-13' }),
        task({ id: 2, status: 'calendar', scheduledDate: '2026-08-06' }),
        task({ id: 3, status: 'calendar', scheduledDate: '2026-07-25' }),
      ];
      expect(overdueItems(items, '2026-08-12').map((i) => i.id)).toEqual([3, 2]);
    });
  });
});
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd frontend && bunx jest gtd.spec.ts`
Expected: FAIL — `lastDecisionDate is not a function` и т.д.

- [ ] **Step 4: Реализовать функции**

В конец `frontend/lib/gtd.ts` добавить (импорт `parseUTC` — в шапку файла: `import { parseUTC } from './date';`):

```ts
export const STALE_AFTER_DAYS = 7;
export const ESCALATE_AFTER_DEFERS = 3;

/** Дата последнего решения о судьбе задачи: явное решение либо вытягивание в «сегодня». */
export function lastDecisionDate(item: GtdItem): string | null {
  const decided = item.decidedAt ? item.decidedAt.slice(0, 10) : null;
  const planned = item.plannedDate;
  if (!decided) return planned;
  if (!planned) return decided;
  return decided > planned ? decided : planned;
}

export function staleDays(item: GtdItem, today: string): number {
  const last = lastDecisionDate(item);
  if (!last) return Infinity;
  const ms = parseUTC(today).getTime() - parseUTC(last).getTime();
  return Math.floor(ms / 86_400_000);
}

export function isStale(item: GtdItem, today: string): boolean {
  if (item.status !== 'backlog') return false;
  return staleDays(item, today) >= STALE_AFTER_DAYS;
}

export function isOverdue(item: GtdItem, today: string): boolean {
  return item.status === 'calendar' && !!item.scheduledDate && item.scheduledDate < today;
}

export function needsEscalation(item: GtdItem): boolean {
  return item.deferCount >= ESCALATE_AFTER_DEFERS;
}

export function staleItems(items: GtdItem[], today: string): GtdItem[] {
  return items
    .filter((i) => isStale(i, today))
    .sort((a, b) => staleDays(b, today) - staleDays(a, today));
}

export function overdueItems(items: GtdItem[], today: string): GtdItem[] {
  return items
    .filter((i) => isOverdue(i, today))
    .sort((a, b) => (a.scheduledDate! < b.scheduledDate! ? -1 : 1));
}
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `cd frontend && bunx jest gtd.spec.ts`
Expected: PASS, включая все ранее существовавшие тесты файла.

- [ ] **Step 6: Коммит**

```bash
git add frontend/types/api.ts frontend/lib/gtd.ts frontend/lib/gtd.spec.ts
git commit -m "feat(frontend): чистые функции протухания и просрочки задач"
```

---

### Task 3: Поиск похожих задач

**Files:**
- Modify: `frontend/lib/gtd.ts` (новый экспорт в конец файла)
- Test: `frontend/lib/gtd.spec.ts`

**Interfaces:**
- Consumes: тип `GtdItem` с полями из Task 2.
- Produces: `findSimilar(title: string, items: GtdItem[], limit?: number): GtdItem[]` — по умолчанию `limit = 3`.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `frontend/lib/gtd.spec.ts` (импорт `findSimilar` дописать к существующему импорту из `./gtd`):

```ts
describe('findSimilar', () => {
  function named(id: number, title: string, status: GtdItem['status'] = 'backlog'): GtdItem {
    return {
      id, title, notes: null, status, parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: id, completedAt: null,
      decidedAt: null, deferCount: 0,
    };
  }

  const items = [
    named(1, 'прибраться в квартире', 'calendar'),
    named(2, 'закончить уборку в квартире'),
    named(3, 'Сходить в качалку'),
    named(4, 'Прибраться в квартире', 'archived'),
  ];

  it('находит совпадение независимо от регистра и словоформы вокруг общего слова', () => {
    const found = findSimilar('Прибраться в квартире', items);
    expect(found.map((i) => i.id).sort()).toEqual([1, 2]);
  });

  it('не находит ничего для несвязанного текста', () => {
    expect(findSimilar('оформить гошное резюме', items)).toEqual([]);
  });

  it('исключает архивные и выполненные', () => {
    const found = findSimilar('прибраться в квартире', items);
    expect(found.map((i) => i.id)).not.toContain(4);
  });

  it('игнорирует короткие слова', () => {
    expect(findSimilar('в на из', items)).toEqual([]);
  });

  it('пустая строка ничего не находит', () => {
    expect(findSimilar('   ', items)).toEqual([]);
  });

  it('уважает limit', () => {
    expect(findSimilar('квартире', items, 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd frontend && bunx jest gtd.spec.ts -t findSimilar`
Expected: FAIL — `findSimilar is not a function`.

- [ ] **Step 3: Реализовать `findSimilar`**

В конец `frontend/lib/gtd.ts`:

```ts
const SIMILAR_EXCLUDED: GtdStatus[] = ['done', 'archived'];
const MIN_WORD_LENGTH = 4;

function significantWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH);
}

/**
 * Похожие живые задачи — предупреждение при захвате, не блокировка.
 * Ложные срабатывания допустимы: показать лишнюю строку дешевле, чем прозевать дубль.
 */
export function findSimilar(title: string, items: GtdItem[], limit = 3): GtdItem[] {
  const words = significantWords(title);
  if (words.length === 0) return [];
  return items
    .filter((i) => !SIMILAR_EXCLUDED.includes(i.status))
    .filter((i) => {
      const other = significantWords(i.title);
      return words.some((w) => other.some((o) => o.startsWith(w) || w.startsWith(o)));
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `cd frontend && bunx jest gtd.spec.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add frontend/lib/gtd.ts frontend/lib/gtd.spec.ts
git commit -m "feat(frontend): поиск похожих задач для предупреждения о дублях"
```

---

### Task 4: Переименование бакетов и вопроса воронки

**Files:**
- Modify: `frontend/lib/gtd.ts:38-46` (вопрос `when`), `:65-75` (`BUCKET_TABS`)
- Modify: `frontend/components/GtdScreen.tsx:86-104` (`emptyMessage`)
- Test: `frontend/lib/gtd.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: подписи `«Разбор»`, `«Бэклог недели»`, `«Потом»` — на них опираются задачи 7 и 8.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `frontend/lib/gtd.spec.ts`:

```ts
describe('подписи бакетов и воронки', () => {
  it('бэклог называется «Бэклог недели», someday — «Потом», inbox — «Разбор»', () => {
    const label = (s: GtdItem['status']) => BUCKET_TABS.find((b) => b.status === s)?.label;
    expect(label('inbox')).toBe('Разбор');
    expect(label('backlog')).toBe('Бэклог недели');
    expect(label('someday')).toBe('Потом');
  });

  it('вопрос «когда» спрашивает про конкретный горизонт', () => {
    expect(CLARIFY['when'].prompt).toBe('Когда будешь делать?');
    const labels = CLARIFY['when'].options.map((o) => o.label);
    expect(labels).toContain('На этой неделе');
    expect(labels).toContain('Потом');
  });

  it('ветка «На этой неделе» по-прежнему ведёт к вопросу об одношаговости', () => {
    const weekly = CLARIFY['when'].options.find((o) => o.label === 'На этой неделе');
    expect(weekly?.next).toBe('single');
  });

  it('ветка «Потом» по-прежнему роутит в someday', () => {
    const later = CLARIFY['when'].options.find((o) => o.label === 'Потом');
    expect(later?.route?.status).toBe('someday');
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd frontend && bunx jest gtd.spec.ts -t "подписи"`
Expected: FAIL — `«Корзина» !== «Разбор»`.

- [ ] **Step 3: Поменять подписи**

В `frontend/lib/gtd.ts` заменить вопрос `when`:

```ts
  when: {
    key: 'when',
    prompt: 'Когда будешь делать?',
    options: [
      { label: 'На дату → Календарь', route: { status: 'calendar', needs: 'date' } },
      { label: 'На этой неделе', next: 'single' },
      { label: 'Потом', route: { status: 'someday' } },
    ],
  },
```

и в `fiveMin` заменить `{ label: 'Нет → Бэклог', route: { status: 'backlog' } }` на:

```ts
      { label: 'Нет → Бэклог недели', route: { status: 'backlog' } },
```

В `BUCKET_TABS` заменить три строки:

```ts
  { status: 'inbox', label: 'Разбор' },
  { status: 'backlog', label: 'Бэклог недели' },
  ...
  { status: 'someday', label: 'Потом' },
```

(порядок элементов массива не менять — на него опирается существующий тест `BUCKET_TABS`).

- [ ] **Step 4: Привести в порядок пустые состояния**

В `frontend/components/GtdScreen.tsx`, в `emptyMessage`:

```ts
      case 'backlog':
        return 'Бэклог недели пуст — разбери входящие или добавь задачу.';
      ...
      case 'someday':
        return 'Пока ничего не отложено на потом.';
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `cd frontend && bunx jest gtd.spec.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add frontend/lib/gtd.ts frontend/lib/gtd.spec.ts frontend/components/GtdScreen.tsx
git commit -m "feat(frontend): бакеты называют свой горизонт — «Бэклог недели» и «Потом»"
```

---

### Task 5: Бейджи протухания и просрочки в строке задачи

**Files:**
- Modify: `frontend/components/GtdItemRow.tsx:136` (вычисления), `:186-193` (рендер)
- Modify: `frontend/components/GtdItemRow.module.css` (класс `.stale`)

**Interfaces:**
- Consumes: `isStale`, `staleDays`, `isOverdue` из Task 2.
- Produces: визуальные бейджи; программных интерфейсов не добавляет.

- [ ] **Step 1: Подключить функции**

В `frontend/components/GtdItemRow.tsx` дополнить импорт из `@/lib/gtd` (если импорта из этого модуля в файле ещё нет — добавить строкой ниже импорта `formatRuDate`):

```ts
import { isOverdue as isCalendarOverdue, isStale, staleDays } from '@/lib/gtd';
```

- [ ] **Step 2: Добавить вычисления**

В `frontend/components/GtdItemRow.tsx` после строки `const isOverdue = !!item.dueDate && item.dueDate < today && item.status !== 'done';`:

```ts
  const stale = isStale(item, today);
  const calendarOverdue = isCalendarOverdue(item, today);
```

- [ ] **Step 3: Показать бейджи**

Заменить блок рендера даты календаря на подсветку просрочки и добавить два бейджа:

```tsx
      {item.status === 'calendar' && item.scheduledDate && (
        <span className={`${styles.meta} ${calendarOverdue ? styles.overdue : ''}`}>
          📅 {formatRuDate(item.scheduledDate, item.scheduledTime)}
        </span>
      )}
      {stale && <span className={styles.stale}>{staleDays(item, today)}д</span>}
      {item.deferCount > 0 && <span className={styles.stale}>отложено {item.deferCount}×</span>}
```

- [ ] **Step 4: Добавить стиль**

В `frontend/components/GtdItemRow.module.css` добавить, повторив размеры и радиус соседнего класса `.due`:

```css
.stale {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
```

- [ ] **Step 5: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит без ошибок типов.

- [ ] **Step 6: Коммит**

```bash
git add frontend/components/GtdItemRow.tsx frontend/components/GtdItemRow.module.css
git commit -m "feat(frontend): бейджи возраста и откладываний в строке задачи"
```

---

### Task 6: Предупреждение о дублях при захвате

**Files:**
- Modify: `frontend/components/InboxProcessor.tsx` (пропсы, поле захвата)
- Modify: `frontend/components/GtdScreen.tsx:148-149` (передача пропсов)
- Modify: `frontend/components/InboxProcessor.module.css` (классы `.similar`, `.similarBtn`)

**Interfaces:**
- Consumes: `findSimilar` из Task 3.
- Produces: `InboxProcessorProps` получает `allItems: GtdItem[]` и `onOpenBucket: (status: GtdStatus) => void` — обоими пользуется и Task 7.

- [ ] **Step 1: Расширить пропсы**

В `frontend/components/InboxProcessor.tsx` заменить интерфейс:

```ts
interface InboxProcessorProps {
  items: GtdItem[];
  allItems: GtdItem[];
  today: string;
  onChanged: () => void | Promise<void>;
  onOpenBucket: (status: GtdStatus) => void;
}
```

и сигнатуру компонента:

```ts
export default function InboxProcessor({ items, allItems, today, onChanged, onOpenBucket }: InboxProcessorProps) {
```

Импорты дополнить: `import type { GtdItem, GtdStatus } from '@/types/api';` и `import { CLARIFY, CLARIFY_START, findSimilar, type ClarifyOption, type ClarifyRoute } from '@/lib/gtd';`

(`today` в этой задаче не используется — он нужен Task 7, который правит тот же файл; пробрасываем сразу, чтобы не менять интерфейс дважды.)

- [ ] **Step 2: Считать похожие**

В `frontend/components/InboxProcessor.tsx` перед `return (`:

```ts
  const similar = findSimilar(title, allItems);
```

- [ ] **Step 3: Показать предупреждение**

Сразу после закрывающего `</div>` блока `styles.capture`:

```tsx
      {similar.length > 0 && (
        <div className={styles.similar}>
          Похоже, уже есть:
          {similar.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.similarBtn}
              onClick={() => onOpenBucket(s.status)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Добавить стили**

В `frontend/components/InboxProcessor.module.css`:

```css
.similar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: -4px 0 12px;
  font-size: 12px;
  color: var(--muted);
}

.similarBtn {
  background: none;
  border: 1px solid var(--accent-glow);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}
```

Если токена `--muted` в `frontend/app/globals.css` нет — использовать тот, которым покрашен `.empty` в этом же CSS-модуле.

- [ ] **Step 5: Передать пропсы**

В `frontend/components/GtdScreen.tsx` заменить строку `<InboxProcessor items={visible} onChanged={reload} />` на:

```tsx
            <InboxProcessor
              items={visible}
              allItems={items}
              today={todayLocal()}
              onChanged={reload}
              onOpenBucket={setActive}
            />
```

- [ ] **Step 6: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 7: Коммит**

```bash
git add frontend/components/InboxProcessor.tsx frontend/components/InboxProcessor.module.css frontend/components/GtdScreen.tsx
git commit -m "feat(frontend): предупреждение о похожих задачах при захвате"
```

---

### Task 7: Ежедневный разбор просроченных

**Files:**
- Modify: `frontend/components/InboxProcessor.tsx` (новый блок после списка входящих)
- Modify: `frontend/components/InboxProcessor.module.css` (классы `.overdueBlock`, `.overdueTitle`)

**Interfaces:**
- Consumes: `overdueItems` из Task 2; пропсы `allItems`, `today` из Task 6; существующий `DatePicker`.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Подключить функцию и состояние**

В `frontend/components/InboxProcessor.tsx` дополнить импорт из `@/lib/gtd` функцией `overdueItems`. В теле компонента, рядом с существующими `useState`:

```ts
  // id просроченной задачи, для которой открыт выбор новой даты
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
```

и перед `return (`:

```ts
  const overdue = overdueItems(allItems, today);
```

- [ ] **Step 2: Добавить обработчики**

Рядом с существующими функциями компонента:

```ts
  async function resolveOverdue(item: GtdItem, action: 'backlog' | 'archive') {
    await updateGtdItem(
      item.id,
      action === 'backlog'
        ? { status: 'backlog', scheduledDate: null, scheduledTime: null }
        : { status: 'archived' },
    );
    await onChanged();
  }

  async function confirmReschedule(item: GtdItem) {
    if (!rescheduleValue) return;
    await updateGtdItem(item.id, { status: 'calendar', scheduledDate: rescheduleValue });
    setRescheduleId(null);
    setRescheduleValue('');
    await onChanged();
  }
```

Перевод в бэклог обязательно чистит `scheduledDate` и `scheduledTime` — иначе в базе останется мусорная дата, как сейчас у «закончить уборку в квартире», и iCloud-напоминание не удалится.

- [ ] **Step 3: Отрисовать блок**

Сразу после закрывающего `</ul>` списка входящих, внутри корневого `<div className={styles.wrap}>`:

```tsx
      {items.length === 0 && overdue.length > 0 && (
        <div className={styles.overdueBlock}>
          <div className={styles.overdueTitle}>Просроченные</div>
          {overdue.map((item) => (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemTitle}>{item.title}</div>
              <div className={styles.question}>
                Дата {formatRuDate(item.scheduledDate as string)} прошла. Что с ней?
              </div>
              <div className={styles.options}>
                <button
                  type="button"
                  className={styles.optBtn}
                  onClick={() => setRescheduleId(rescheduleId === item.id ? null : item.id)}
                >
                  Новая дата
                </button>
                <button type="button" className={styles.optBtn} onClick={() => resolveOverdue(item, 'backlog')}>
                  В бэклог недели
                </button>
                <button type="button" className={styles.optBtn} onClick={() => resolveOverdue(item, 'archive')}>
                  Архив
                </button>
              </div>
              {rescheduleId === item.id && (
                <div className={styles.datePick}>
                  <DatePicker
                    value={rescheduleValue || null}
                    onChange={(v) => setRescheduleValue(v ?? '')}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={!rescheduleValue}
                    onClick={() => confirmReschedule(item)}
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
```

Импорт `formatRuDate` добавить в шапку файла: `import { formatRuDate } from '@/lib/date';`

- [ ] **Step 4: Добавить стили**

В `frontend/components/InboxProcessor.module.css`:

```css
.overdueBlock {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overdueTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}
```

- [ ] **Step 5: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 6: Коммит**

```bash
git add frontend/components/InboxProcessor.tsx frontend/components/InboxProcessor.module.css
git commit -m "feat(frontend): ежедневный разбор просроченных задач календаря"
```

---

### Task 8: Разбор протухших и эскалация в воскресном обзоре

**Files:**
- Modify: `frontend/components/WeeklyReview.tsx` (пропсы, шаг «Бэклог недели»)
- Modify: `frontend/components/WeeklyReview.module.css` (классы `.queue`, `.queueTitle`, `.count`)
- Modify: `frontend/components/GtdScreen.tsx:132-140` (передача пропсов)

**Interfaces:**
- Consumes: `staleItems`, `staleDays`, `needsEscalation` из Task 2.
- Produces: `WeeklyReviewProps` получает `items: GtdItem[]`, `today: string`, `onChanged: () => void | Promise<void>`.

- [ ] **Step 1: Расширить пропсы**

В `frontend/components/WeeklyReview.tsx` заменить интерфейс и сигнатуру:

```ts
interface WeeklyReviewProps {
  items: GtdItem[];
  today: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onGoToBucket: (status: ReviewBucket) => void;
}

export default function WeeklyReview({ items, today, onClose, onChanged, onGoToBucket }: WeeklyReviewProps) {
```

Импорты в шапку файла:

```ts
import type { GtdItem } from '@/types/api';
import { updateGtdItem } from '@/lib/api';
import { needsEscalation, staleDays, staleItems } from '@/lib/gtd';
import DatePicker from './DatePicker';
```

- [ ] **Step 2: Обновить подписи шагов**

Заменить `STEPS`:

```ts
const STEPS: ReviewStep[] = [
  { key: 'inbox', title: 'Разбор', guidance: 'Обнули: разбери все входящие до нуля.' },
  { key: 'backlog', title: 'Бэклог недели', guidance: 'Что берёшь на эту неделю, а что уже не актуально?' },
  { key: 'project', title: 'Проекты', guidance: 'У каждого проекта есть следующий шаг?' },
  { key: 'waiting', title: 'Ожидание', guidance: 'Не завис ли кто? Напомни, если нужно.' },
  { key: 'someday', title: 'Потом', guidance: 'Поднять что-то в Бэклог недели?' },
];
```

- [ ] **Step 3: Добавить состояние и обработчики**

В теле компонента, рядом с `const [done, setDone] = useState(...)`:

```ts
  const [dateForId, setDateForId] = useState<number | null>(null);
  const [dateValue, setDateValue] = useState('');

  const stale = staleItems(items, today);

  async function decide(id: number, patch: Parameters<typeof updateGtdItem>[1]) {
    await updateGtdItem(id, patch);
    setDateForId(null);
    setDateValue('');
    await onChanged();
  }
```

- [ ] **Step 4: Отрисовать очередь протухших**

Внутри `STEPS.map`, сразу после закрывающего `</button>` кнопки «Открыть», обернув её и очередь в фрагмент — то есть заменить тело `<li>` так, чтобы после кнопки шло:

```tsx
                {step.key === 'backlog' && stale.length > 0 && (
                  <div className={styles.queue}>
                    <div className={styles.queueTitle}>протухло: {stale.length}</div>
                    {stale.map((item) => (
                      <div key={item.id} className={styles.queueItem}>
                        <div className={styles.queueName}>
                          {item.title} — лежит {staleDays(item, today)} дн.
                        </div>
                        {needsEscalation(item) ? (
                          <>
                            <div className={styles.queueQuestion}>
                              Откладываешь {item.deferCount + 1}-й раз. Это слишком крупно или ты этого не сделаешь?
                            </div>
                            <div className={styles.queueActions}>
                              <button type="button" className={styles.queueBtn} onClick={() => decide(item.id, { status: 'project' })}>
                                Разбить на проект
                              </button>
                              <button type="button" className={styles.queueBtn} onClick={() => decide(item.id, { status: 'archived' })}>
                                В архив
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className={styles.queueActions}>
                            <button type="button" className={styles.queueBtn} onClick={() => decide(item.id, { status: 'backlog' })}>
                              Беру
                            </button>
                            <button type="button" className={styles.queueBtn} onClick={() => decide(item.id, { status: 'someday' })}>
                              Потом
                            </button>
                            <button type="button" className={styles.queueBtn} onClick={() => decide(item.id, { status: 'archived' })}>
                              Архив
                            </button>
                            <button
                              type="button"
                              className={styles.queueBtn}
                              onClick={() => setDateForId(dateForId === item.id ? null : item.id)}
                            >
                              На дату
                            </button>
                          </div>
                        )}
                        {dateForId === item.id && (
                          <div className={styles.queueActions}>
                            <DatePicker value={dateValue || null} onChange={(v) => setDateValue(v ?? '')} />
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={!dateValue}
                              onClick={() => decide(item.id, { status: 'calendar', scheduledDate: dateValue })}
                            >
                              OK
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
```

Вариант «Делегировать» на эскалации не добавляем: он требует ввода имени и своего состояния, а из обзора задачу всегда можно открыть в бакете и делегировать там существующим меню строки.

- [ ] **Step 5: Добавить стили**

В `frontend/components/WeeklyReview.module.css`:

```css
.queue {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.queueTitle {
  font-size: 12px;
  color: var(--accent);
}

.queueItem {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--accent-glow);
  border-radius: 8px;
}

.queueName {
  font-size: 13px;
}

.queueQuestion {
  font-size: 12px;
  opacity: 0.8;
}

.queueActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.queueBtn {
  background: none;
  border: 1px solid var(--accent-glow);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
}
```

Если `.step` в этом модуле — не flex-контейнер, убрать из `.queue` строку `flex-basis: 100%;`.

- [ ] **Step 6: Передать пропсы**

В `frontend/components/GtdScreen.tsx`:

```tsx
        <WeeklyReview
          items={items}
          today={todayLocal()}
          onClose={() => setReviewOpen(false)}
          onChanged={reload}
          onGoToBucket={(s) => {
            setActive(s);
            setReviewOpen(false);
          }}
        />
```

- [ ] **Step 7: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 8: Коммит**

```bash
git add frontend/components/WeeklyReview.tsx frontend/components/WeeklyReview.module.css frontend/components/GtdScreen.tsx
git commit -m "feat(frontend): воскресный обзор требует решений по протухшим задачам"
```

---

### Task 9: Прогон всех тестов и живая проверка

**Files:**
- Modify: ничего (только проверка; правки — по факту находок)

**Interfaces:**
- Consumes: всё, сделанное в задачах 1–8.
- Produces: ничего.

- [ ] **Step 1: Прогнать тесты бэкенда**

Run: `cd backend && bun run test`
Expected: PASS, ни один существующий тест не сломан.

- [ ] **Step 2: Прогнать тесты фронтенда**

Run: `cd frontend && bun run test`
Expected: PASS.

- [ ] **Step 3: Поднять стек с миграцией**

```bash
docker compose up -d --build
docker compose exec backend bunx prisma migrate deploy
docker compose ps
```

Expected: все четыре сервиса `Up`, postgres `healthy`, миграция применена.

- [ ] **Step 4: Проверить, что бэкенд отдаёт новые поля**

Run: `curl -s http://localhost:3001/gtd | head -c 400`
Expected: в JSON присутствуют `"decidedAt":"2026-..."` и `"deferCount":0`.

- [ ] **Step 5: Проверить в браузере**

Открыть `https://tracker.performance:4888`, вкладка GTD:

- вкладки называются «Разбор», «Бэклог недели», «Потом»;
- в «Бэклог недели» у задач с 19–25.07 виден бейдж возраста (`19д` и подобные);
- на вкладке «Разбор» ниже входящих виден блок «Просроченные» с задачами от 25.07, 28.07, 06.08;
- ввод «прибраться в квартире» в поле захвата показывает строку «Похоже, уже есть» с существующими задачами;
- кнопка «Разбор недели» открывает обзор, у шага «Бэклог недели» стоит счётчик протухших и очередь с кнопками.

Проверять надо именно в браузере: `Dashboard` тянет данные в `useEffect`, curl и SSR видят только оболочку «загрузка…».

- [ ] **Step 6: Проверить сквозной сценарий**

В блоке «Просроченные» нажать «В бэклог недели» у одной задачи и убедиться:

```bash
docker compose exec -T postgres psql -U tracker -d tracker -c 'select id,title,status,"scheduledDate","decidedAt","deferCount" from "GtdItem" where id = <id>;'
```

Expected: `status = backlog`, `scheduledDate = NULL`, `decidedAt` — сегодняшняя отметка времени.

Затем в воскресном обзоре нажать «Беру» на протухшей задаче и убедиться тем же запросом, что `deferCount` вырос на единицу, а `decidedAt` обновился.

- [ ] **Step 7: Коммит, если были правки**

```bash
git add -A
git commit -m "fix: правки по итогам живой проверки"
```

Если правок не потребовалось — шаг пропускается.

---

## Что осталось за рамками этого плана

- Рутины с недельной нормой — отдельная спека `docs/superpowers/specs/2026-08-12-routines-weekly-goal-design.md` и отдельный план.
- Делегирование прямо из очереди эскалации (см. пояснение в Task 8, Step 4).
- Изменение enum `GtdStatus` в базе.
