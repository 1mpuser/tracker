# GTD C.2 — дедлайн + флаг важности — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить GTD-пунктам `dueDate` (дедлайн) и `priority` (флаг важности): поля + миграция, backend update/view, чистую сортировку `sortGtdItems`, действия ⏰/❗ и бейджи (с красной просрочкой) на GTD-экране и панели «Сегодня».

**Architecture:** Два additive-поля в `GtdItem`. Backend отдаёт их через `toView`; сортировка — на фронте (чистая `lib/gtd.sortGtdItems`, TDD). UI: действия/бейджи в `GtdScreen`, бейджи (read-only) в `TodayPanel`.

**Tech Stack:** NestJS + Prisma, Next.js + React, Bun, Jest. Спека: `docs/superpowers/specs/2026-07-24-gtd-priority-deadline-design.md`.

## Global Constraints

- Рантайм — **Bun** (`bunx jest`, `bunx prisma`, `bun run build`).
- Даты — строки `YYYY-MM-DD`; входящие через `parseDateParam`; сериализация `formatDate`.
- Сервисные тесты мокают `PrismaService` напрямую.
- CSS — только токены из `app/globals.css` (`--danger`, `--danger-soft`, `--accent`, `--text-dim`, `--font-mono`, …); без хардкода цветов.
- Компоненты не юнит-тестятся — гейт `bun run build`; логика в `lib/` покрыта.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** postgres поднят (`localhost:5434`), `bun install` в обеих частях. Backend-команды из `backend/`, фронт из `frontend/`.

---

### Task 1: Backend — `dueDate` + `priority` (миграция, DTO, view, update)

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/gtd/gtd.service.ts`, `backend/src/gtd/dto/update-gtd-item.dto.ts`
- Test: `backend/src/gtd/gtd.service.spec.ts`

**Interfaces:**
- Produces: `GtdItemView` + `dueDate: string | null`, `priority: boolean`; `update` patch + `dueDate?: string | null`, `priority?: boolean`.

- [ ] **Step 1: Схема + миграция**

В `backend/prisma/schema.prisma` в модель `GtdItem` добавить:
```prisma
  dueDate  DateTime? @db.Date
  priority Boolean   @default(false)
```
Run (из `backend/`): `bunx prisma migrate dev --name add_gtd_due_priority`
Expected: additive-миграция (2 столбца) применена, клиент перегенерирован, `in sync`. При запросе на reset — STOP.

- [ ] **Step 2: Написать падающие тесты**

Добавить в конец `backend/src/gtd/gtd.service.spec.ts`:
```ts
describe('GtdService.update due/priority', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('sets dueDate via parseDateParam and priority', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: new Date('2026-07-30T00:00:00.000Z'),
      priority: true, waitingFor: null, order: 0, completedAt: null,
    });

    const result = await service.update(1, { dueDate: '2026-07-30', priority: true });

    const data = prisma.gtdItem.update.mock.calls[0][0].data;
    expect(data.dueDate).toEqual(new Date('2026-07-30T00:00:00.000Z'));
    expect(data.priority).toBe(true);
    expect(result.dueDate).toBe('2026-07-30');
    expect(result.priority).toBe(true);
  });

  it('clears dueDate on null', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { dueDate: null });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.dueDate).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить — падает**

Run (из `backend/`): `bunx jest gtd.service.spec.ts -t "due/priority"`
Expected: FAIL (поля не мапятся / не пишутся).

- [ ] **Step 4: Реализовать в `gtd.service.ts`**

В `GtdItemView` добавить (после `plannedDate`):
```ts
  dueDate: string | null;
  priority: boolean;
```
В `toView` добавить (после `plannedDate`):
```ts
      dueDate: item.dueDate ? formatDate(item.dueDate) : null,
      priority: item.priority,
```
В `update`: расширить тип `patch`:
```ts
    patch: { title?: string; notes?: string; status?: string; scheduledDate?: string | null; waitingFor?: string | null; plannedDate?: string | null; dueDate?: string | null; priority?: boolean },
```
и добавить в сборку `data` (после блока `plannedDate`):
```ts
    if (patch.dueDate !== undefined) {
      data.dueDate = patch.dueDate ? parseDateParam(patch.dueDate) : null;
    }
    if (patch.priority !== undefined) data.priority = patch.priority;
```

- [ ] **Step 5: DTO**

В `backend/src/gtd/dto/update-gtd-item.dto.ts` добавить импорт `IsBoolean` (в строку из `class-validator`) и поля:
```ts
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string | null;

  @IsOptional()
  @IsBoolean()
  priority?: boolean;
```

- [ ] **Step 6: Тесты + сборка**

Run (из `backend/`): `bunx jest gtd.service.spec.ts` → PASS; `bun run build` → чисто.

- [ ] **Step 7: Коммит**

```bash
git add backend/prisma backend/src/gtd
git commit -m "feat(backend): GtdItem dueDate + priority (migration, DTO, view, update)"
```

---

### Task 2: Frontend — типы + api + `sortGtdItems`

**Files:**
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/lib/gtd.ts`
- Test: `frontend/lib/gtd.spec.ts`

**Interfaces:**
- Produces: `GtdItem` + `dueDate: string | null`, `priority: boolean`; `updateGtdItem` Pick + `dueDate`/`priority`; `sortGtdItems(items): GtdItem[]`.

- [ ] **Step 1: Написать падающий тест `sortGtdItems`**

Добавить в `frontend/lib/gtd.spec.ts`:
```ts
import { sortGtdItems } from './gtd';

describe('sortGtdItems', () => {
  function it2(over: Partial<GtdItem>): GtdItem {
    return {
      id: over.id ?? 0, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: over.order ?? 0, completedAt: null, ...over,
    };
  }

  it('puts priority items first', () => {
    const r = sortGtdItems([it2({ id: 1, order: 0 }), it2({ id: 2, order: 1, priority: true })]);
    expect(r.map((i) => i.id)).toEqual([2, 1]);
  });

  it('sorts by nearest dueDate within same priority, no-due last', () => {
    const r = sortGtdItems([
      it2({ id: 1, order: 0, dueDate: null }),
      it2({ id: 2, order: 1, dueDate: '2026-08-01' }),
      it2({ id: 3, order: 2, dueDate: '2026-07-25' }),
    ]);
    expect(r.map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it('breaks ties by order and does not mutate input', () => {
    const input = [it2({ id: 1, order: 2 }), it2({ id: 2, order: 1 })];
    const r = sortGtdItems(input);
    expect(r.map((i) => i.id)).toEqual([2, 1]);
    expect(input.map((i) => i.id)).toEqual([1, 2]);
  });
});
```
(Если `GtdItem` не импортирован в спеке — добавить `import type { GtdItem } from '@/types/api';`.)

- [ ] **Step 2: Запустить — падает**

Run (из `frontend/`): `bunx jest gtd.spec.ts -t sortGtdItems`
Expected: FAIL — `sortGtdItems is not a function`.

- [ ] **Step 3: Типы + api + реализация**

В `frontend/types/api.ts` в `GtdItem` добавить (после `completedAt` или рядом):
```ts
  dueDate: string | null;
  priority: boolean;
```
В `frontend/lib/api.ts` расширить `updateGtdItem` Pick:
```ts
  patch: Partial<Pick<GtdItem, 'title' | 'notes' | 'status' | 'scheduledDate' | 'waitingFor' | 'plannedDate' | 'dueDate' | 'priority'>>,
```
В `frontend/lib/gtd.ts` добавить (импорт `GtdItem` там уже есть):
```ts
export function sortGtdItems(items: GtdItem[]): GtdItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.order - b.order;
  });
}
```

- [ ] **Step 4: Запустить — проходит**

Run (из `frontend/`): `bunx jest gtd.spec.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add frontend/types/api.ts frontend/lib/api.ts frontend/lib/gtd.ts frontend/lib/gtd.spec.ts
git commit -m "feat(frontend): GtdItem dueDate/priority types + sortGtdItems"
```

---

### Task 3: Frontend — действия ⏰/❗ и бейджи (GtdScreen + TodayPanel)

**Files:**
- Modify: `frontend/components/GtdScreen.tsx`, `frontend/components/GtdScreen.module.css`
- Modify: `frontend/components/TodayPanel.tsx`, `frontend/components/TodayPanel.module.css`

**Interfaces:**
- Consumes: `updateGtdItem` (`dueDate`/`priority`), `sortGtdItems`, `todayLocal`.

- [ ] **Step 1: `GtdScreen.tsx` — импорт, действия, сортировка, бейджи**

- Добавить импорт `sortGtdItems`:
```tsx
import { BUCKET_TABS, sortGtdItems } from '@/lib/gtd';
```
- Добавить обработчики (рядом с `planToday`/`unplan`):
```tsx
  async function setDue(id: number) {
    const value = window.prompt('Дедлайн (YYYY-MM-DD, пусто — снять):');
    if (value === null) return;
    await updateGtdItem(id, { dueDate: value.trim() === '' ? null : value.trim() });
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  async function togglePriority(item: GtdItem) {
    await updateGtdItem(item.id, { priority: !item.priority });
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }
```
- Отсортировать видимый список. Заменить строку `const visible = …` на:
```tsx
  const visible = sortGtdItems(LAZY.includes(active) ? lazyItems : items.filter((i) => i.status === active));
```
- Бейджи: сразу после блока waiting-`meta` (перед `<span className={styles.actions}>`) добавить:
```tsx
                  {item.priority && <span className={styles.prio}>❗</span>}
                  {item.dueDate && (
                    <span
                      className={`${styles.due} ${item.dueDate < todayLocal() && item.status !== 'done' ? styles.overdue : ''}`}
                    >
                      ⏰ {item.dueDate}
                    </span>
                  )}
```
- Действия: в `<span className={styles.actions}>`, перед кнопкой «Удалить» (`×`), добавить (кроме inbox — этот блок и так только для не-inbox базового списка):
```tsx
                    <button type="button" onClick={() => togglePriority(item)} title="Важное">
                      {item.priority ? '❗' : '❕'}
                    </button>
                    <button type="button" onClick={() => setDue(item.id)} title="Дедлайн">
                      ⏰
                    </button>
```

- [ ] **Step 2: `GtdScreen.module.css` — стили бейджей**

Добавить:
```css
.prio {
  color: var(--danger);
  font-size: 11px;
}

.due {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.overdue {
  color: var(--danger);
}
```

- [ ] **Step 3: `TodayPanel.tsx` — бейджи + сортировка (read-only)**

- Добавить импорты:
```tsx
import { sortGtdItems } from '@/lib/gtd';
import { todayLocal } from '@/lib/date';
```
- Заменить `items.map((item) => {` на сортированный проход:
```tsx
        {sortGtdItems(items).map((item) => {
```
- В строке пункта, после блока `text` (перед `.cal`/`.del`), добавить бейджи:
```tsx
              {item.priority && <span className={styles.prio}>❗</span>}
              {item.dueDate && (
                <span
                  className={`${styles.due} ${item.dueDate < todayLocal() && item.status !== 'done' ? styles.overdue : ''}`}
                >
                  ⏰ {item.dueDate}
                </span>
              )}
```

- [ ] **Step 4: `TodayPanel.module.css` — стили бейджей**

Добавить те же классы:
```css
.prio {
  color: var(--danger);
  font-size: 11px;
}

.due {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.overdue {
  color: var(--danger);
}
```

- [ ] **Step 5: Сборка + тесты**

Run (из `frontend/`): `bun run build` → чисто; `bunx jest` → всё зелёное.

- [ ] **Step 6: Ручная проверка (после пересборки контроллером)**

http://localhost:4887 → GTD: у пункта Бэклога ⏰ поставить дедлайн (прошлую дату — станет красным), ❗ отметить важным → важные вверх, ближний дедлайн выше; бейджи видны и на «Сегодня».

- [ ] **Step 7: Коммит**

```bash
git add frontend/components/GtdScreen.tsx frontend/components/GtdScreen.module.css frontend/components/TodayPanel.tsx frontend/components/TodayPanel.module.css
git commit -m "feat(frontend): GTD due/priority actions + badges + sorting"
```

---

## Self-Review

**Spec coverage:**
- `dueDate` + `priority` поля + миграция → Task 1. ✅
- update/view через `parseDateParam`/`formatDate`, DTO-валидация → Task 1. ✅
- `sortGtdItems` (важные → ближний дедлайн → order, no-due в конец, без мутации) → Task 2. ✅
- Действия ⏰/❗ + бейджи (просрочка красным) + сортировка на GtdScreen и TodayPanel → Task 3. ✅
- Вне объёма (оценка времени, уровни приоритета, backend-сортировка, Obsidian, DROP DailyTask) — не трогается. ✅

**Placeholder scan:** конкретный код/команды; `<ts>`-имя миграции — реальный генерируемый timestamp.

**Type consistency:** `GtdItemView` (Task 1) ↔ `GtdItem` (Task 2) — одинаковый набор с `dueDate: string|null`, `priority: boolean`. `update` patch-тип (Task 1) и `updateGtdItem` Pick (Task 2) согласованно расширены `dueDate`/`priority`. `sortGtdItems(items): GtdItem[]` (Task 2) вызывается в GtdScreen и TodayPanel (Task 3). Классы `.prio/.due/.overdue` определены в обоих CSS-модулях (Task 3 Steps 2/4).
