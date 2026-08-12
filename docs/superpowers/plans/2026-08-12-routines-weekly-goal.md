# Рутины с недельной нормой — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать повторяющимся действиям («позаниматься в качалке 3 раза в неделю») собственное место с недельной нормой и видимым прогрессом, отделив их от разовых GTD-задач.

**Architecture:** Новый бэкенд-модуль `routines` по образцу остальных фич (controller / service / module / dto / spec с замоканным `PrismaService`). Две новые таблицы: `Routine` (норма живёт здесь) и `RoutineLog` (факт, одна отметка в день). Отметка рутины с привязанной сферой ставит галочку `DayCategoryStatus`, поэтому существующие стрик и статистика продолжают работать без изменений. На фронте — третья вкладка со своим фетчем на маунте, по образцу `TaskTemplatesTab`.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + CSS Modules (frontend), Bun как рантайм и пакетный менеджер, Jest для тестов, Postgres в Docker.

**Спека:** `docs/superpowers/specs/2026-08-12-routines-weekly-goal-design.md`

## Global Constraints

- Пакетный менеджер и рантайм — **Bun** (`bun install`, `bun run`, `bunx`), не npm/yarn/pnpm.
- Неделя — **пн–вс**. Единственный источник границы недели — `mondayOf` из `backend/src/common/date.util.ts` (создаётся в Task 1). Вторая реализация где бы то ни было — дефект.
- Норма `weeklyGoal` — целое **от 1 до 7**. Больше семи при одной отметке в день недостижимо.
- Одна отметка в день на рутину: уникальность `(routineId, date)`. Повторный запрос на ту же дату **идемпотентен**, не ошибка.
- Отметка рутины с непустым `categoryId` ставит `DayCategoryStatus.done = true`. Снятие отметки галочку сферы **не снимает** — асимметрия намеренная.
- `DELETE /routines/:id` **архивирует** (`archived = true`), логи сохраняются. Жёсткого удаления рутин нет.
- Норма не версионируется: прошедшие недели сравниваются с текущим значением `weeklyGoal`.
- Даты-строки везде `YYYY-MM-DD`. «Сегодня» на фронте — только через `todayLocal()` из `frontend/lib/date.ts`.
- Никаких новых цветов: только существующие CSS-токены из `frontend/app/globals.css`.
- Тестов на React-компоненты в проекте нет и заводить их нельзя — компоненты проверяются `bun run build` и живой проверкой. Чистая логика фронта живёт в `frontend/lib/*.ts` и покрывается тестами.
- Тесты сервисов мокают `PrismaService` напрямую (`new RoutinesService(prisma, days)`), без `@nestjs/testing`.
- Все сообщения UI — на русском, тон существующего интерфейса.
- Коммит после каждой задачи. Без trailer'ов об AI-авторстве.

---

### Task 1: `mondayOf` в общих утилитах

**Files:**
- Modify: `backend/src/common/date.util.ts`
- Modify: `backend/src/stats/stats.service.ts:195-199` (удалить приватный метод), `:внутренние вызовы this.mondayOf(...)`
- Test: `backend/src/common/date.util.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `mondayOf(date: Date): Date` — понедельник той недели, в которую попадает `date`. Им пользуются задачи 3 и 5.

`StatsService` уже содержит приватный `mondayOf`, реализующий ровно это. Он переезжает в общий модуль, иначе появится вторая реализация границы недели, и однажды вкладка рутин и недельная сводка покажут разные недели.

- [ ] **Step 1: Написать падающий тест**

Добавить в `backend/src/common/date.util.spec.ts` внутрь существующего `describe('date.util', ...)`:

```ts
  it('возвращает сам понедельник без сдвига', () => {
    const d = mondayOf(new Date('2026-08-10T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('для воскресенья возвращает понедельник той же недели, а не следующей', () => {
    const d = mondayOf(new Date('2026-08-16T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('для середины недели возвращает начало этой недели', () => {
    const d = mondayOf(new Date('2026-08-12T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-10');
  });

  it('корректно переходит через границу месяца', () => {
    const d = mondayOf(new Date('2026-09-02T00:00:00.000Z'));
    expect(formatDate(d)).toBe('2026-08-31');
  });
```

и дополнить импорт в первой строке файла: `import { addDays, formatDate, mondayOf, parseDateParam } from './date.util';`

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && bunx jest date.util.spec.ts`
Expected: FAIL — `mondayOf is not a function`.

- [ ] **Step 3: Перенести реализацию**

В конец `backend/src/common/date.util.ts`:

```ts
/** Понедельник той недели, в которую попадает date. Неделя в проекте — пн–вс. */
export function mondayOf(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}
```

- [ ] **Step 4: Переключить `StatsService` на общий хелпер**

В `backend/src/stats/stats.service.ts`:
- удалить приватный метод `mondayOf` целиком (последний метод класса, около строки 195);
- заменить все вызовы `this.mondayOf(` на `mondayOf(`;
- дополнить импорт из `../common/date.util` именем `mondayOf`.

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest date.util.spec.ts stats.service.spec.ts`
Expected: PASS — включая все существующие тесты `stats.service.spec.ts` без единой правки в них.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/common/date.util.ts backend/src/common/date.util.spec.ts backend/src/stats/stats.service.ts
git commit -m "refactor(backend): граница недели живёт в одном месте"
```

---

### Task 2: Модели `Routine` и `RoutineLog`

**Files:**
- Modify: `backend/prisma/schema.prisma` (новые модели, обратная связь у `Category`)
- Create: `backend/prisma/migrations/<timestamp>_add_routines/migration.sql` (генерируется Prisma)

**Interfaces:**
- Consumes: ничего.
- Produces: модели `Routine` и `RoutineLog` в клиенте Prisma — `prisma.routine`, `prisma.routineLog`. Ими пользуются задачи 3, 4, 5.

- [ ] **Step 1: Добавить модели в схему**

В конец `backend/prisma/schema.prisma`:

```prisma
model Routine {
  id         Int          @id @default(autoincrement())
  title      String
  weeklyGoal Int          @default(3)
  categoryId Int?
  category   Category?    @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  archived   Boolean      @default(false)
  order      Int          @default(0)
  logs       RoutineLog[]
  createdAt  DateTime     @default(now())
}

model RoutineLog {
  id        Int      @id @default(autoincrement())
  routineId Int
  routine   Routine  @relation(fields: [routineId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date

  @@unique([routineId, date])
}
```

И в модель `Category` (`backend/prisma/schema.prisma:9-16`), после строки `statuses DayCategoryStatus[]`:

```prisma
  routines Routine[]
```

- [ ] **Step 2: Сгенерировать и применить миграцию**

Run: `cd backend && bunx prisma migrate dev --name add_routines`
Expected: создан каталог `backend/prisma/migrations/<timestamp>_add_routines/` с `migration.sql`, клиент Prisma перегенерирован без ошибок.

- [ ] **Step 3: Проверить, что таблицы реально созданы**

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c '\d "Routine"' -c '\d "RoutineLog"'`
Expected: обе таблицы существуют; у `RoutineLog` виден уникальный индекс по `("routineId", "date")`; колонка `date` имеет тип `date`, а не `timestamp`.

- [ ] **Step 4: Убедиться, что существующие тесты не сломаны**

Run: `cd backend && bun run test`
Expected: PASS (на момент старта задачи — 239 тестов).

- [ ] **Step 5: Коммит**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): модели рутин и их отметок"
```

---

### Task 3: `RoutinesService` — неделя с прогрессом и CRUD

**Files:**
- Create: `backend/src/routines/routines.service.ts`
- Test: `backend/src/routines/routines.service.spec.ts`

**Interfaces:**
- Consumes: `mondayOf` из Task 1; модели из Task 2.
- Produces:
  ```ts
  export interface RoutineView {
    id: number; title: string; weeklyGoal: number; categoryId: number | null;
    done: number; days: string[]; order: number;
  }
  export interface RoutinesWeekView {
    weekStart: string; weekEnd: string; routines: RoutineView[];
  }
  class RoutinesService {
    constructor(prisma: PrismaService, days: DaysService)
    getWeek(weekParam?: string): Promise<RoutinesWeekView>
    create(dto: { title: string; weeklyGoal?: number; categoryId?: number | null }): Promise<Routine>
    update(id: number, dto: { title?: string; weeklyGoal?: number; categoryId?: number | null; archived?: boolean }): Promise<Routine>
    archive(id: number): Promise<{ id: number }>
  }
  ```
  Конструктор принимает `DaysService` уже сейчас, хотя пользуется им только Task 4 — чтобы не менять сигнатуру дважды.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/src/routines/routines.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { RoutinesService } from './routines.service';

function makeService() {
  const prisma: any = {
    routine: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    routineLog: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    dayCategoryStatus: { upsert: jest.fn() },
  };
  const days: any = { getOrCreateDayId: jest.fn() };
  return { service: new RoutinesService(prisma, days), prisma, days };
}

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

  it('считает done по логам недели и отдаёт дни строками', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([
      {
        id: 1, title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 5, order: 0,
        logs: [
          { date: new Date('2026-08-10T00:00:00.000Z') },
          { date: new Date('2026-08-12T00:00:00.000Z') },
        ],
      },
    ]);

    const view = await service.getWeek('2026-08-12');

    expect(view.routines[0].done).toBe(2);
    expect(view.routines[0].days).toEqual(['2026-08-10', '2026-08-12']);
    expect(view.routines[0].weeklyGoal).toBe(3);
    expect(view.routines[0].categoryId).toBe(5);
  });

  it('не показывает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.getWeek('2026-08-12');

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });
});

describe('RoutinesService.create', () => {
  it('ставит норму 3 по умолчанию и следующий order', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: 4 } });
    prisma.routine.create.mockResolvedValue({ id: 1 });

    await service.create({ title: 'Растяжка' });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Растяжка', weeklyGoal: 3, categoryId: null, order: 5 },
    });
  });

  it('уважает переданные норму и сферу', async () => {
    const { service, prisma } = makeService();
    prisma.routine.aggregate.mockResolvedValue({ _max: { order: null } });
    prisma.routine.create.mockResolvedValue({ id: 2 });

    await service.create({ title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 1 });

    expect(prisma.routine.create).toHaveBeenCalledWith({
      data: { title: 'Позаниматься в качалке', weeklyGoal: 3, categoryId: 1, order: 0 },
    });
  });
});

describe('RoutinesService.update', () => {
  it('падает NotFound на несуществующей рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue(null);

    await expect(service.update(7, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routine.update).not.toHaveBeenCalled();
  });

  it('обновляет только переданные поля', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 1 });

    await service.update(1, { weeklyGoal: 2 });

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { weeklyGoal: 2 } });
  });
});

describe('RoutinesService.archive', () => {
  it('архивирует, а не удаляет', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 3, archived: false });
    prisma.routine.update.mockResolvedValue({ id: 3 });

    const res = await service.archive(3);

    expect(prisma.routine.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { archived: true } });
    expect(res).toEqual({ id: 3 });
  });

  it('падает NotFound на несуществующей рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue(null);

    await expect(service.archive(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: FAIL — модуль `./routines.service` не найден.

- [ ] **Step 3: Написать сервис**

Создать `backend/src/routines/routines.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaysService } from '../days/days.service';
import { addDays, formatDate, mondayOf, parseDateParam, todayDate } from '../common/date.util';

export interface RoutineView {
  id: number;
  title: string;
  weeklyGoal: number;
  categoryId: number | null;
  done: number;
  days: string[];
  order: number;
}

export interface RoutinesWeekView {
  weekStart: string;
  weekEnd: string;
  routines: RoutineView[];
}

@Injectable()
export class RoutinesService {
  constructor(
    private prisma: PrismaService,
    private days: DaysService,
  ) {}

  async getWeek(weekParam?: string): Promise<RoutinesWeekView> {
    const anchor = weekParam ? parseDateParam(weekParam) : todayDate();
    const weekStart = mondayOf(anchor);
    const weekEnd = addDays(weekStart, 6);

    const routines = await this.prisma.routine.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
      include: {
        logs: { where: { date: { gte: weekStart, lte: weekEnd } }, orderBy: { date: 'asc' } },
      },
    });

    return {
      weekStart: formatDate(weekStart),
      weekEnd: formatDate(weekEnd),
      routines: routines.map((r: any) => ({
        id: r.id,
        title: r.title,
        weeklyGoal: r.weeklyGoal,
        categoryId: r.categoryId,
        done: r.logs.length,
        days: r.logs.map((l: any) => formatDate(l.date)),
        order: r.order,
      })),
    };
  }

  async create(dto: { title: string; weeklyGoal?: number; categoryId?: number | null }) {
    const maxOrder = await this.prisma.routine.aggregate({ _max: { order: true } });
    return this.prisma.routine.create({
      data: {
        title: dto.title,
        weeklyGoal: dto.weeklyGoal ?? 3,
        categoryId: dto.categoryId ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async update(
    id: number,
    dto: { title?: string; weeklyGoal?: number; categoryId?: number | null; archived?: boolean },
  ) {
    const existing = await this.prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.weeklyGoal !== undefined) data.weeklyGoal = dto.weeklyGoal;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.archived !== undefined) data.archived = dto.archived;
    return this.prisma.routine.update({ where: { id }, data });
  }

  // Жёсткого удаления нет намеренно: логи — самое ценное здесь,
  // а каскад унёс бы историю выполнения вместе с рутиной.
  async archive(id: number): Promise<{ id: number }> {
    const existing = await this.prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    await this.prisma.routine.update({ where: { id }, data: { archived: true } });
    return { id };
  }
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/routines/routines.service.ts backend/src/routines/routines.service.spec.ts
git commit -m "feat(backend): рутины — неделя с прогрессом и управление списком"
```

---

### Task 4: Отметки рутин и связь со сферой

**Files:**
- Modify: `backend/src/routines/routines.service.ts` (два новых метода)
- Test: `backend/src/routines/routines.service.spec.ts` (новые `describe` в конец файла)

**Interfaces:**
- Consumes: `RoutinesService` из Task 3; `DaysService.getOrCreateDayId(dateStr: string): Promise<number>`.
- Produces:
  ```ts
  addLog(id: number, dateStr: string): Promise<RoutinesWeekView>
  removeLog(id: number, dateStr: string): Promise<RoutinesWeekView>
  ```
  Оба возвращают неделю, содержащую `dateStr`, чтобы фронту не приходилось делать второй запрос.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/routines/routines.service.spec.ts`:

```ts
describe('RoutinesService.addLog', () => {
  it('идемпотентен: повторная отметка той же даты не создаёт вторую запись', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.addLog(1, '2026-08-12');

    expect(prisma.routineLog.upsert).toHaveBeenCalledWith({
      where: { routineId_date: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') } },
      update: {},
      create: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') },
    });
  });

  it('ставит галочку сферы, когда рутина к ней привязана', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: 5 });
    prisma.routine.findMany.mockResolvedValue([]);
    days.getOrCreateDayId.mockResolvedValue(42);

    await service.addLog(1, '2026-08-12');

    expect(days.getOrCreateDayId).toHaveBeenCalledWith('2026-08-12');
    expect(prisma.dayCategoryStatus.upsert).toHaveBeenCalledWith({
      where: { dayId_categoryId: { dayId: 42, categoryId: 5 } },
      update: { done: true },
      create: { dayId: 42, categoryId: 5, done: true },
    });
  });

  it('не трогает сферы, когда привязки нет', async () => {
    const { service, prisma, days } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null });
    prisma.routine.findMany.mockResolvedValue([]);

    await service.addLog(1, '2026-08-12');

    expect(days.getOrCreateDayId).not.toHaveBeenCalled();
    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('падает NotFound на архивной рутине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: true, categoryId: null });

    await expect(service.addLog(1, '2026-08-12')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.routineLog.upsert).not.toHaveBeenCalled();
  });

  it('возвращает неделю, содержащую отмеченную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findUnique.mockResolvedValue({ id: 1, archived: false, categoryId: null });
    prisma.routine.findMany.mockResolvedValue([]);

    const view = await service.addLog(1, '2026-08-16');

    expect(view.weekStart).toBe('2026-08-10');
  });
});

describe('RoutinesService.removeLog', () => {
  it('снимает отметку за конкретную дату', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.removeLog(1, '2026-08-12');

    expect(prisma.routineLog.deleteMany).toHaveBeenCalledWith({
      where: { routineId: 1, date: new Date('2026-08-12T00:00:00.000Z') },
    });
  });

  it('не снимает галочку сферы — сферу могли закрыть по другой причине', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);

    await service.removeLog(1, '2026-08-12');

    expect(prisma.dayCategoryStatus.upsert).not.toHaveBeenCalled();
  });

  it('не падает, когда отметки не было', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeLog(1, '2026-08-12')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.service.spec.ts -t "addLog"`
Expected: FAIL — `service.addLog is not a function`.

- [ ] **Step 3: Реализовать методы**

Добавить в `backend/src/routines/routines.service.ts`, внутрь класса, после `archive`:

```ts
  async addLog(id: number, dateStr: string): Promise<RoutinesWeekView> {
    const routine = await this.prisma.routine.findUnique({ where: { id } });
    if (!routine || routine.archived) {
      throw new NotFoundException(`Routine ${id} not found`);
    }
    const date = parseDateParam(dateStr);
    await this.prisma.routineLog.upsert({
      where: { routineId_date: { routineId: id, date } },
      update: {},
      create: { routineId: id, date },
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

  // Галочку сферы намеренно не снимаем: сферу могли закрыть и по другой
  // причине (пробежка вместо качалки), и снятие отметки рутины не даёт
  // системе права стирать этот факт.
  async removeLog(id: number, dateStr: string): Promise<RoutinesWeekView> {
    const date = parseDateParam(dateStr);
    await this.prisma.routineLog.deleteMany({ where: { routineId: id, date } });
    return this.getWeek(dateStr);
  }
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: PASS, 17 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/routines/routines.service.ts backend/src/routines/routines.service.spec.ts
git commit -m "feat(backend): отметка рутины закрывает связанную сферу"
```

---

### Task 5: История выполнения по неделям

**Files:**
- Modify: `backend/src/routines/routines.service.ts` (новый метод)
- Test: `backend/src/routines/routines.service.spec.ts` (новый `describe` в конец файла)

**Interfaces:**
- Consumes: `RoutinesService` из задач 3-4.
- Produces:
  ```ts
  export interface RoutineHistoryWeek {
    weekStart: string;
    items: { routineId: number; done: number; weeklyGoal: number }[];
  }
  getHistory(weeks?: number): Promise<RoutineHistoryWeek[]>  // по умолчанию 8
  ```
  Недели идут от старых к новым; последняя — текущая.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/routines/routines.service.spec.ts`:

```ts
describe('RoutinesService.getHistory', () => {
  it('возвращает запрошенное число недель, последняя — текущая', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, weeklyGoal: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(3);

    expect(history.map((w) => w.weekStart)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10']);
  });

  it('раскладывает логи по неделям, к которым они относятся', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, weeklyGoal: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([
      { routineId: 1, date: new Date('2026-08-11T00:00:00.000Z') },
      { routineId: 1, date: new Date('2026-08-13T00:00:00.000Z') },
      { routineId: 1, date: new Date('2026-08-05T00:00:00.000Z') },
    ]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history[0]).toEqual({ weekStart: '2026-08-03', items: [{ routineId: 1, done: 1, weeklyGoal: 3 }] });
    expect(history[1]).toEqual({ weekStart: '2026-08-10', items: [{ routineId: 1, done: 2, weeklyGoal: 3 }] });
  });

  it('отдаёт нули для недели без отметок, а не пропускает её', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([{ id: 1, weeklyGoal: 3 }]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    const history = await service.getHistory(2);

    expect(history[0].items).toEqual([{ routineId: 1, done: 0, weeklyGoal: 3 }]);
  });

  it('не считает архивные рутины', async () => {
    const { service, prisma } = makeService();
    prisma.routine.findMany.mockResolvedValue([]);
    prisma.routineLog.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'currentMonday').mockReturnValue(new Date('2026-08-10T00:00:00.000Z'));

    await service.getHistory(2);

    expect(prisma.routine.findMany.mock.calls[0][0].where).toEqual({ archived: false });
  });
});
```

Приватный `currentMonday` существует именно для того, чтобы тест мог зафиксировать «сегодня» — обращаться к системным часам напрямую в теле `getHistory` нельзя, иначе тест начнёт зависеть от дня прогона.

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `cd backend && bunx jest routines.service.spec.ts -t "getHistory"`
Expected: FAIL — `service.getHistory is not a function`.

- [ ] **Step 3: Реализовать метод**

Добавить в `backend/src/routines/routines.service.ts` — интерфейс рядом с остальными, метод внутрь класса:

```ts
export interface RoutineHistoryWeek {
  weekStart: string;
  items: { routineId: number; done: number; weeklyGoal: number }[];
}
```

```ts
  /** Вынесено отдельным методом, чтобы тесты могли зафиксировать «сегодня». */
  private currentMonday(): Date {
    return mondayOf(todayDate());
  }

  async getHistory(weeks = 8): Promise<RoutineHistoryWeek[]> {
    const lastMonday = this.currentMonday();
    const firstMonday = addDays(lastMonday, -(weeks - 1) * 7);

    const routines = await this.prisma.routine.findMany({
      where: { archived: false },
      orderBy: { order: 'asc' },
    });
    const logs = await this.prisma.routineLog.findMany({
      where: {
        date: { gte: firstMonday, lte: addDays(lastMonday, 6) },
        routineId: { in: routines.map((r: any) => r.id) },
      },
    });

    const counts = new Map<string, number>();
    for (const log of logs as any[]) {
      const key = `${log.routineId}|${formatDate(mondayOf(log.date))}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result: RoutineHistoryWeek[] = [];
    for (let w = 0; w < weeks; w++) {
      const weekStart = formatDate(addDays(firstMonday, w * 7));
      result.push({
        weekStart,
        items: routines.map((r: any) => ({
          routineId: r.id,
          done: counts.get(`${r.id}|${weekStart}`) ?? 0,
          weeklyGoal: r.weeklyGoal,
        })),
      });
    }
    return result;
  }
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `cd backend && bunx jest routines.service.spec.ts`
Expected: PASS, 21 тест.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/routines/routines.service.ts backend/src/routines/routines.service.spec.ts
git commit -m "feat(backend): история выполнения рутин по неделям"
```

---

### Task 6: HTTP-слой рутин

**Files:**
- Create: `backend/src/routines/routines.controller.ts`
- Create: `backend/src/routines/routines.module.ts`
- Create: `backend/src/routines/dto/create-routine.dto.ts`
- Create: `backend/src/routines/dto/update-routine.dto.ts`
- Create: `backend/src/routines/dto/routine-log.dto.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: все методы `RoutinesService` из задач 3-5.
- Produces: эндпоинты, которыми пользуется фронт в задачах 7-11:
  - `GET /routines?week=YYYY-MM-DD` → `RoutinesWeekView`
  - `GET /routines/history?weeks=8` → `RoutineHistoryWeek[]`
  - `POST /routines` → созданная рутина
  - `PATCH /routines/:id` → обновлённая рутина
  - `DELETE /routines/:id` → `{ id }`
  - `POST /routines/:id/log` → `RoutinesWeekView`
  - `DELETE /routines/:id/log/:date` → `RoutinesWeekView`

- [ ] **Step 1: Написать DTO**

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
  @Max(7)
  weeklyGoal?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;
}
```

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
  @Max(7)
  weeklyGoal?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
```

`backend/src/routines/dto/routine-log.dto.ts`:

```ts
import { IsString, Matches } from 'class-validator';

export class RoutineLogDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}
```

Верхняя граница нормы — 7: при одной отметке в день больше недостижимо, и ловить это должна валидация, а не пользователь.

- [ ] **Step 2: Написать контроллер**

`backend/src/routines/routines.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutineLogDto } from './dto/routine-log.dto';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routinesService: RoutinesService) {}

  // Объявлен до `:id`-маршрутов: иначе 'history' уедет в параметр.
  @Get('history')
  getHistory(@Query('weeks') weeks?: string) {
    return this.routinesService.getHistory(weeks ? Number(weeks) : undefined);
  }

  @Get()
  getWeek(@Query('week') week?: string) {
    return this.routinesService.getWeek(week);
  }

  @Post()
  create(@Body() dto: CreateRoutineDto) {
    return this.routinesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoutineDto) {
    return this.routinesService.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.routinesService.archive(id);
  }

  @Post(':id/log')
  addLog(@Param('id', ParseIntPipe) id: number, @Body() dto: RoutineLogDto) {
    return this.routinesService.addLog(id, dto.date);
  }

  @Delete(':id/log/:date')
  removeLog(@Param('id', ParseIntPipe) id: number, @Param('date') date: string) {
    return this.routinesService.removeLog(id, date);
  }
}
```

- [ ] **Step 3: Написать модуль и зарегистрировать его**

`backend/src/routines/routines.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RoutinesController } from './routines.controller';
import { RoutinesService } from './routines.service';
import { DaysModule } from '../days/days.module';

@Module({
  imports: [DaysModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
```

В `backend/src/app.module.ts` добавить импорт `import { RoutinesModule } from './routines/routines.module';` и `RoutinesModule` в массив `imports` последним элементом.

- [ ] **Step 4: Проверить сборку и тесты**

Run: `cd backend && bun run build && bun run test`
Expected: сборка проходит, тесты PASS.

- [ ] **Step 5: Проверить эндпоинты вживую**

```bash
docker compose up -d --build backend
docker compose exec backend bunx prisma migrate deploy
curl -s -X POST http://localhost:3001/routines -H 'Content-Type: application/json' -d '{"title":"ВРЕМЕННАЯ проверка","weeklyGoal":3}'
curl -s http://localhost:3001/routines
curl -s -X POST http://localhost:3001/routines/<id>/log -H 'Content-Type: application/json' -d '{"date":"2026-08-12"}'
curl -s http://localhost:3001/routines/history?weeks=2
curl -s -X DELETE http://localhost:3001/routines/<id>
```

Expected: `GET /routines` отдаёт `weekStart`/`weekEnd` и рутину с `done: 1` и одним днём в `days` после отметки; `history` отдаёт две недели; после `DELETE` рутина пропадает из `GET /routines`. Проверить и отрицательный случай:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/routines -H 'Content-Type: application/json' -d '{"title":"x","weeklyGoal":9}'
```

Expected: `400`.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/routines backend/src/app.module.ts
git commit -m "feat(backend): эндпоинты рутин"
```

---

### Task 7: Фронт — типы, клиент API и чистые функции

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/routines.ts`
- Test: `frontend/lib/routines.spec.ts`

**Interfaces:**
- Consumes: эндпоинты из Task 6.
- Produces:
  ```ts
  // types/api.ts
  export interface RoutineView { id: number; title: string; weeklyGoal: number; categoryId: number | null; done: number; days: string[]; order: number }
  export interface RoutinesWeek { weekStart: string; weekEnd: string; routines: RoutineView[] }
  export interface RoutineHistoryWeek { weekStart: string; items: { routineId: number; done: number; weeklyGoal: number }[] }

  // lib/api.ts
  getRoutines(week?: string): Promise<RoutinesWeek>
  getRoutinesHistory(weeks?: number): Promise<RoutineHistoryWeek[]>
  createRoutine(title: string, weeklyGoal: number, categoryId: number | null): Promise<Routine>
  updateRoutine(id: number, patch: { title?: string; weeklyGoal?: number; categoryId?: number | null }): Promise<Routine>
  archiveRoutine(id: number): Promise<{ id: number }>
  addRoutineLog(id: number, date: string): Promise<RoutinesWeek>
  removeRoutineLog(id: number, date: string): Promise<RoutinesWeek>

  // lib/routines.ts
  weekDays(weekStart: string): string[]           // 7 дат пн–вс
  routineRatioColor(done: number, goal: number): string
  unclosedRoutines(routines: RoutineView[]): number
  isDoneOn(routine: RoutineView, date: string): boolean
  ```

- [ ] **Step 1: Добавить типы**

В конец `frontend/types/api.ts`:

```ts
export interface RoutineView {
  id: number;
  title: string;
  weeklyGoal: number;
  categoryId: number | null;
  done: number;
  days: string[];
  order: number;
}

export interface RoutinesWeek {
  weekStart: string;
  weekEnd: string;
  routines: RoutineView[];
}

export interface RoutineHistoryWeek {
  weekStart: string;
  items: { routineId: number; done: number; weeklyGoal: number }[];
}

/** Сырая запись рутины — ровно то, что отдают POST /routines и PATCH /routines/:id. */
export interface Routine {
  id: number;
  title: string;
  weeklyGoal: number;
  categoryId: number | null;
  archived: boolean;
  order: number;
  createdAt: string;
}
```

`RoutineView` (с `done`/`days`) приходит только из `GET /routines` и с эндпоинтов отметок; создание и обновление отдают сырую запись без прогресса — типы обязаны это различать.

- [ ] **Step 2: Написать падающие тесты чистых функций**

Создать `frontend/lib/routines.spec.ts`:

```ts
import { isDoneOn, routineRatioColor, unclosedRoutines, weekDays } from './routines';
import type { RoutineView } from '@/types/api';

function routine(over: Partial<RoutineView>): RoutineView {
  return {
    id: over.id ?? 1, title: over.title ?? 'Позаниматься в качалке',
    weeklyGoal: over.weeklyGoal ?? 3, categoryId: over.categoryId ?? null,
    done: over.done ?? 0, days: over.days ?? [], order: over.order ?? 0,
  };
}

describe('weekDays', () => {
  it('отдаёт семь дат от понедельника до воскресенья', () => {
    expect(weekDays('2026-08-10')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16',
    ]);
  });

  it('корректно переходит через границу месяца', () => {
    expect(weekDays('2026-08-31')[6]).toBe('2026-09-06');
  });
});

describe('isDoneOn', () => {
  it('видит отмеченный день', () => {
    expect(isDoneOn(routine({ days: ['2026-08-10', '2026-08-12'] }), '2026-08-12')).toBe(true);
  });

  it('не видит неотмеченный', () => {
    expect(isDoneOn(routine({ days: ['2026-08-10'] }), '2026-08-12')).toBe(false);
  });
});

describe('routineRatioColor', () => {
  it('ноль выполнений — нейтральный фон', () => {
    expect(routineRatioColor(0, 3)).toBe('var(--panel-alt)');
  });

  it('норма выполнена — полный акцент', () => {
    expect(routineRatioColor(3, 3)).toBe('var(--accent)');
  });

  it('перевыполнение — тот же полный акцент, не ошибка', () => {
    expect(routineRatioColor(7, 3)).toBe('var(--accent)');
  });

  it('частичное выполнение бледнее полного', () => {
    expect(routineRatioColor(1, 3)).not.toBe('var(--accent)');
    expect(routineRatioColor(1, 3)).not.toBe('var(--panel-alt)');
  });

  it('норма 0 не роняет расчёт делением на ноль', () => {
    expect(routineRatioColor(0, 0)).toBe('var(--panel-alt)');
  });
});

describe('unclosedRoutines', () => {
  it('считает рутины, не добравшие норму', () => {
    const list = [
      routine({ id: 1, done: 1, weeklyGoal: 3 }),
      routine({ id: 2, done: 3, weeklyGoal: 3 }),
      routine({ id: 3, done: 0, weeklyGoal: 2 }),
    ];
    expect(unclosedRoutines(list)).toBe(2);
  });

  it('перевыполненная не считается недобравшей', () => {
    expect(unclosedRoutines([routine({ done: 7, weeklyGoal: 3 })])).toBe(0);
  });

  it('пустой список даёт ноль', () => {
    expect(unclosedRoutines([])).toBe(0);
  });
});
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd frontend && bunx jest routines.spec.ts`
Expected: FAIL — модуль `./routines` не найден.

- [ ] **Step 4: Написать чистые функции**

Создать `frontend/lib/routines.ts`:

```ts
import type { RoutineView } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

/** Семь дат недели пн–вс, начиная с weekStart. */
export function weekDays(weekStart: string): string[] {
  const start = parseUTC(weekStart);
  return Array.from({ length: 7 }, (_, i) => formatUTC(addDaysUTC(start, i)));
}

export function isDoneOn(routine: RoutineView, date: string): boolean {
  return routine.days.includes(date);
}

/** Цвет по доле выполнения нормы. Перевыполнение — не ошибка, красим как выполненную. */
export function routineRatioColor(done: number, goal: number): string {
  if (done <= 0 || goal <= 0) return 'var(--panel-alt)';
  const ratio = done / goal;
  if (ratio >= 1) return 'var(--accent)';
  if (ratio >= 0.66) return 'rgba(224, 164, 88, 0.55)';
  if (ratio >= 0.33) return 'rgba(224, 164, 88, 0.3)';
  return 'var(--accent-soft)';
}

export function unclosedRoutines(routines: RoutineView[]): number {
  return routines.filter((r) => r.done < r.weeklyGoal).length;
}
```

Промежуточные значения повторяют ступени `categoryHeatmapColor` из `frontend/lib/heatmap.ts` — там тот же янтарный акцент с той же прозрачностью, поэтому две сетки на одном экране выглядят одной системой.

- [ ] **Step 5: Написать клиент API**

В конец `frontend/lib/api.ts` (и дополнить импорт типов в шапке файла именами `RoutineHistoryWeek`, `RoutinesWeek`, `RoutineView`):

```ts
export function getRoutines(week?: string): Promise<RoutinesWeek> {
  return request(week ? `/routines?week=${week}` : `/routines`);
}

export function getRoutinesHistory(weeks = 8): Promise<RoutineHistoryWeek[]> {
  return request(`/routines/history?weeks=${weeks}`);
}

export function createRoutine(title: string, weeklyGoal: number, categoryId: number | null): Promise<Routine> {
  return request(`/routines`, { method: 'POST', body: JSON.stringify({ title, weeklyGoal, categoryId }) });
}

export function updateRoutine(
  id: number,
  patch: { title?: string; weeklyGoal?: number; categoryId?: number | null },
): Promise<Routine> {
  return request(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function archiveRoutine(id: number): Promise<{ id: number }> {
  return request(`/routines/${id}`, { method: 'DELETE' });
}

export function addRoutineLog(id: number, date: string): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log`, { method: 'POST', body: JSON.stringify({ date }) });
}

export function removeRoutineLog(id: number, date: string): Promise<RoutinesWeek> {
  return request(`/routines/${id}/log/${date}`, { method: 'DELETE' });
}
```

- [ ] **Step 6: Запустить тесты и сборку**

Run: `cd frontend && bunx jest routines.spec.ts && bun run build`
Expected: PASS (13 тестов), сборка без ошибок типов.

- [ ] **Step 7: Коммит**

```bash
git add frontend/types/api.ts frontend/lib/api.ts frontend/lib/routines.ts frontend/lib/routines.spec.ts
git commit -m "feat(frontend): типы, клиент и чистая логика рутин"
```

---

### Task 8: Экран рутин — текущая неделя и отметка

**Files:**
- Create: `frontend/components/RoutinesScreen.tsx`
- Create: `frontend/components/RoutinesScreen.module.css`

**Interfaces:**
- Consumes: `getRoutines`, `addRoutineLog`, `removeRoutineLog` из Task 7; `weekDays`, `isDoneOn`; `todayLocal` из `frontend/lib/date.ts`.
- Produces: компонент `RoutinesScreen` (default export, без пропсов) — его монтирует Task 10.

Компонент сам фетчит данные на маунте, по образцу `frontend/components/TaskTemplatesTab.tsx`, а не получает их через состояние `Dashboard`.

- [ ] **Step 1: Написать компонент**

Создать `frontend/components/RoutinesScreen.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { RoutinesWeek } from '@/types/api';
import { addRoutineLog, getRoutines, removeRoutineLog } from '@/lib/api';
import { isDoneOn, weekDays } from '@/lib/routines';
import { todayLocal } from '@/lib/date';
import styles from './RoutinesScreen.module.css';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function RoutinesScreen() {
  const [week, setWeek] = useState<RoutinesWeek | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const today = todayLocal();

  useEffect(() => {
    getRoutines().then(setWeek);
  }, []);

  async function toggle(routineId: number, date: string, done: boolean) {
    if (busy !== null) return;
    setBusy(routineId);
    try {
      setWeek(done ? await removeRoutineLog(routineId, date) : await addRoutineLog(routineId, date));
    } finally {
      setBusy(null);
    }
  }

  if (!week) return <div className={styles.empty}>загрузка…</div>;

  const days = weekDays(week.weekStart);

  return (
    <div className={styles.screen}>
      {week.routines.length === 0 && (
        <div className={styles.empty}>Рутин пока нет — заведи первую ниже.</div>
      )}

      {week.routines.map((r) => {
        const doneToday = isDoneOn(r, today);
        return (
          <div key={r.id} className={styles.row}>
            <div className={styles.title}>{r.title}</div>

            <div className={styles.dots}>
              {days.map((d, i) => {
                const filled = isDoneOn(r, d);
                const future = d > today;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.dot} ${filled ? styles.dotFilled : ''}`}
                    disabled={future || busy !== null}
                    title={`${DAY_LABELS[i]} ${d}`}
                    aria-label={`${r.title}, ${DAY_LABELS[i]}`}
                    onClick={() => toggle(r.id, d, filled)}
                  />
                );
              })}
            </div>

            <div className={`${styles.count} ${r.done >= r.weeklyGoal ? styles.countDone : ''}`}>
              {r.done}/{r.weeklyGoal}
            </div>

            <button
              type="button"
              className={styles.markBtn}
              disabled={busy !== null}
              onClick={() => toggle(r.id, today, doneToday)}
            >
              {doneToday ? '✓ отмечено' : '+ отметить сегодня'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

Будущие дни недели некликабельны: отметить наперёд нельзя. Прошедшие — можно, это штатный способ закрыть вчерашний день.

- [ ] **Step 2: Написать стили**

Создать `frontend/components/RoutinesScreen.module.css`:

```css
.screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.title {
  flex: 1;
  min-width: 140px;
  font-size: 14px;
}

.dots {
  display: flex;
  gap: 4px;
}

.dot {
  width: 14px;
  height: 14px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel-alt);
  cursor: pointer;
}

.dotFilled {
  background: var(--accent);
  border-color: var(--accent);
}

.dot:disabled {
  cursor: default;
  opacity: 0.5;
}

.count {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
  min-width: 40px;
  text-align: right;
}

.countDone {
  color: var(--accent);
}

.markBtn {
  background: none;
  border: 1px solid var(--accent-glow);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
}

.markBtn:disabled {
  opacity: 0.5;
  cursor: default;
}

.empty {
  color: var(--text-dim);
  font-size: 13px;
  padding: 12px 0;
}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит без ошибок типов.

- [ ] **Step 4: Коммит**

```bash
git add frontend/components/RoutinesScreen.tsx frontend/components/RoutinesScreen.module.css
git commit -m "feat(frontend): экран рутин с недельным прогрессом"
```

---

### Task 9: Экран рутин — настройка списка

**Files:**
- Modify: `frontend/components/RoutinesScreen.tsx`
- Modify: `frontend/components/RoutinesScreen.module.css`

**Interfaces:**
- Consumes: `createRoutine`, `updateRoutine`, `archiveRoutine`, `getCategories` из Task 7 и существующего клиента; `RoutinesScreen` из Task 8.
- Produces: ничего для последующих задач.

`getCategories(): Promise<Category[]>` уже существует в `frontend/lib/api.ts:98` — новый клиентский метод для сфер писать не нужно.

- [ ] **Step 1: Добавить состояние и обработчики**

В `frontend/components/RoutinesScreen.tsx` дополнить импорты:

```tsx
import type { Category, RoutinesWeek } from '@/types/api';
import { addRoutineLog, archiveRoutine, createRoutine, getCategories, getRoutines, removeRoutineLog, updateRoutine } from '@/lib/api';
```

и добавить рядом с существующим состоянием:

```tsx
  const [categories, setCategories] = useState<Category[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState(3);
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
```

В существующий `useEffect` добавить второй запрос:

```tsx
  useEffect(() => {
    getRoutines().then(setWeek);
    getCategories().then(setCategories);
  }, []);
```

и обработчики рядом с `toggle`:

```tsx
  async function reload() {
    setWeek(await getRoutines());
  }

  async function add() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    await createRoutine(trimmed, newGoal, newCategoryId);
    setNewTitle('');
    setNewGoal(3);
    setNewCategoryId(null);
    await reload();
  }

  async function patch(id: number, p: { title?: string; weeklyGoal?: number; categoryId?: number | null }) {
    await updateRoutine(id, p);
    await reload();
  }

  async function archive(id: number) {
    await archiveRoutine(id);
    await reload();
  }
```

- [ ] **Step 2: Отрисовать блок настройки**

В `frontend/components/RoutinesScreen.tsx`, после закрывающей скобки `week.routines.map(...)` и до закрывающего `</div>` корневого элемента:

```tsx
      <button type="button" className={styles.settingsToggle} onClick={() => setSettingsOpen(!settingsOpen)}>
        {settingsOpen ? 'Свернуть настройку' : 'Настроить рутины'}
      </button>

      {settingsOpen && (
        <div className={styles.settings}>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.settingsRow}>
              <input
                className={styles.settingsInput}
                defaultValue={r.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== r.title) patch(r.id, { title: v });
                }}
              />
              <label className={styles.settingsLabel}>
                норма
                <input
                  type="number"
                  min={1}
                  max={7}
                  className={styles.settingsNumber}
                  defaultValue={r.weeklyGoal}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 7 && v !== r.weeklyGoal) patch(r.id, { weeklyGoal: v });
                  }}
                />
              </label>
              <select
                className={styles.settingsSelect}
                value={r.categoryId ?? ''}
                onChange={(e) => patch(r.id, { categoryId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">без сферы</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button type="button" className={styles.archiveBtn} onClick={() => archive(r.id)}>
                в архив
              </button>
            </div>
          ))}

          <div className={styles.settingsRow}>
            <input
              className={styles.settingsInput}
              placeholder="Новая рутина…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <label className={styles.settingsLabel}>
              норма
              <input
                type="number"
                min={1}
                max={7}
                className={styles.settingsNumber}
                value={newGoal}
                onChange={(e) => setNewGoal(Number(e.target.value))}
              />
            </label>
            <select
              className={styles.settingsSelect}
              value={newCategoryId ?? ''}
              onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">без сферы</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button type="button" className={styles.markBtn} onClick={add}>
              добавить
            </button>
          </div>
        </div>
      )}
```

Архивирование не спрашивает подтверждения: история выполнения сохраняется, и это не разрушительное действие.

- [ ] **Step 3: Добавить стили**

В `frontend/components/RoutinesScreen.module.css`:

```css
.settingsToggle {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.settingsRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.settingsInput {
  flex: 1;
  min-width: 140px;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--text);
  font-size: 13px;
}

.settingsLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.settingsNumber {
  width: 48px;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 6px;
  color: var(--text);
  font-size: 13px;
}

.settingsSelect {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--text);
  font-size: 13px;
}

.archiveBtn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}
```

- [ ] **Step 4: Проверить сборку**

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 5: Коммит**

```bash
git add frontend/components/RoutinesScreen.tsx frontend/components/RoutinesScreen.module.css
git commit -m "feat(frontend): настройка рутин на своём экране"
```

---

### Task 10: История по неделям и вкладка в интерфейсе

**Files:**
- Modify: `frontend/components/RoutinesScreen.tsx`
- Modify: `frontend/components/RoutinesScreen.module.css`
- Modify: `frontend/components/Dashboard.tsx:35-38` (`TABS`), `:242-253` (рендер вкладок), `:303` (монтирование экранов)

**Interfaces:**
- Consumes: `getRoutinesHistory`, `routineRatioColor`, `unclosedRoutines` из Task 7; `RoutinesScreen` из задач 8-9.
- Produces: третья вкладка `routines` в `Dashboard`.

- [ ] **Step 1: Показать историю на экране рутин**

В `frontend/components/RoutinesScreen.tsx` дополнить импорты (`getRoutinesHistory` к списку из `@/lib/api`, `routineRatioColor` к списку из `@/lib/routines`, тип `RoutineHistoryWeek`), добавить состояние:

```tsx
  const [history, setHistory] = useState<RoutineHistoryWeek[]>([]);
```

в `useEffect` — третий запрос `getRoutinesHistory().then(setHistory);`, а в `reload()` после обновления недели — `setHistory(await getRoutinesHistory());`.

Отрисовать перед блоком настройки:

```tsx
      {history.length > 0 && week.routines.length > 0 && (
        <div className={styles.history}>
          <div className={styles.historyTitle}>Последние {history.length} недель</div>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.historyRow}>
              <div className={styles.historyName}>{r.title}</div>
              <div className={styles.dots}>
                {history.map((w) => {
                  const item = w.items.find((i) => i.routineId === r.id);
                  const done = item?.done ?? 0;
                  const goal = item?.weeklyGoal ?? r.weeklyGoal;
                  return (
                    <span
                      key={w.weekStart}
                      className={styles.weekCell}
                      style={{ background: routineRatioColor(done, goal) }}
                      title={`неделя с ${w.weekStart}: ${done}/${goal}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 2: Добавить стили истории**

В `frontend/components/RoutinesScreen.module.css`:

```css
.history {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.historyTitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.historyRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.historyName {
  flex: 1;
  min-width: 120px;
  font-size: 12px;
  color: var(--text-muted);
}

.weekCell {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--hair);
}
```

- [ ] **Step 3: Добавить вкладку в `Dashboard`**

В `frontend/components/Dashboard.tsx`:

- импорт: `import RoutinesScreen from './RoutinesScreen';` рядом с импортом `GtdScreen`;
- импорты для счётчика: `import { getRoutines } from '@/lib/api';` (дополнить существующий импорт из `@/lib/api`) и `import { unclosedRoutines } from '@/lib/routines';`
- в `TABS` третьим элементом: `{ key: 'routines', label: 'Рутины' },`
- состояние счётчика рядом с остальными: `const [routinesLeft, setRoutinesLeft] = useState(0);`
- отдельный `useEffect` на маунте:

```tsx
  useEffect(() => {
    getRoutines()
      .then((w) => setRoutinesLeft(unclosedRoutines(w.routines)))
      .catch(() => setRoutinesLeft(0));
  }, [activeTab]);
```

Зависимость от `activeTab` нужна, чтобы счётчик обновлялся при уходе с вкладки рутин — отметка меняет его, а `Dashboard` о ней не знает.

- в рендере вкладок подпись становится:

```tsx
              {t.label}
              {t.key === 'routines' && routinesLeft > 0 ? ` ${routinesLeft}` : ''}
```

- монтирование рядом с `{activeTab === 'gtd' && <GtdScreen />}`:

```tsx
      {activeTab === 'routines' && <RoutinesScreen />}
```

- [ ] **Step 4: Проверить сборку и тесты**

Run: `cd frontend && bun run build && bun run test`
Expected: сборка проходит, тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add frontend/components/RoutinesScreen.tsx frontend/components/RoutinesScreen.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): история рутин и вкладка «Рутины»"
```

---

### Task 11: Шаг «Рутины» в воскресном обзоре

**Files:**
- Modify: `frontend/components/WeeklyReview.tsx`
- Modify: `frontend/components/WeeklyReview.module.css`

**Interfaces:**
- Consumes: `getRoutines`, `updateRoutine`, `archiveRoutine` из Task 7; `RoutineView`.
- Produces: ничего для последующих задач.

`WeeklyReview` уже принимает пропсы `items`, `today`, `onClose`, `onChanged`, `onGoToBucket` и содержит очередь протухших задач со стилями `.queue`, `.queueTitle`, `.queueItem`, `.queueName`, `.queueQuestion`, `.queueActions`, `.queueBtn` — переиспользуй их, новых классов заводить не нужно. Рутины компонент фетчит сам: пробрасывать их через `GtdScreen` не надо, это разные подсистемы.

- [ ] **Step 1: Добавить шаг и состояние**

В `frontend/components/WeeklyReview.tsx`:

- расширить тип шага: `type ReviewBucket = 'inbox' | 'backlog' | 'project' | 'waiting' | 'someday' | 'routines';`
- добавить в `STEPS` последним элементом:

```ts
  { key: 'routines', title: 'Рутины', guidance: 'Норма выполнена? Если нет — она реальная?' },
```

- импорты: `import type { GtdItem, RoutineView } from '@/types/api';` и дополнить импорт из `@/lib/api` именами `archiveRoutine`, `getRoutines`, `updateRoutine`;
- состояние и загрузка:

```tsx
  const [routines, setRoutines] = useState<RoutineView[]>([]);
  const [routineBusy, setRoutineBusy] = useState<number | null>(null);
  const [routineError, setRoutineError] = useState<string | null>(null);

  useEffect(() => {
    getRoutines(today).then((w) => setRoutines(w.routines));
  }, [today]);

  const missed = routines.filter((r) => r.done < r.weeklyGoal);

  async function decideRoutine(id: number, action: 'keep' | 'lower' | 'archive', goal: number) {
    if (routineBusy !== null) return;
    setRoutineBusy(id);
    setRoutineError(null);
    try {
      if (action === 'lower') await updateRoutine(id, { weeklyGoal: goal - 1 });
      if (action === 'archive') await archiveRoutine(id);
      // Решённая рутина уходит из очереди при любом исходе. Свежий список нужен
      // только чтобы подтянуть обновлённые значения: если вернуть его как есть,
      // снижение нормы с 3 до 2 при одной отметке снова оставит рутину
      // «недобравшей», и шаг предложит снижать её по кругу до единицы.
      const fresh = action === 'keep' ? routines : (await getRoutines(today)).routines;
      setRoutines(fresh.filter((r) => r.id !== id));
    } catch {
      setRoutineError('Не удалось сохранить решение');
    } finally {
      setRoutineBusy(null);
    }
  }
```

`keep` не шлёт запрос — норма подтверждена как есть, задача шага в том, чтобы решение было принято осознанно, а не записано в базу. Рутина просто уходит из очереди до следующего открытия обзора. Снижение и удаление тоже убирают рутину из очереди: шаг спрашивает один раз, а не переспрашивает после каждого понижения нормы.

`today` (локальная дата, уже приходит пропом) якорит неделю на бэкенде: без него `GET /routines` считает неделю от своей UTC-даты, и в ночные часы обзор спросит про прошлую неделю.

- [ ] **Step 2: Отрисовать очередь рутин**

Внутри `STEPS.map`, рядом с существующим блоком `step.key === 'backlog' && stale.length > 0`:

```tsx
                {step.key === 'routines' && missed.length > 0 && (
                  <div className={styles.queue}>
                    <div className={styles.queueTitle}>не добрали норму: {missed.length}</div>
                    {missed.map((r) => (
                      <div key={r.id} className={styles.queueItem}>
                        <div className={styles.queueName}>
                          «{r.title}» — {r.done} из {r.weeklyGoal} на этой неделе.
                        </div>
                        <div className={styles.queueQuestion}>Норма реальная?</div>
                        <div className={styles.queueActions}>
                          <button
                            type="button"
                            className={styles.queueBtn}
                            disabled={routineBusy === r.id}
                            onClick={() => decideRoutine(r.id, 'keep', r.weeklyGoal)}
                          >
                            Оставить
                          </button>
                          {r.weeklyGoal > 1 && (
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={routineBusy === r.id}
                              onClick={() => decideRoutine(r.id, 'lower', r.weeklyGoal)}
                            >
                              Снизить до {r.weeklyGoal - 1}
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.queueBtn}
                            disabled={routineBusy === r.id}
                            onClick={() => decideRoutine(r.id, 'archive', r.weeklyGoal)}
                          >
                            Удалить рутину
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
```

При норме 1 вариант «Снизить» не показывается: снижать некуда.

- [ ] **Step 3: Не сломать переход по кнопке «Открыть»**

Кнопка «Открыть» у каждого шага вызывает `onGoToBucket(step.key)`, а `routines` — не бакет GTD. Спрятать её для этого шага:

```tsx
                {step.key !== 'routines' && (
                  <button type="button" className={styles.openBtn} onClick={() => onGoToBucket(step.key)}>
                    Открыть
                  </button>
                )}
```

Соответственно сузить тип параметра колбэка обратно до бакетов GTD, чтобы `GtdScreen` не получил невозможное значение:

```ts
  onGoToBucket: (status: Exclude<ReviewBucket, 'routines'>) => void;
```

и в вызове передавать `step.key as Exclude<ReviewBucket, 'routines'>` — блок отрисовывается только когда `step.key !== 'routines'`, так что сужение безопасно.

- [ ] **Step 4: Проверить сборку и тесты**

Run: `cd frontend && bun run build && bun run test`
Expected: сборка проходит, тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add frontend/components/WeeklyReview.tsx
git commit -m "feat(frontend): воскресный обзор спрашивает про недобранные нормы"
```

---

### Task 12: Прогон тестов и живая проверка

**Files:**
- Modify: ничего (только проверка; правки — по факту находок)

**Interfaces:**
- Consumes: всё, сделанное в задачах 1-11.
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

Expected: все четыре сервиса `Up`, postgres `healthy`, миграция `add_routines` применена.

- [ ] **Step 4: Проверить связь со сферой на временных данных**

Реальные записи пользователя не трогать. Создать временную рутину, привязанную к сфере «Спорт» (её `id` взять из `curl -s http://localhost:3001/categories`), отметить её за сегодня и убедиться, что галочка сферы проставилась:

```bash
curl -s -X POST http://localhost:3001/routines -H 'Content-Type: application/json' \
  -d '{"title":"ВРЕМЕННАЯ проверка сферы","weeklyGoal":3,"categoryId":<id сферы Спорт>}'
curl -s -X POST http://localhost:3001/routines/<id рутины>/log -H 'Content-Type: application/json' \
  -d "{\"date\":\"$(date +%F)\"}"
docker compose exec -T postgres psql -U tracker -d tracker -c \
  'select c.label, s.done from "DayCategoryStatus" s join "Category" c on c.id = s."categoryId" join "Day" d on d.id = s."dayId" where d.date = CURRENT_DATE;'
```

Expected: строка со сферой «Спорт» и `done = t`.

Затем снять отметку и убедиться, что галочка сферы **осталась** — это намеренная асимметрия:

```bash
curl -s -X DELETE "http://localhost:3001/routines/<id рутины>/log/$(date +%F)"
docker compose exec -T postgres psql -U tracker -d tracker -c \
  'select c.label, s.done from "DayCategoryStatus" s join "Category" c on c.id = s."categoryId" join "Day" d on d.id = s."dayId" where d.date = CURRENT_DATE;'
```

Expected: `done = t` по-прежнему.

- [ ] **Step 5: Убрать за собой**

```bash
curl -s -X DELETE http://localhost:3001/routines/<id рутины>
docker compose exec -T postgres psql -U tracker -d tracker -c \
  'delete from "RoutineLog" where "routineId" = <id рутины>; delete from "Routine" where id = <id рутины>;'
docker compose exec -T postgres psql -U tracker -d tracker -c 'select count(*) from "Routine";'
```

Expected: временная рутина удалена. Если проверка проставила галочку сферы за сегодня там, где её не было, — сообщить об этом в отчёте, но самому в данных пользователя ничего не откатывать.

- [ ] **Step 6: Проверить в браузере**

Открыть `https://tracker.performance:4888`:

- в верхнем ряду появилась третья вкладка «Рутины»;
- на ней — пусто с приглашением завести первую рутину (если рутин ещё нет);
- «Настроить рутины» разворачивает форму; заведение рутины с нормой 3 и сферой «Спорт» добавляет строку;
- клик по «+ отметить сегодня» заполняет точку текущего дня, счётчик становится `1/3`;
- на главной вкладке сфера «Спорт» за сегодня отмечена;
- будущие дни недели некликабельны, прошедшие — кликабельны;
- в подписи вкладки виден счётчик недобранных рутин;
- кнопка «Недельный обзор» на вкладке GTD открывает модалку, где появился шаг «Рутины» со счётчиком и вопросом про норму.

Проверять надо именно в браузере: `Dashboard` тянет данные в `useEffect`, curl и SSR видят только оболочку «загрузка…». Если автоматизация браузера недоступна — не выдумывать результат, а перечислить в отчёте, что осталось посмотреть человеку.

- [ ] **Step 7: Коммит, если были правки**

```bash
git add -A
git commit -m "fix: правки по итогам живой проверки"
```

Если правок не потребовалось — шаг пропускается.

---

## Что осталось за рамками этого плана

- Расписание по конкретным дням недели (пн/ср/пт) — решено делать только норму.
- Несколько отметок за один день.
- Версионирование нормы и пересчёт истории при её изменении.
- Отметка рутин с главного экрана дня.
- Напоминания и уведомления по рутинам.
- Перенос существующих категорий в рутины — сферы остаются как есть.
- Автоматический перенос GTD-задачи в рутины («сходить в качалку» → рутина) — руками.
