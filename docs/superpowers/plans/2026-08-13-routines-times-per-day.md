# Рутины несколько раз в день — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать рутинам дневную норму («почистить зубы 2 раза в день»), сохранив нынешнее поведение рутин с одной отметкой в день.

**Architecture:** Одно число нормы (`weeklyGoal`) заменяется двумя — `timesPerDay` и `daysPerWeek`. У отметки появляется счётчик за день (`RoutineLog.count`), уникальность `(routineId, date)` сохраняется. Правило «день закрыт, когда набрал дневную норму» живёт в одном месте — чистых хелперах бэкенда, — а неделя везде меряется в закрытых днях.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + CSS Modules (frontend), Bun как рантайм и пакетный менеджер, Jest для тестов, Postgres в Docker.

**Спека:** `docs/superpowers/specs/2026-08-13-routines-times-per-day-design.md`

## Global Constraints

- Пакетный менеджер и рантайм — **Bun** (`bun install`, `bun run`, `bunx`), не npm/yarn/pnpm.
- **День закрыт, когда `count >= timesPerDay`.** Неделя меряется в закрытых днях, а не в суммарных отметках. Перевыполнение дня закрывает его, но не даёт двух дней.
- При `timesPerDay = 1` поведение обязано совпадать с нынешним: один клик закрывает день, повторный снимает отметку.
- Уникальность `(routineId, date)` **сохраняется**: одна строка на день, число отметок — в `count`.
- Отметка передаётся **абсолютным** числом (`count`), а не приращением. Инкрементальный протокол вернул бы накрутку двойным кликом — этот класс багов в проекте ловили дважды.
- Границы: `timesPerDay` — 1..10, `daysPerWeek` — 1..7, `count` — 0..`timesPerDay`.
- Миграции: **три отдельные**, в порядке «добавить → перелить → удалить». Правка уже применённого файла миграции ломает контрольную сумму Prisma — на этом проект уже спотыкался.
- Галочка сферы ставится при переходе `count` 0 → ≥1 и **не** снимается при уменьшении или снятии отметки. Асимметрия намеренная.
- Неделя — пн–вс; единственный источник границы — `mondayOf` из `backend/src/common/date.util.ts`. «Сегодня» на фронте — только `todayLocal()`, и оно же передаётся якорем в `getRoutines`/`getRoutinesHistory`.
- Никаких новых цветов: только существующие CSS-токены из `frontend/app/globals.css`.
- Тестов на React-компоненты в проекте нет и заводить их нельзя — компоненты проверяются `bun run build` и живой проверкой.
- В базе живут реальные данные пользователя: никаких `migrate reset`.
- Все сообщения UI — на русском. Коммит после каждой задачи, без trailer'ов об AI-авторстве.

---

### Task 1: Схема и три миграции

**Files:**
- Modify: `backend/prisma/schema.prisma` (модели `Routine`, `RoutineLog`)
- Create: три каталога миграций в `backend/prisma/migrations/`

**Interfaces:**
- Consumes: ничего.
- Produces: поля `Routine.timesPerDay: Int`, `Routine.daysPerWeek: Int`, `RoutineLog.count: Int`; колонка `Routine.weeklyGoal` удалена. Ими пользуются задачи 2-5.

- [ ] **Step 1: Добавить новые поля, сохранив старое**

В `backend/prisma/schema.prisma`, модель `Routine`: **оставить** строку `weeklyGoal Int @default(3)` на месте и добавить рядом:

```prisma
  timesPerDay Int @default(1)
  daysPerWeek Int @default(3)
```

В модель `RoutineLog` добавить после `date`:

```prisma
  count Int @default(1)
```

- [ ] **Step 2: Сгенерировать структурную миграцию**

Run: `cd backend && bunx prisma migrate dev --name add_routine_times_per_day`
Expected: миграция создана и применена; `weeklyGoal` на месте, три новые колонки добавлены.

- [ ] **Step 3: Создать пустую миграцию под бэкфилл**

Run: `cd backend && bunx prisma migrate dev --create-only --name backfill_routine_days_per_week`
Expected: создан каталог с **пустым** `migration.sql` (схема не менялась, поэтому Prisma нечего генерировать).

- [ ] **Step 4: Написать бэкфилл**

В свежесозданный `migration.sql` записать:

```sql
-- Нынешняя недельная норма означала «столько разных дней», поэтому она
-- переезжает в daysPerWeek. timesPerDay и RoutineLog.count берут дефолт 1:
-- до этой миграции больше одной отметки в день существовать не могло.
UPDATE "Routine" SET "daysPerWeek" = "weeklyGoal";
```

- [ ] **Step 5: Применить бэкфилл**

Run: `cd backend && bunx prisma migrate dev`
Expected: миграция `backfill_routine_days_per_week` применена.

Проверить результат:

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c 'select id,title,"weeklyGoal","daysPerWeek","timesPerDay" from "Routine" order by id;'`
Expected: у каждой строки `daysPerWeek` равен `weeklyGoal`, `timesPerDay` равен 1.

- [ ] **Step 6: Удалить старую колонку**

В `backend/prisma/schema.prisma` удалить строку `weeklyGoal Int @default(3)` из модели `Routine`.

Run: `cd backend && bunx prisma migrate dev --name drop_routine_weekly_goal`
Expected: миграция создана и применена, колонки `weeklyGoal` в таблице больше нет.

Если Prisma предупредит о потере данных — это ожидаемо: значения уже перелиты предыдущей миграцией. Соглашаться на потерю **только** этой колонки; любое другое предложение (сброс базы, удаление таблиц) — повод остановиться и доложить.

- [ ] **Step 7: Проверить, что бэкенд ещё собирается**

Run: `cd backend && bun run build`
Expected: сборка падает с ошибками типов в `routines.service.ts` — там ещё используется `weeklyGoal`. Это ожидаемо и чинится в задачах 3-4; на этом шаге важно лишь убедиться, что других сюрпризов нет.

- [ ] **Step 8: Коммит**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): у рутины дневная норма и число отметок за день"
```

---

### Task 2: Чистые хелперы «день закрыт»

**Files:**
- Create: `backend/src/routines/routines.helpers.ts`
- Test: `backend/src/routines/routines.helpers.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  ```ts
  export function isDayClosed(count: number, timesPerDay: number): boolean
  export function closedDays(logs: { count: number }[], timesPerDay: number): number
  ```
  Ими пользуется задача 3.

Правило «день закрыт» живёт здесь и только здесь: и `getWeek`, и `getHistory` обязаны считать одинаково, иначе недельный блок и хитмап разойдутся.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/src/routines/routines.helpers.spec.ts`:

```ts
import { closedDays, isDayClosed } from './routines.helpers';

describe('isDayClosed', () => {
  it('меньше дневной нормы — день не закрыт', () => {
    expect(isDayClosed(1, 2)).toBe(false);
  });

  it('ровно дневная норма — закрыт', () => {
    expect(isDayClosed(2, 2)).toBe(true);
  });

  it('перевыполнение закрывает день', () => {
    expect(isDayClosed(5, 2)).toBe(true);
  });

  it('ноль отметок — не закрыт', () => {
    expect(isDayClosed(0, 2)).toBe(false);
  });

  it('норма 1 — одна отметка закрывает день', () => {
    expect(isDayClosed(1, 1)).toBe(true);
  });
});

describe('closedDays', () => {
  it('считает только закрытые дни, а не отметки', () => {
    // три дня по одной отметке при норме 2 раза в день — ни одного закрытого дня
    expect(closedDays([{ count: 1 }, { count: 1 }, { count: 1 }], 2)).toBe(0);
  });

  it('перевыполненный день остаётся одним днём', () => {
    expect(closedDays([{ count: 5 }], 2)).toBe(1);
  });

  it('смешанные дни', () => {
    expect(closedDays([{ count: 2 }, { count: 1 }, { count: 3 }], 2)).toBe(2);
  });

  it('при норме 1 считает все дни с отметками', () => {
    expect(closedDays([{ count: 1 }, { count: 1 }], 1)).toBe(2);
  });

  it('пустой список даёт ноль', () => {
    expect(closedDays([], 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.helpers.spec.ts`
Expected: FAIL — модуль `./routines.helpers` не найден.

- [ ] **Step 3: Написать хелперы**

Создать `backend/src/routines/routines.helpers.ts`:

```ts
/**
 * День закрыт, когда набрана дневная норма. Перевыполнение закрывает день,
 * но не даёт двух дней: неделя меряется в днях, а не в отметках.
 */
export function isDayClosed(count: number, timesPerDay: number): boolean {
  return count >= timesPerDay;
}

export function closedDays(logs: { count: number }[], timesPerDay: number): number {
  return logs.filter((l) => isDayClosed(l.count, timesPerDay)).length;
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.helpers.spec.ts`
Expected: PASS, 10 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/routines/routines.helpers.ts backend/src/routines/routines.helpers.spec.ts
git commit -m "feat(backend): правило «день закрыт» отдельными хелперами"
```

---

### Task 3: Неделя и история считаются в закрытых днях

**Files:**
- Modify: `backend/src/routines/routines.service.ts:6-25` (интерфейсы), `:34-60` (`getWeek`), `:148-185` (`getHistory`)
- Test: `backend/src/routines/routines.service.spec.ts`

**Interfaces:**
- Consumes: `closedDays` из Task 2; поля из Task 1.
- Produces:
  ```ts
  export interface RoutineView {
    id: number; title: string;
    timesPerDay: number; daysPerWeek: number;
    categoryId: number | null;
    done: number;                              // закрытых дней на этой неделе
    days: { date: string; count: number }[];   // было: string[]
    order: number;
  }
  export interface RoutineHistoryWeek {
    weekStart: string;
    items: { routineId: number; done: number; daysPerWeek: number }[];
  }
  ```

`days` меняет форму: фронту нужно не «в этот день отмечено», а «сколько раз отмечено», чтобы нарисовать частично заполненную точку.

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/routines/routines.service.spec.ts` найти `describe('RoutinesService.getWeek', ...)` и заменить его тело целиком на:

```ts
describe('RoutinesService.getWeek', () => {
  it('берёт неделю пн–вс, содержащую переданную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    const view = await service.getWeek('2026-08-16'); // воскресенье

    expect(view.weekStart).toBe('2026-08-10');
    expect(view.weekEnd).toBe('2026-08-16');
    const where = prisma.routine.findMany.mock.calls[0][0].include.logs.where;
    expect(where.date.gte.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(where.date.lte.toISOString()).toBe('2026-08-16T00:00:00.000Z');
  });

  it('считает done в закрытых днях, а не в отметках', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 2 },
          { date: new Date('2026-08-11T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(1);
    expect(view.routines[0].timesPerDay).toBe(2);
    expect(view.routines[0].daysPerWeek).toBe(7);
  });

  it('отдаёт дни с числом отметок', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 2 },
          { date: new Date('2026-08-11T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].days).toEqual([
      { date: '2026-08-10', count: 2 },
      { date: '2026-08-11', count: 1 },
    ]);
  });

  it('при дневной норме 1 каждая отметка закрывает день', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Качалка', timesPerDay: 1, daysPerWeek: 3, categoryId: null, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z'), count: 1 },
          { date: new Date('2026-08-12T00:00:00.000Z'), count: 1 },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(2);
  });

  it('не показывает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.getWeek('2026-08-12');

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });
});
```

Затем в `describe('RoutinesService.getHistory', ...)` заменить тест «раскладывает логи по неделям» на:

```ts
  it('раскладывает логи по неделям и считает закрытые дни', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, timesPerDay: 2, daysPerWeek: 7 }]);
    prisma.routineLog.findMany.mockResolvedValue([
      { routineId: 1, date: new Date('2026-08-11T00:00:00.000Z'), count: 2 },
      { routineId: 1, date: new Date('2026-08-13T00:00:00.000Z'), count: 1 },
      { routineId: 1, date: new Date('2026-08-05T00:00:00.000Z'), count: 2 },
    ]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history[0]).toEqual({ weekStart: '2026-08-03', items: [{ routineId: 1, done: 1, daysPerWeek: 7 }] });
    expect(history[1]).toEqual({ weekStart: '2026-08-10', items: [{ routineId: 1, done: 1, daysPerWeek: 7 }] });
  });
```

В остальных тестах `getHistory` добавить в фикстуры рутин `timesPerDay` и заменить в ожиданиях `weeklyGoal` на `daysPerWeek`. Тесты `create`, `update`, `addLog` и `removeLog` в этой задаче **не трогать**: сервис там ещё работает по-старому, а переписаны они будут в задаче 4.

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.service.spec.ts -t "закрытых днях"`
Expected: FAIL — `done` равен числу логов, а не закрытых дней.

- [ ] **Step 3: Обновить интерфейсы**

В `backend/src/routines/routines.service.ts` заменить блок интерфейсов (строки 6-25):

```ts
export interface RoutineView {
  id: number;
  title: string;
  timesPerDay: number;
  daysPerWeek: number;
  categoryId: number | null;
  /** Закрытых дней на этой неделе. */
  done: number;
  /** Дни недели с числом отметок — фронт рисует из них заполненность точки. */
  days: { date: string; count: number }[];
  order: number;
}

export interface RoutinesWeekView {
  weekStart: string;
  weekEnd: string;
  routines: RoutineView[];
}

export interface RoutineHistoryWeek {
  weekStart: string;
  items: { routineId: number; done: number; daysPerWeek: number }[];
}
```

и дополнить импорт в шапке файла: `import { closedDays } from './routines.helpers';`

- [ ] **Step 4: Переписать проекцию в `getWeek`**

Заменить блок `routines: routines.map(...)` внутри `getWeek`:

```ts
      routines: routines.map((r: any) => ({
        id: r.id,
        title: r.title,
        timesPerDay: r.timesPerDay,
        daysPerWeek: r.daysPerWeek,
        categoryId: r.categoryId,
        done: closedDays(r.logs, r.timesPerDay),
        days: r.logs.map((l: any) => ({ date: formatDate(l.date), count: l.count })),
        order: r.order,
      })),
```

- [ ] **Step 5: Переписать подсчёт в `getHistory`**

Заменить блок агрегации и сборки результата (от `const counts = new Map...` до конца метода):

```ts
    // Ключ — рутина и неделя; значение — сколько отметок в каждый день той недели.
    const byWeek = new Map<string, number[]>();
    for (const log of logs as any[]) {
      const key = `${log.routineId}|${formatDate(mondayOf(log.date))}`;
      const bucket = byWeek.get(key) ?? [];
      bucket.push(log.count);
      byWeek.set(key, bucket);
    }

    const result: RoutineHistoryWeek[] = [];
    for (let w = 0; w < count; w++) {
      const weekStart = formatDate(addDays(firstMonday, w * 7));
      result.push({
        weekStart,
        items: routines.map((r: any) => ({
          routineId: r.id,
          done: closedDays(
            (byWeek.get(`${r.id}|${weekStart}`) ?? []).map((c) => ({ count: c })),
            r.timesPerDay,
          ),
          daysPerWeek: r.daysPerWeek,
        })),
      });
    }
    return result;
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: PASS. Если падают тесты `create`/`update`/`addLog` — это ожидаемо, они правятся в задаче 4; в таком случае прогнать только `-t "getWeek"` и `-t "getHistory"` и убедиться, что зелены они.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/routines/routines.service.ts backend/src/routines/routines.service.spec.ts
git commit -m "feat(backend): неделя и история рутин считаются в закрытых днях"
```

---

### Task 4: Две нормы в CRUD и абсолютная отметка

**Files:**
- Modify: `backend/src/routines/routines.service.ts:62-88` (`create`, `update`), `:101-136` (`addLog` → `setLog`, `removeLog`)
- Test: `backend/src/routines/routines.service.spec.ts`

**Interfaces:**
- Consumes: интерфейсы из Task 3.
- Produces:
  ```ts
  create(dto: { title: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null })
  update(id: number, dto: { title?: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null; archived?: boolean })
  setLog(id: number, dateStr: string, count: number): Promise<RoutinesWeekView>
  removeLog(id: number, dateStr: string): Promise<RoutinesWeekView>
  ```
  `addLog` исчезает: его место занимает `setLog` с абсолютным числом.

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/routines/routines.service.spec.ts` заменить `describe('RoutinesService.addLog', ...)` целиком на:

```ts
describe('RoutinesService.setLog', () => {
  it('пишет абсолютное число отметок за день', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 2);

    expect(prisma.routineLog.upsert).toHaveBeenCalledWith({
      where: { routineId_date: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') } },
      update: { count: 2 },
      create: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z'), count: 2 },
    });
  });

  it('идемпотентен: повтор с тем же числом даёт тот же результат', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 1);
    await service.setLog(1, '2026-08-12', 1);

    expect(prisma.routineLog.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ update: { count: 1 } }));
  });

  it('ноль удаляет строку дня, а не пишет нулевой счётчик', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 0);

    expect(prisma.routineLog.deleteMany).toHaveBeenCalledWith({
      where: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') },
    });
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  it('отклоняет число больше дневной нормы', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null, timesPerDay: 2 });

    await expect(service.setLog(1, '2026-08-12', 3)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  it('ставит галочку сферы, когда день получает первую отметку', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);
    days.getOrCreateDayId.mockResolvedValue(42);

    await service.setLog(1, '2026-08-12', 1);

    expect(prisma.dayCategoryStatus.upsert).toHaveBeenCalledWith({
      where: { dayId_categoryId: { dayId: 42, categoryId: 5 } },
      update: { done: true },
      create: { dayId: 42, categoryId: 5, done: true },
    });
  });

  it('не трогает сферу, когда число обнуляют', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5, timesPerDay: 2 });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.setLog(1, '2026-08-12', 0);

    expect(days.getOrCreateDayId).not.toHaveBeenCalled();
    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('падает NotFound на архивной рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: true, categoryId: null, timesPerDay: 1 });

    await expect(service.setLog(1, '2026-08-12', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });
});
```

Дополнить импорт в шапке спек-файла: `import { BadRequestException, NotFoundException } from '@nestjs/common';`

Затем в `describe('RoutinesService.create', ...)` заменить оба теста на:

```ts
  it('ставит нормы по умолчанию и следующий order', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.routine.create.mockResolvedValue({ id: 1 });

    await service.create({ title: 'Растяжка' });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Растяжка', timesPerDay: 1, daysPerWeek: 3, categoryId: null, order: 5 },
    });
  });

  it('уважает переданные нормы и сферу', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.routine.create.mockResolvedValue({ id: 2 });

    await service.create({ title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: 1 });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Гигиена', timesPerDay: 2, daysPerWeek: 7, categoryId: 1, order: 0 },
    });
  });
```

и в `describe('RoutinesService.update', ...)` заменить тест про частичное обновление на:

```ts
  it('обновляет только переданные поля', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 1 });

    await service.update(1, { daysPerWeek: 5 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { daysPerWeek: 5 } });
  });

  it('позволяет менять дневную норму', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 1 });

    await service.update(1, { timesPerDay: 2 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { timesPerDay: 2 } });
  });
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.service.spec.ts -t "setLog"`
Expected: FAIL — `service.setLog is not a function`.

- [ ] **Step 3: Переписать `create` и `update`**

В `backend/src/routines/routines.service.ts`:

```ts
  async create(dto: {
    title: string;
    timesPerDay?: number;
    daysPerWeek?: number;
    categoryId?: number | null;
  }) {
    const maxOrder = await this.prisma.routine.aggregate({ _max: { order: true } });
    return this.prisma.routine.create({
      data: {
        title: dto.title,
        timesPerDay: dto.timesPerDay ?? 1,
        daysPerWeek: dto.daysPerWeek ?? 3,
        categoryId: dto.categoryId ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(
    id: number,
    dto: {
      title?: string;
      timesPerDay?: number;
      daysPerWeek?: number;
      categoryId?: number | null;
      archived?: boolean;
    },
  ) {
    const existing = await this.prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.timesPerDay !== undefined) data.timesPerDay = dto.timesPerDay;
    if (dto.daysPerWeek !== undefined) data.daysPerWeek = dto.daysPerWeek;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.archived !== undefined) data.archived = dto.archived;
    return this.prisma.routine.update({ where: { id }, data });
  }
```

- [ ] **Step 4: Заменить `addLog` на `setLog`**

Заменить метод `addLog` целиком на:

```ts
  /**
   * `count` — абсолютное число отметок за этот день, а не приращение.
   * Инкрементальный протокол накручивался бы двойным кликом; здесь повтор
   * запроса с тем же числом ничего не меняет.
   */
  async setLog(id: number, dateStr: string, count: number): Promise<RoutinesWeekView> {
    const routine = await this.prisma.routine.findUnique({ where: { id } });
    if (!routine || routine.archived) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    if (!Number.isInteger(count) || count < 0 || count > routine.timesPerDay) {
      throw new BadRequestException(`count must be an integer between 0 and ${routine.timesPerDay}`);
    }

    const date = parseDateParam(dateStr);

    if (count === 0) {
      await this.prisma.routineLog.deleteMany({ where: { routineId: id, date } });
      return this.getWeek(dateStr);
    }

    await this.prisma.routineLog.upsert({
      where: { routineId_date: { routineId: id, date } },
      update: { count },
      create: { routineId: id, date, count },
    });

    if (routine.categoryId !== null) {
      const dayId = await this.days.getOrCreateDayId(dateStr);
      await this.prisma.dayCategoryStatus.upsert({
        where: { dayId_categoryId: { dayId, categoryId: routine.categoryId } },
        update: { done: true },
        create: { dayId, categoryId: routine.categoryId, done: true },
      });
    }

    return this.getWeek(dateStr);
  }
```

Дополнить импорт в шапке файла: `import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';`

`removeLog` остаётся без изменений — им пользуется полное снятие отметки за день.

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/routines/routines.service.ts backend/src/routines/routines.service.spec.ts
git commit -m "feat(backend): две нормы у рутины и абсолютная отметка за день"
```

---

### Task 5: HTTP-слой под две нормы

**Files:**
- Modify: `backend/src/routines/dto/create-routine.dto.ts`, `backend/src/routines/dto/update-routine.dto.ts`, `backend/src/routines/dto/routine-log.dto.ts`
- Modify: `backend/src/routines/routines.controller.ts`

**Interfaces:**
- Consumes: `create`, `update`, `setLog` из Task 4.
- Produces: `POST /routines/:id/log` принимает `{ date, count }`; `POST /routines` и `PATCH /routines/:id` принимают `timesPerDay` и `daysPerWeek`.

- [ ] **Step 1: Переписать DTO создания**

`backend/src/routines/dto/create-routine.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateRoutineDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  timesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;
}
```

- [ ] **Step 2: Переписать DTO правки**

`backend/src/routines/dto/update-routine.dto.ts`:

```ts
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateRoutineDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  timesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
```

Верхняя граница дней остаётся семёркой: больше семи дней в неделе не бывает. Верхняя граница разов в день — 10, дальше это уже не рутина.

- [ ] **Step 3: Добавить `count` в DTO отметки**

`backend/src/routines/dto/routine-log.dto.ts`:

```ts
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class RoutineLogDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  // Абсолютное число отметок за день. Точная верхняя граница зависит от
  // дневной нормы конкретной рутины и проверяется в сервисе.
  @IsInt()
  @Min(0)
  @Max(10)
  count: number;
}
```

- [ ] **Step 4: Обновить контроллер**

В `backend/src/routines/routines.controller.ts` заменить обработчик отметки:

```ts
  @Post(':id/log')
  setLog(@Param('id', ParseIntPipe) id: number, @Body() dto: RoutineLogDto) {
    return this.routinesService.setLog(id, dto.date, dto.count);
  }
```

Остальные маршруты не меняются.

- [ ] **Step 5: Проверить сборку и тесты**

Run: `cd backend && bun run build && bun run test`
Expected: сборка проходит, все тесты зелёные.

- [ ] **Step 6: Проверить эндпоинты вживую**

```bash
docker compose up -d --build backend
docker compose exec backend bunx prisma migrate deploy
curl -s -X POST http://localhost:3001/routines -H 'Content-Type: application/json' -d '{"title":"ВРЕМЕННАЯ гигиена","timesPerDay":2,"daysPerWeek":7}'
curl -s -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-13","count":1}'
curl -s "http://localhost:3001/routines?week=2026-08-13"
curl -s -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-13","count":2}'
curl -s "http://localhost:3001/routines?week=2026-08-13"
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-13","count":3}'
```

Expected: после `count:1` рутина имеет `done: 0` и день с `count: 1`; после `count:2` — `done: 1`; попытка записать 3 при норме 2 отвечает `400`.

Убрать за собой: `curl -s -X DELETE http://localhost:3001/routines/<id>`, затем удалить строки напрямую (`RoutineLog`, потом `Routine`) — сервис умеет только архивировать. Подтвердить запросом к базе, что временных записей не осталось.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/routines/dto backend/src/routines/routines.controller.ts
git commit -m "feat(backend): эндпоинты рутин принимают две нормы и число отметок"
```

---

### Task 6: Фронт — типы, клиент и чистые функции

**Files:**
- Modify: `frontend/types/api.ts` (интерфейсы `Routine`, `RoutineView`, `RoutineHistoryWeek`)
- Modify: `frontend/lib/api.ts:166-200`
- Modify: `frontend/lib/routines.ts`
- Test: `frontend/lib/routines.spec.ts`

**Interfaces:**
- Consumes: форму ответа из Task 3 и эндпоинты из Task 5.
- Produces:
  ```ts
  // types/api.ts
  interface RoutineView { id: number; title: string; timesPerDay: number; daysPerWeek: number; categoryId: number | null; done: number; days: { date: string; count: number }[]; order: number }
  interface Routine { id: number; title: string; timesPerDay: number; daysPerWeek: number; categoryId: number | null; archived: boolean; order: number; createdAt: string }
  interface RoutineHistoryWeek { weekStart: string; items: { routineId: number; done: number; daysPerWeek: number }[] }

  // lib/api.ts
  createRoutine(title: string, timesPerDay: number, daysPerWeek: number, categoryId: number | null): Promise<Routine>
  updateRoutine(id: number, patch: { title?: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null }): Promise<Routine>
  setRoutineLog(id: number, date: string, count: number): Promise<RoutinesWeek>

  // lib/routines.ts
  dayCount(routine: RoutineView, date: string): number
  isDayFull(routine: RoutineView, date: string): boolean
  nextCount(current: number, timesPerDay: number): number
  ```
  `addRoutineLog` заменяется на `setRoutineLog`. `isDoneOn` исчезает — его заменяет `isDayFull`.

- [ ] **Step 1: Обновить типы**

В `frontend/types/api.ts` заменить `weeklyGoal: number;` на `timesPerDay: number;` и `daysPerWeek: number;` в интерфейсах `Routine` и `RoutineView`; в `RoutineView` заменить `days: string[];` на `days: { date: string; count: number }[];`; в `RoutineHistoryWeek` заменить `weeklyGoal` на `daysPerWeek` внутри `items`.

- [ ] **Step 2: Написать падающие тесты чистых функций**

В `frontend/lib/routines.spec.ts` заменить фабрику и блок `isDoneOn` на:

```ts
function routine(over: Partial<RoutineView>): RoutineView {
  return {
    id: over.id ?? 1, title: over.title ?? 'Гигиена',
    timesPerDay: over.timesPerDay ?? 1, daysPerWeek: over.daysPerWeek ?? 3,
    categoryId: over.categoryId ?? null,
    done: over.done ?? 0, days: over.days ?? [], order: over.order ?? 0,
  };
}

describe('dayCount', () => {
  it('возвращает число отметок за день', () => {
    const r = routine({ days: [{ date: '2026-08-10', count: 2 }] });
    expect(dayCount(r, '2026-08-10')).toBe(2);
  });

  it('день без отметок — ноль', () => {
    expect(dayCount(routine({ days: [] }), '2026-08-10')).toBe(0);
  });
});

describe('isDayFull', () => {
  it('день закрыт, когда набрана дневная норма', () => {
    const r = routine({ timesPerDay: 2, days: [{ date: '2026-08-10', count: 2 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(true);
  });

  it('половина нормы — не закрыт', () => {
    const r = routine({ timesPerDay: 2, days: [{ date: '2026-08-10', count: 1 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(false);
  });

  it('при норме 1 одна отметка закрывает день', () => {
    const r = routine({ timesPerDay: 1, days: [{ date: '2026-08-10', count: 1 }] });
    expect(isDayFull(r, '2026-08-10')).toBe(true);
  });
});

describe('nextCount', () => {
  it('при норме 1 работает как переключатель', () => {
    expect(nextCount(0, 1)).toBe(1);
    expect(nextCount(1, 1)).toBe(0);
  });

  it('при норме 2 цикл 0 → 1 → 2 → 0', () => {
    expect(nextCount(0, 2)).toBe(1);
    expect(nextCount(1, 2)).toBe(2);
    expect(nextCount(2, 2)).toBe(0);
  });

  it('значение выше нормы сбрасывается в ноль', () => {
    expect(nextCount(5, 2)).toBe(0);
  });
});
```

Импорт в первой строке файла заменить на: `import { dayCount, isDayFull, nextCount, routineRatioColor, weekDays } from './routines';`

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd frontend && bunx jest routines.spec.ts`
Expected: FAIL — `dayCount is not a function`.

- [ ] **Step 4: Написать чистые функции**

В `frontend/lib/routines.ts` удалить `isDoneOn` и добавить:

```ts
export function dayCount(routine: RoutineView, date: string): number {
  return routine.days.find((d) => d.date === date)?.count ?? 0;
}

export function isDayFull(routine: RoutineView, date: string): boolean {
  return dayCount(routine, date) >= routine.timesPerDay;
}

/** Клик по дню: 0 → 1 → … → дневная норма → 0. При норме 1 — обычное переключение. */
export function nextCount(current: number, timesPerDay: number): number {
  return current >= timesPerDay ? 0 : current + 1;
}
```

- [ ] **Step 5: Обновить клиент API**

В `frontend/lib/api.ts` заменить три функции:

```ts
export function createRoutine(
  title: string,
  timesPerDay: number,
  daysPerWeek: number,
  categoryId: number | null,
): Promise<Routine> {
  return request(`/routines`, {
    method: 'POST',
    body: JSON.stringify({ title, timesPerDay, daysPerWeek, categoryId }),
  });
}

export function updateRoutine(
  id: number,
  patch: { title?: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null },
): Promise<Routine> {
  return request(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// count — абсолютное число отметок за день, а не приращение.
export function setRoutineLog(id: number, date: string, count: number): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log`, { method: 'POST', body: JSON.stringify({ date, count }) });
}
```

`removeRoutineLog` остаётся без изменений.

- [ ] **Step 6: Запустить тесты**

Run: `cd frontend && bunx jest routines.spec.ts`
Expected: PASS, 13 тестов.

Сборка на этом шаге ещё падает: `RoutinesScreen` и `WeeklyReview` используют старые имена. Это чинится в задачах 7-9.

- [ ] **Step 7: Коммит**

```bash
git add frontend/types/api.ts frontend/lib/api.ts frontend/lib/routines.ts frontend/lib/routines.spec.ts
git commit -m "feat(frontend): типы и чистая логика дневной нормы"
```

---

### Task 7: Экран рутин — частичные точки и дневной прогресс

**Files:**
- Modify: `frontend/components/RoutinesScreen.tsx:5-7` (импорты), `:48-70` (`toggle`), `:126-164` (строка рутины)
- Modify: `frontend/components/RoutinesScreen.module.css` (класс `.dot`)

**Interfaces:**
- Consumes: `dayCount`, `isDayFull`, `nextCount`, `setRoutineLog` из Task 6.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Обновить импорты**

В `frontend/components/RoutinesScreen.tsx`:

```tsx
import { addRoutineLog, ... } from '@/lib/api';   // ← было
import { setRoutineLog, ... } from '@/lib/api';   // ← стало (остальные имена не трогать)
import { dayCount, isDayFull, nextCount, routineRatioColor, weekDays } from '@/lib/routines';
```

- [ ] **Step 2: Переписать обработчик отметки**

Заменить функцию `toggle` целиком:

```tsx
  async function setDay(routineId: number, date: string, count: number) {
    if (busy !== null) return;
    setBusy(routineId);
    setError(null);
    try {
      try {
        // Ноль отправляем отдельным эндпоинтом снятия: он же чистит строку дня.
        setWeek(count === 0 ? await removeRoutineLog(routineId, date) : await setRoutineLog(routineId, date, count));
      } catch {
        setError(count === 0 ? 'Не удалось снять отметку' : 'Не удалось отметить день');
        return;
      }
      // Отдельный catch: отсюда отметка уже записана и неделя перерисована.
      try {
        setHistory(await getRoutinesHistory(8, today));
      } catch {
        setError(count === 0 ? 'Отметка снята, но история недель не обновилась' : 'День отмечен, но история недель не обновилась');
      }
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 3: Переписать строку рутины**

Заменить тело `week.routines.map((r) => { ... })`:

```tsx
      {week.routines.map((r) => {
        const todayCount = dayCount(r, today);
        const todayFull = isDayFull(r, today);
        return (
          <div key={r.id} className={styles.row}>
            <div className={styles.title}>{r.title}</div>

            <div className={styles.dots}>
              {days.map((d, i) => {
                const count = dayCount(r, d);
                const future = d > today;
                // Доля дня: при норме 1 точка либо пуста, либо залита целиком —
                // ровно как было до появления дневной нормы.
                const ratio = Math.min(1, count / r.timesPerDay);
                return (
                  <button
                    key={d}
                    type="button"
                    className={styles.dot}
                    style={{
                      background:
                        ratio === 0
                          ? undefined
                          : `linear-gradient(to top, var(--accent) ${ratio * 100}%, var(--panel-alt) ${ratio * 100}%)`,
                      borderColor: ratio >= 1 ? 'var(--accent)' : undefined,
                    }}
                    disabled={future || busy !== null}
                    title={`${DAY_LABELS[i]} ${d}: ${count} из ${r.timesPerDay}`}
                    aria-label={`${r.title}, ${DAY_LABELS[i]}, ${count} из ${r.timesPerDay}`}
                    onClick={() => setDay(r.id, d, nextCount(count, r.timesPerDay))}
                  />
                );
              })}
            </div>

            <div className={`${styles.count} ${r.done >= r.daysPerWeek ? styles.countDone : ''}`}>
              {r.done}/{r.daysPerWeek}
            </div>

            <button
              type="button"
              className={styles.markBtn}
              disabled={busy !== null}
              onClick={() => setDay(r.id, today, nextCount(todayCount, r.timesPerDay))}
            >
              {todayFull
                ? '✓ сегодня закрыт'
                : r.timesPerDay > 1
                  ? `+ отметить (${todayCount} из ${r.timesPerDay})`
                  : '+ отметить сегодня'}
            </button>
          </div>
        );
      })}
```

- [ ] **Step 4: Поправить историю под новое имя нормы**

В блоке истории заменить `const goal = item?.weeklyGoal ?? r.weeklyGoal;` на:

```tsx
                  const goal = item?.daysPerWeek ?? r.daysPerWeek;
```

- [ ] **Step 5: Убрать фон из статического CSS точки**

В `frontend/components/RoutinesScreen.module.css` в классе `.dot` заменить строку `background: var(--panel-alt);` на:

```css
  background: var(--panel-alt);
  background-clip: padding-box;
```

Класс `.dotFilled` больше не нужен — заливка приходит инлайновым градиентом. Удалить его.

- [ ] **Step 6: Проверить сборку и тесты**

Run: `cd frontend && bun run build && bun run test`
Expected: сборка проходит, тесты зелёные. Если сборка ругается на `WeeklyReview` — это ожидаемо, он правится в задаче 9.

- [ ] **Step 7: Коммит**

```bash
git add frontend/components/RoutinesScreen.tsx frontend/components/RoutinesScreen.module.css
git commit -m "feat(frontend): точки дней показывают дневной прогресс"
```

---

### Task 8: Настройка рутины — второе поле нормы

**Files:**
- Modify: `frontend/components/RoutinesScreen.tsx:18-20` (состояние формы), `:77-101` (`add`, `patch`), `:196-282` (блок настройки)

**Interfaces:**
- Consumes: `createRoutine`, `updateRoutine` из Task 6.
- Produces: ничего для последующих задач.

- [ ] **Step 1: Заменить состояние формы**

В `frontend/components/RoutinesScreen.tsx` заменить `const [newGoal, setNewGoal] = useState(3);` на:

```tsx
  const [newTimesPerDay, setNewTimesPerDay] = useState(1);
  const [newDaysPerWeek, setNewDaysPerWeek] = useState(3);
```

- [ ] **Step 2: Обновить создание рутины**

Заменить функцию `add`:

```tsx
  async function add() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setError(null);
    // Клампим сами: атрибуты min/max у инпута не работают вне <form>, а кнопка
    // здесь обычная, не отправляющая.
    const times = Math.min(10, Math.max(1, Math.round(newTimesPerDay) || 1));
    const days = Math.min(7, Math.max(1, Math.round(newDaysPerWeek) || 1));
    try {
      await createRoutine(trimmed, times, days, newCategoryId);
      setNewTitle('');
      setNewTimesPerDay(1);
      setNewDaysPerWeek(3);
      setNewCategoryId(null);
      await reload();
    } catch {
      setError('Не удалось добавить рутину');
    }
  }
```

- [ ] **Step 3: Расширить сигнатуру `patch`**

```tsx
  async function patch(
    id: number,
    p: { title?: string; timesPerDay?: number; daysPerWeek?: number; categoryId?: number | null },
  ) {
    setError(null);
    try {
      await updateRoutine(id, p);
      await reload();
    } catch {
      setError('Не удалось сохранить изменение');
    }
  }
```

- [ ] **Step 4: Заменить поля нормы в строке настройки существующей рутины**

Заменить блок `<label className={styles.settingsLabel}>норма …</label>` на два поля:

```tsx
              <label className={styles.settingsLabel}>
                раз в день
                <input
                  type="number"
                  min={1}
                  max={10}
                  className={styles.settingsNumber}
                  defaultValue={r.timesPerDay}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (v >= 1 && v <= 10 && v !== r.timesPerDay) patch(r.id, { timesPerDay: v });
                  }}
                />
              </label>
              <label className={styles.settingsLabel}>
                дней в неделю
                <input
                  type="number"
                  min={1}
                  max={7}
                  className={styles.settingsNumber}
                  defaultValue={r.daysPerWeek}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (v >= 1 && v <= 7 && v !== r.daysPerWeek) patch(r.id, { daysPerWeek: v });
                  }}
                />
              </label>
```

- [ ] **Step 5: Заменить поля нормы в форме создания**

Заменить блок `<label className={styles.settingsLabel}>норма …</label>` в строке добавления на:

```tsx
            <label className={styles.settingsLabel}>
              раз в день
              <input
                type="number"
                min={1}
                max={10}
                className={styles.settingsNumber}
                value={newTimesPerDay}
                onChange={(e) => setNewTimesPerDay(Number(e.target.value))}
              />
            </label>
            <label className={styles.settingsLabel}>
              дней в неделю
              <input
                type="number"
                min={1}
                max={7}
                className={styles.settingsNumber}
                value={newDaysPerWeek}
                onChange={(e) => setNewDaysPerWeek(Number(e.target.value))}
              />
            </label>
```

- [ ] **Step 6: Проверить сборку и тесты**

Run: `cd frontend && bun run build && bun run test`
Expected: сборка проходит (кроме ожидаемых ошибок в `WeeklyReview`, если они ещё есть), тесты зелёные.

- [ ] **Step 7: Коммит**

```bash
git add frontend/components/RoutinesScreen.tsx
git commit -m "feat(frontend): в настройке рутины две нормы"
```

---

### Task 9: Воскресный обзор считает дни

**Files:**
- Modify: `frontend/components/WeeklyReview.tsx:61` (`missed`), `:63-86` (`decideRoutine`), `:258-303` (очередь рутин)

**Interfaces:**
- Consumes: `updateRoutine` из Task 6; поле `daysPerWeek`.
- Produces: ничего.

Снижается **число дней в неделю**, а не разов в день: если человек не вытягивает семь дней, честнее признать пять, чем начать чистить зубы один раз. Смена дневной нормы — смена смысла рутины, ей место в настройке.

- [ ] **Step 1: Обновить отбор недобравших**

Заменить строку `const missed = routines.filter((r) => r.done < r.weeklyGoal);` на:

```tsx
  const missed = routines.filter((r) => r.done < r.daysPerWeek);
```

- [ ] **Step 2: Обновить обработчик решения**

В `decideRoutine` заменить строку с понижением нормы:

```tsx
      if (action === 'lower') await updateRoutine(id, { daysPerWeek: goal - 1 });
```

Параметр `goal` теперь получает `r.daysPerWeek` — поправить все три вызова `decideRoutine` в разметке.

- [ ] **Step 3: Обновить текст карточки**

Заменить строку названия и кнопку понижения:

```tsx
                        <div className={styles.queueName}>
                          «{r.title}» — {r.done} из {r.daysPerWeek} дней на этой неделе.
                        </div>
```

```tsx
                          {r.daysPerWeek > 1 && (
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={routineBusy === r.id}
                              onClick={() => decideRoutine(r.id, 'lower', r.daysPerWeek)}
                            >
                              Снизить до {r.daysPerWeek - 1}
                            </button>
                          )}
```

Остальные две кнопки (`keep`, `archive`) получают `r.daysPerWeek` третьим аргументом — значение там не используется, но сигнатура одна на всех.

- [ ] **Step 4: Проверить сборку и тесты**

Run: `cd frontend && bun run build && bun run test`
Expected: сборка проходит без ошибок типов, тесты зелёные.

- [ ] **Step 5: Коммит**

```bash
git add frontend/components/WeeklyReview.tsx
git commit -m "feat(frontend): обзор считает недобор рутин в днях"
```

---

### Task 10: Прогон тестов и живая проверка

**Files:**
- Modify: ничего (только проверка; правки — по факту находок)

**Interfaces:**
- Consumes: всё, сделанное в задачах 1-9.
- Produces: ничего.

- [ ] **Step 1: Прогнать тесты бэкенда**

Run: `cd backend && bun run test`
Expected: PASS.

- [ ] **Step 2: Прогнать тесты фронтенда**

Run: `cd frontend && bun run test && bun run build`
Expected: PASS, сборка проходит.

- [ ] **Step 3: Поднять стек с миграциями**

```bash
docker compose up -d --build
docker compose exec backend bunx prisma migrate deploy
docker compose ps
```

Expected: все четыре сервиса `Up`, postgres `healthy`, три новые миграции применены.

- [ ] **Step 4: Проверить, что существующие рутины пережили переезд**

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c 'select id,title,"timesPerDay","daysPerWeek",archived from "Routine" order by id;'`
Expected: у всех живых рутин пользователя `timesPerDay = 1`, а `daysPerWeek` равен той норме, что была до переезда. Ни одна рутина не потеряна.

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c 'select "routineId", date, count from "RoutineLog" order by "routineId", date;'`
Expected: у всех существующих отметок `count = 1`.

- [ ] **Step 5: Проверить дневную норму на временной рутине**

Реальные данные пользователя не менять. Создать временную рутину с нормой 2 раза в день, 7 дней в неделю, **без привязки к сфере**, и проверить переходы:

```bash
curl -s -X POST http://localhost:3001/routines -H 'Content-Type: application/json' \
  -d '{"title":"ВРЕМЕННАЯ проверка","timesPerDay":2,"daysPerWeek":7}'
curl -s -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-13","count":1}'
curl -s "http://localhost:3001/routines?week=2026-08-13"
curl -s -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-13","count":2}'
curl -s "http://localhost:3001/routines?week=2026-08-13"
```

Expected: после первой отметки `done: 0` и день с `count: 1` — день ещё не закрыт; после второй `done: 1`.

Убрать за собой: заархивировать через `DELETE`, затем удалить строки напрямую из базы (сначала `RoutineLog`, потом `Routine`) и подтвердить запросом, что временных записей не осталось.

- [ ] **Step 6: Проверить в браузере**

Открыть `http://localhost:4887`, вкладка «Рутины»:

- у рутины с нормой 1 раз в день точки и кнопка ведут себя как раньше: клик заливает точку целиком, повторный клик снимает;
- у рутины с нормой 2 раза в день первый клик заливает точку наполовину, второй — целиком, третий сбрасывает;
- кнопка показывает «+ отметить (1 из 2)» и превращается в «✓ сегодня закрыт», когда день набран;
- счётчик недели показывает закрытые дни из дней в неделю;
- в «Настроить рутины» два поля: «раз в день» и «дней в неделю»;
- в воскресном обзоре карточка недобравшей рутины говорит «N из M дней на этой неделе», а кнопка снижает дни.

Проверять надо именно в браузере: данные тянутся в `useEffect`, curl и SSR видят только оболочку «загрузка…». Если автоматизация браузера недоступна — не выдумывать результат, а перечислить в отчёте, что осталось посмотреть человеку.

- [ ] **Step 7: Коммит, если были правки**

```bash
git add -A
git commit -m "fix: правки по итогам живой проверки"
```

Если правок не потребовалось — шаг пропускается.

---

## Что осталось за рамками этого плана

- Время суток у отметки (утро/вечер) — отметка остаётся привязанной к дню.
- Напоминания по рутинам.
- Разные дневные нормы для разных дней недели.
- История с разбивкой по разам внутри дня — хитмап по-прежнему меряет закрытые дни.
- Изменение асимметрии со снятием галочки сферы.
