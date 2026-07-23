# GTD мост B1 — backend + миграция — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести `plannedDate` в `GtdItem`, смигрировать существующие `DailyTask` в `GtdItem`, отдавать «сегодняшний срез GTD» через `DayView.today`, и ретайрить backend-часть `DailyTask` (эндпоинты dailies + `GET /tasks`).

**Architecture:** Additive-миграция + data-миграция `DailyTask→GtdItem`. `GtdService` получает `plannedDate` (в update/view), метод `getForDate` (planned=date ∪ calendar-scheduledDate=date, кроме archived) и `createForDate` (backlog+planned). `DaysService.getDay` заменяет `dailies` на `today = gtdService.getForDate(date)`. Модуль `dailies` и `GET /tasks` удаляются.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Bun, Jest. Спека: `docs/superpowers/specs/2026-07-23-gtd-bridge-design.md`.

## Global Constraints

- Пакетный менеджер/рантайм — **Bun** (`bunx jest`, `bunx prisma …`, `bun run build`).
- API-даты — строки `YYYY-MM-DD` через `formatDate`; парсинг/валидация входящих дат — через `parseDateParam` (единый источник правды, ловит календарный перекрут).
- Сервисные тесты мокают `PrismaService` напрямую, без `@nestjs/testing`.
- `GtdItem`-статусы (9): inbox, backlog, calendar, someday, waiting, project, reference, done, archived.
- `DailyTask`-таблица НЕ удаляется (страховка) — только перестаёт использоваться кодом.
- После B1 фронт временно сломан по типам (`DayView.dailies` исчез) — это ожидаемо, чинится планом B2.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** `bun install` в `backend/`; postgres поднят на `localhost:5434`; `backend/.env` с `DATABASE_URL`. Команды — из `backend/`.

---

### Task 1: Схема `plannedDate` + миграция с data-переносом `DailyTask→GtdItem`

**Files:**
- Modify: `backend/prisma/schema.prisma` (поле `plannedDate` в `GtdItem`)
- Create (генерится, затем правится вручную): `backend/prisma/migrations/<ts>_add_gtd_planned_date_and_migrate_dailies/migration.sql`

**Interfaces:**
- Produces: столбец `GtdItem.plannedDate date NULL`; существующие `DailyTask` скопированы в `GtdItem`.

- [ ] **Step 1: Добавить поле в схему**

В `backend/prisma/schema.prisma` в модель `GtdItem` добавить (рядом со `scheduledDate`):

```prisma
  plannedDate   DateTime? @db.Date
```

- [ ] **Step 2: Сгенерировать миграцию без применения**

Run (из `backend/`): `bunx prisma migrate dev --create-only --name add_gtd_planned_date_and_migrate_dailies`
Expected: создан каталог миграции с `migration.sql`, содержащим `ALTER TABLE "GtdItem" ADD COLUMN "plannedDate" DATE;` (не применён).

- [ ] **Step 3: Дописать data-миграцию в `migration.sql`**

В конец сгенерированного `backend/prisma/migrations/<ts>_add_gtd_planned_date_and_migrate_dailies/migration.sql` добавить:

```sql
-- Data migration: copy existing DailyTask rows into GtdItem (DailyTask table left intact as a safety net)
INSERT INTO "GtdItem" (title, status, "plannedDate", "completedAt", "order", "createdAt", "updatedAt")
SELECT dt.text,
       (CASE WHEN dt.done THEN 'done' ELSE 'backlog' END)::"GtdStatus",
       d.date,
       (CASE WHEN dt.done THEN d.date::timestamp ELSE NULL END),
       dt."order",
       dt."createdAt",
       now()
FROM "DailyTask" dt
JOIN "Day" d ON d.id = dt."dayId";
```

- [ ] **Step 4: Применить миграцию**

Run (из `backend/`): `bunx prisma migrate dev`
Expected: миграция применяется, клиент перегенерирован, `Your database is now in sync`. Если prisma сообщает о дрейфе/сбросе — STOP, не сбрасывать БД.

- [ ] **Step 5: Проверить перенос данных**

Run (из `backend/`):
```bash
bunx prisma migrate status
docker compose -f ../docker-compose.yml exec -T postgres psql -U tracker -d tracker -c "SELECT (SELECT count(*) FROM \"DailyTask\") AS dailytasks, (SELECT count(*) FROM \"GtdItem\" WHERE \"plannedDate\" IS NOT NULL) AS migrated;"
```
Expected: `migrate status` — up to date; число `migrated` (GtdItem с plannedDate) равно числу `dailytasks`.

- [ ] **Step 6: Коммит**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): GtdItem.plannedDate + migrate DailyTask rows into GtdItem"
```

---

### Task 2: `GtdService` — `plannedDate` (view/update), `getForDate`, `createForDate`, `POST /gtd/items/today`

**Files:**
- Modify: `backend/src/gtd/gtd.service.ts` (`GtdItemView.plannedDate`, `toView`, `update` handles `plannedDate`, new `getForDate`/`createForDate`)
- Modify: `backend/src/gtd/dto/update-gtd-item.dto.ts` (`plannedDate`)
- Create: `backend/src/gtd/dto/create-today-dto.ts` (`CreateTodayDto`)
- Modify: `backend/src/gtd/gtd.controller.ts` (`POST /gtd/items/today`)
- Test: `backend/src/gtd/gtd.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `formatDate`, `parseDateParam` from `../common/date.util`.
- Produces:
  ```ts
  // GtdItemView gains: plannedDate: string | null
  // GtdService.getForDate(dateStr: string): Promise<GtdItemView[]>
  // GtdService.createForDate(title: string, dateStr: string): Promise<GtdItem>
  // update patch gains: plannedDate?: string | null
  // HTTP: POST /gtd/items/today { title, date } -> GtdItem
  ```

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/gtd/gtd.service.spec.ts`:

```ts
describe('GtdService.getForDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findMany: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('queries planned-for-date OR calendar-scheduled-for-date, excluding archived', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([]);

    await service.getForDate('2026-07-23');

    const date = new Date('2026-07-23T00:00:00.000Z');
    expect(prisma.gtdItem.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'archived' },
        OR: [{ plannedDate: date }, { status: 'calendar', scheduledDate: date }],
      },
      orderBy: { order: 'asc' },
    });
  });

  it('serializes plannedDate/scheduledDate as strings', async () => {
    prisma.gtdItem.findMany.mockResolvedValue([
      {
        id: 5, title: 'Задача', notes: null, status: 'backlog', parentId: null,
        scheduledDate: null, plannedDate: new Date('2026-07-23T00:00:00.000Z'),
        waitingFor: null, order: 0, completedAt: null,
      },
    ]);

    const result = await service.getForDate('2026-07-23');

    expect(result[0].plannedDate).toBe('2026-07-23');
  });
});

describe('GtdService.createForDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { aggregate: jest.fn(), create: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('creates a backlog item planned for the date', async () => {
    prisma.gtdItem.aggregate.mockResolvedValue({ _max: { order: 2 } });
    prisma.gtdItem.create.mockResolvedValue({ id: 1 });

    await service.createForDate('Сделать презу', '2026-07-23');

    expect(prisma.gtdItem.create).toHaveBeenCalledWith({
      data: {
        title: 'Сделать презу',
        status: 'backlog',
        order: 3,
        plannedDate: new Date('2026-07-23T00:00:00.000Z'),
      },
    });
  });
});

describe('GtdService.update plannedDate', () => {
  let service: GtdService;
  let prisma: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn() } };
    service = new GtdService(prisma);
  });

  it('sets plannedDate from a valid string', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: new Date('2026-07-23T00:00:00.000Z'),
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { plannedDate: '2026-07-23' });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.plannedDate).toEqual(
      new Date('2026-07-23T00:00:00.000Z'),
    );
  });

  it('clears plannedDate on null', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'backlog' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { plannedDate: null });

    expect(prisma.gtdItem.update.mock.calls[0][0].data.plannedDate).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тесты — падают**

Run (из `backend/`): `bunx jest gtd.service.spec.ts -t "getForDate|createForDate|update plannedDate"`
Expected: FAIL — `service.getForDate is not a function` и т.п.

- [ ] **Step 3: Реализовать в `gtd.service.ts`**

Заменить импорт `formatDate`:
```ts
import { formatDate, parseDateParam } from '../common/date.util';
```

В интерфейс `GtdItemView` добавить поле:
```ts
  plannedDate: string | null;
```

В `toView` добавить (рядом со `scheduledDate`):
```ts
      plannedDate: item.plannedDate ? formatDate(item.plannedDate) : null,
```

В `update` добавить обработку `plannedDate` в блоке сбора `data` (после `scheduledDate`):
```ts
if (patch.plannedDate !== undefined) {
  data.plannedDate = patch.plannedDate ? parseDateParam(patch.plannedDate) : null;
}
```
и расширить тип параметра `patch`:
```ts
patch: { title?: string; notes?: string; status?: string; scheduledDate?: string | null; waitingFor?: string | null; plannedDate?: string | null },
```

Добавить методы в класс:
```ts
async getForDate(dateStr: string): Promise<GtdItemView[]> {
  const date = parseDateParam(dateStr);
  const items = await this.prisma.gtdItem.findMany({
    where: {
      status: { not: 'archived' },
      OR: [{ plannedDate: date }, { status: 'calendar', scheduledDate: date }],
    } as any,
    orderBy: { order: 'asc' },
  });
  return items.map((i) => this.toView(i));
}

async createForDate(title: string, dateStr: string) {
  const date = parseDateParam(dateStr);
  const maxOrder = await this.prisma.gtdItem.aggregate({ _max: { order: true } });
  return this.prisma.gtdItem.create({
    data: { title, status: 'backlog', order: (maxOrder._max.order ?? -1) + 1, plannedDate: date },
  });
}
```

- [ ] **Step 4: Запустить тесты — проходят**

Run (из `backend/`): `bunx jest gtd.service.spec.ts`
Expected: PASS (все describe).

- [ ] **Step 5: DTO + роут**

В `backend/src/gtd/dto/update-gtd-item.dto.ts` добавить поле (по образцу `scheduledDate`):
```ts
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'plannedDate must be YYYY-MM-DD' })
  plannedDate?: string | null;
```

Create `backend/src/gtd/dto/create-today-dto.ts`:
```ts
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTodayDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}
```

В `backend/src/gtd/gtd.controller.ts` добавить импорт `CreateTodayDto` и метод (перед `@Post('items')` или после):
```ts
@Post('items/today')
createForDate(@Body() dto: CreateTodayDto) {
  return this.gtdService.createForDate(dto.title, dto.date);
}
```

- [ ] **Step 6: Спек + сборка**

Run (из `backend/`): `bunx jest gtd.service.spec.ts` → PASS; `bun run build` → чисто.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/gtd
git commit -m "feat(backend): gtd plannedDate — getForDate, createForDate, POST /gtd/items/today"
```

---

### Task 3: `DayView.today` из `getForDate` (DaysService + модульная проводка)

**Files:**
- Modify: `backend/src/days/days.service.ts` (`DayView` поле `today`, конструктор + `getDay`)
- Modify: `backend/src/days/days.module.ts` (импорт `GtdModule`)
- Modify: `backend/src/gtd/gtd.module.ts` (экспорт `GtdService`)
- Test: `backend/src/days/days.service.spec.ts`

**Interfaces:**
- Consumes: `GtdService.getForDate` (Task 2), `GtdItemView`.
- Produces: `DayView.today: GtdItemView[]` вместо `DayView.dailies`.

- [ ] **Step 1: Экспортировать `GtdService`**

В `backend/src/gtd/gtd.module.ts` добавить `exports`:
```ts
@Module({
  controllers: [GtdController],
  providers: [GtdService],
  exports: [GtdService],
})
```

- [ ] **Step 2: Обновить тесты `getDay`**

В `backend/src/days/days.service.spec.ts` в `describe('DaysService.getDay', …)`:
- Конструктор теперь трёхаргументный. Во всех `new DaysService(prisma, categoriesService)` в этом describe передать третий аргумент — мок gtdService: добавить в `beforeEach` `gtdService = { getForDate: jest.fn().mockResolvedValue([]) };` и строить `service = new DaysService(prisma, categoriesService, gtdService);`.
- Убрать из моков `day.findUnique`/`create` поле `dailies` и убрать ассерты `result.dailies[...]`. Вместо них добавить один тест:
```ts
it('returns today\'s gtd slice from getForDate', async () => {
  prisma.day.findUnique.mockResolvedValue({
    date: new Date('2026-07-15T00:00:00.000Z'),
    youtubeMinutes: 0, pomodoros: 0, eveningClosed: false, rating: null, comment: null,
    categories: [],
  });
  gtdService.getForDate.mockResolvedValue([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);

  const result = await service.getDay('2026-07-15');

  expect(gtdService.getForDate).toHaveBeenCalledWith('2026-07-15');
  expect(result.today).toEqual([{ id: 9, title: 'Из бэклога', status: 'backlog', plannedDate: '2026-07-15' }]);
  expect((result as any).dailies).toBeUndefined();
});
```
- В `describe('DaysService.getHistory', …)`: конструктор `new DaysService(prisma, {} as any)` → `new DaysService(prisma, {} as any, {} as any)` (getHistory gtdService не использует).

- [ ] **Step 3: Запустить тесты — падают**

Run (из `backend/`): `bunx jest days.service.spec.ts`
Expected: FAIL (конструктор/`today`).

- [ ] **Step 4: Реализовать в `days.service.ts`**

- Импорт: `import { GtdService, GtdItemView } from '../gtd/gtd.service';`
- В `DayView` заменить строку `dailies: {...}[]` на:
```ts
  today: GtdItemView[];
```
- Конструктор — добавить третий провайдер:
```ts
constructor(
  private prisma: PrismaService,
  private categoriesService: CategoriesService,
  private gtdService: GtdService,
) {}
```
- В `getDay`: убрать `dailies` из обоих `include` (оставить `include: { categories: true }`), и заменить mapping. Вместо блока `dailies: day.dailies.map(...)` вернуть `today`:
```ts
const today = await this.gtdService.getForDate(formatDate(day.date));
return {
  date: formatDate(day.date),
  youtubeMinutes: day.youtubeMinutes,
  pomodoros: day.pomodoros,
  eveningClosed: day.eveningClosed,
  rating: day.rating,
  comment: day.comment,
  categories: activeCategories.map((c) => ({
    key: c.key,
    label: c.label,
    done: statusByCategoryId.get(c.id)?.done ?? false,
  })),
  today,
};
```

- В `backend/src/days/days.module.ts` импортировать `GtdModule`:
```ts
import { GtdModule } from '../gtd/gtd.module';
// ...
@Module({
  imports: [CategoriesModule, GtdModule],
  controllers: [DaysController],
  providers: [DaysService],
  exports: [DaysService],
})
```

- [ ] **Step 5: Тесты + сборка**

Run (из `backend/`): `bunx jest days.service.spec.ts` → PASS; `bun run build` → чисто.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/days backend/src/gtd/gtd.module.ts
git commit -m "feat(backend): DayView.today from gtd getForDate (replaces dailies)"
```

---

### Task 4: Ретайр backend `DailyTask` — удалить модуль dailies и `GET /tasks`

**Files:**
- Delete: `backend/src/dailies/` (весь каталог: module/controller/service/dto/spec)
- Modify: `backend/src/app.module.ts` (убрать `DailiesModule`)

**Interfaces:**
- Consumes: ничего (удаление). Produces: эндпоинты dailies и `GET /tasks` больше не существуют; `DaysService` от `DailiesService` не зависит (Task 3 уже убрал `dailies` из `getDay`).

- [ ] **Step 1: Проверить отсутствие внешних ссылок**

Run (из `backend/`):
```bash
grep -rn "DailiesModule\|DailiesService\|CarryCandidate\|getAllTasks" src --include=*.ts | grep -v "src/dailies/"
```
Expected: единственные совпадения — импорт/регистрация `DailiesModule` в `src/app.module.ts`. Если есть другие — STOP и разобраться (Task 3 должен был убрать зависимость `getDay` от dailies).

- [ ] **Step 2: Удалить модуль и разрегистрировать**

```bash
rm -rf src/dailies
```
В `backend/src/app.module.ts` удалить строку `import { DailiesModule } from './dailies/dailies.module';` и элемент `DailiesModule,` из массива `imports`.

- [ ] **Step 3: Сборка + весь тест-сьют**

Run (из `backend/`): `bun run build` → чисто (никаких ссылок на удалённое); `bunx jest` → все спеки зелёные (dailies-спека удалена вместе с каталогом).

- [ ] **Step 4: Smoke — старые эндпоинты исчезли, новые живут**

Run (из `backend/`, при поднятом стенде — необязательно для гейта, но желательно):
```bash
curl -s -o /dev/null -w "GET /tasks -> %{http_code}\n" http://localhost:3001/tasks   # ожидаем 404
```
(Полный smoke — после пересборки контейнера контроллером.)

- [ ] **Step 5: Коммит**

```bash
git add -A backend/src/dailies backend/src/app.module.ts
git commit -m "refactor(backend): retire dailies module + GET /tasks (superseded by gtd today)"
```

---

## Self-Review

**Spec coverage:**
- `plannedDate` в `GtdItem` + миграция → Task 1. ✅
- Data-миграция `DailyTask→GtdItem` (done→done+completedAt, else→backlog, plannedDate=Day.date) → Task 1 Step 3. ✅
- `plannedDate` в update-DTO/`GtdItemView`/`toView` через `parseDateParam` → Task 2. ✅
- `getForDate` (planned=date ∪ calendar-scheduled=date, кроме archived) → Task 2. ✅
- `createForDate` + `POST /gtd/items/today` (backlog+planned) → Task 2. ✅
- `DayView.today` вместо `dailies` + модульная проводка (GtdModule экспорт/импорт) → Task 3. ✅
- Ретайр dailies-эндпоинтов + `GET /tasks`, `DailyTask`-таблица цела → Task 4. ✅
- Вне объёма (DROP DailyTask, фронт, Этап C) — не трогается. ✅

**Placeholder scan:** конкретный код/SQL/команды в каждом шаге; `<ts>` в пути миграции — это реальный генерируемый timestamp, не заглушка.

**Type consistency:** `GtdItemView` расширяется `plannedDate: string|null` в Task 2 и используется как тип `DayView.today` в Task 3. `getForDate(dateStr): Promise<GtdItemView[]>` совпадает в Task 2 (объявление) и Task 3 (потребление). Конструктор `DaysService` трёхаргументный — обновлён и в коде (Task 3 Step 4), и во всех тест-конструкторах (Task 3 Step 2). `update` patch-тип расширен `plannedDate?` согласованно с DTO.
