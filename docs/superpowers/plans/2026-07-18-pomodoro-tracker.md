# Pomodoro Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить ежедневный трекер помидорок (ручной счётчик) с 30-дневным градиентным хитмапом, двумя сериями (≥4 и ≥8), вечерним напоминанием и редактированием прошлых дней.

**Architecture:** Близнец существующего YouTube-трекинга: числовое per-day поле `Day.pomodoros`, инкремент/сброс через `PATCH /days/:date/pomodoros`, значение прокидывается в `DayView` и `HistoryEntry`. Фронт считает хитмап и обе серии из уже загруженной 84-дневной `/history` — новых stats-эндпоинтов нет. Отличие от YouTube: два зашитых порога (минимум 4, оптимум 8) и сквозная визуальная иерархия «оптимум светится ярче минимума».

**Tech Stack:** NestJS + Prisma (Postgres), Next.js App Router (React, CSS Modules), Bun, Jest.

## Global Constraints

- Пакетный менеджер и раннер — **Bun** везде (`bun install` / `bun run` / `bunx`), не npm/yarn.
- Пороги зашиты константами: `POMODORO_MIN = 4`, `POMODORO_OPT = 8`. В `Settings`/БД не хранятся.
- Никаких хардкод-цветов в CSS — только существующие токены из `app/globals.css` (`--panel`, `--panel-alt`, `--accent`, `--accent-soft`, `--accent-glow`, `--border`, `--text`, `--text-muted`, `--text-dim`, `--font-mono`).
- Никаких UI-библиотек (recharts — единственное исключение, здесь не используется).
- Текст интерфейса — на русском.
- Чистая логика живёт в `frontend/lib/*.ts` и покрывается тестами (TDD). Компоненты юнит-тестами в этом проекте не покрываются — проверяются сборкой (`bunx tsc --noEmit`) и вручную в браузере.
- Даты — только через существующие хелперы (`lib/date.ts` на фронте, `common/date.util.ts` на бэке). Новых date-утилит не вводить.
- Коммиты — **без** AI-трейлера (`Co-Authored-By: Claude…` и любых AI-атрибуций).
- Работать в отдельной ветке (напр. `feat/pomodoro-tracker`), не в `master` напрямую.

## File Structure

**Backend**
- `backend/prisma/schema.prisma` — modify: поле `pomodoros Int @default(0)` в `Day`.
- `backend/prisma/migrations/<ts>_add_day_pomodoros/migration.sql` — create: миграция (генерится Prisma).
- `backend/src/days/days.service.ts` — modify: `pomodoros` в `DayView`/`getDay`, в `HistoryEntry`/`getHistory`, новый метод `updatePomodoros`.
- `backend/src/days/dto/update-pomodoros.dto.ts` — create: `UpdatePomodorosDto`.
- `backend/src/days/days.controller.ts` — modify: маршрут `PATCH /days/:date/pomodoros`.
- `backend/src/days/days.service.spec.ts` — modify: тесты `updatePomodoros`, `pomodoros` в getDay/getHistory.

**Frontend — logic**
- `frontend/types/api.ts` — modify: `pomodoros` в `DayView` и `HistoryEntry`.
- `frontend/lib/api.ts` — modify: `updatePomodoros(...)`.
- `frontend/lib/streak.ts` — modify: вынести общий `streakByThreshold`, `computeStreak` → тонкая обёртка.
- `frontend/lib/pomodoro.ts` — create: константы `POMODORO_MIN`/`POMODORO_OPT`, `computePomodoroStreak`.
- `frontend/lib/heatmap.ts` — modify: `pomodoroHeatmapColor`.
- `frontend/lib/api.spec.ts`, `frontend/lib/pomodoro.spec.ts`, `frontend/lib/heatmap.spec.ts` — тесты.

**Frontend — UI**
- `frontend/components/PomodoroPanel.tsx` + `.module.css` — create: верхняя панель-счётчик.
- `frontend/components/PomodoroHeatmap.tsx` + `.module.css` — create: 30-дневный хитмап.
- `frontend/components/StatsPanel.tsx` — modify: подключить `PomodoroHeatmap`.
- `frontend/components/Dashboard.tsx` — modify: состояние/хендлеры/серии/уведомление/панель.
- `frontend/components/DayDetailModal.tsx` — modify: просмотр + редактирование помидорок прошлого дня.

---

### Task 1: Prisma-поле `Day.pomodoros` + миграция

**Files:**
- Modify: `backend/prisma/schema.prisma:19-29` (модель `Day`)
- Create: `backend/prisma/migrations/<timestamp>_add_day_pomodoros/migration.sql` (генерится Prisma)

**Interfaces:**
- Produces: колонка `Day.pomodoros Int NOT NULL DEFAULT 0`; сгенерированный Prisma Client с полем `pomodoros`.

- [ ] **Step 1: Поднять Postgres (нужен для `migrate dev`)**

Run (из корня репо):
```bash
docker compose up -d postgres
```
Expected: контейнер `postgres` в состоянии healthy/running.

- [ ] **Step 2: Добавить поле в схему**

В `backend/prisma/schema.prisma`, модель `Day`, добавить строку после `youtubeMinutes`:
```prisma
model Day {
  id             Int      @id @default(autoincrement())
  date           DateTime @unique @db.Date
  youtubeMinutes Int      @default(0)
  pomodoros      Int      @default(0)
  eveningClosed  Boolean  @default(false)
  rating         Int?
  comment        String?
  categories     DayCategoryStatus[]
  dailies        DailyTask[]
  createdAt      DateTime @default(now())
}
```

- [ ] **Step 3: Создать и применить миграцию**

Run (из `backend/`, с `.env` где `DATABASE_URL` указывает на `localhost:5434`):
```bash
cd backend && bunx prisma migrate dev --name add_day_pomodoros
```
Expected: создан каталог `prisma/migrations/<ts>_add_day_pomodoros/` с `migration.sql`, содержащим `ALTER TABLE "Day" ADD COLUMN "pomodoros" INTEGER NOT NULL DEFAULT 0;`; клиент перегенерирован; вывод `Your database is now in sync with your schema.`

- [ ] **Step 4: Убедиться, что проект собирается с новым клиентом**

Run (из `backend/`):
```bash
bun run build
```
Expected: `nest build` завершается без ошибок TypeScript.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): add Day.pomodoros column"
```

---

### Task 2: Backend — `pomodoros` в API дня и истории + инкремент/сброс

**Files:**
- Modify: `backend/src/days/days.service.ts` (интерфейсы `DayView`/`HistoryEntry`, `getDay`, `getHistory`, новый `updatePomodoros`)
- Create: `backend/src/days/dto/update-pomodoros.dto.ts`
- Modify: `backend/src/days/days.controller.ts`
- Test: `backend/src/days/days.service.spec.ts`

**Interfaces:**
- Consumes: `Day.pomodoros` (Task 1).
- Produces:
  - `DayView.pomodoros: number`, `HistoryEntry.pomodoros: number`.
  - `DaysService.updatePomodoros(dateStr: string, delta?: number, reset?: boolean): Promise<DayView>` — клампится в 0.
  - Маршрут `PATCH /days/:date/pomodoros`, тело `{ delta?: number; reset?: boolean }`, ответ `DayView`.

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/days/days.service.spec.ts` добавить новый блок в конце файла:
```ts
describe('DaysService.updatePomodoros', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 5 }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 5, pomodoros: 3 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DaysService(prisma, {} as any);
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);
  });

  it('increments the count by the given delta', async () => {
    await service.updatePomodoros('2026-07-18', 1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 4 } });
  });

  it('clamps the count at zero on a negative delta', async () => {
    prisma.day.findUniqueOrThrow.mockResolvedValue({ id: 5, pomodoros: 0 });
    await service.updatePomodoros('2026-07-18', -1);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });

  it('resets the count to zero when reset is true', async () => {
    await service.updatePomodoros('2026-07-18', undefined, true);
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { pomodoros: 0 } });
  });
});
```

Ещё добавить проверку `pomodoros` в существующий блок `DaysService.getHistory` — новый `it`:
```ts
it('exposes the day row\'s pomodoro count, defaulting to 0', async () => {
  const today = new Date(Date.UTC(2026, 6, 15));
  prisma.day.findMany.mockResolvedValue([{ date: today, youtubeMinutes: 0, pomodoros: 6, categories: [] }]);
  prisma.category.findMany.mockResolvedValue([]);
  prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

  const [entry] = await service.getHistory(1);

  expect(entry.pomodoros).toBe(6);
});
```

И проверку `pomodoros` в getDay — новый `it` в блоке `DaysService.getDay`:
```ts
it('exposes the pomodoro count from the day row', async () => {
  prisma.day.findUnique.mockResolvedValue({
    date: new Date('2026-07-15T00:00:00.000Z'),
    youtubeMinutes: 0,
    pomodoros: 2,
    eveningClosed: false,
    rating: null,
    comment: null,
    categories: [],
    dailies: [],
  });

  const result = await service.getDay('2026-07-15');

  expect(result.pomodoros).toBe(2);
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run (из `backend/`):
```bash
bunx jest days.service.spec.ts
```
Expected: FAIL — `updatePomodoros is not a function`, и `entry.pomodoros`/`result.pomodoros` === `undefined`.

- [ ] **Step 3: Реализовать в сервисе**

В `backend/src/days/days.service.ts`:

(a) В интерфейс `DayView` добавить поле после `youtubeMinutes`:
```ts
  youtubeMinutes: number;
  pomodoros: number;
```

(b) В интерфейс `HistoryEntry` добавить поле:
```ts
  completed: number;
  total: number;
  pomodoros: number;
  ytOver: boolean;
  rating: number | null;
```

(c) В `getDay`, в возвращаемый объект, после `youtubeMinutes: day.youtubeMinutes,`:
```ts
      youtubeMinutes: day.youtubeMinutes,
      pomodoros: day.pomodoros,
```

(d) В `getHistory`, в `result.push({...})`, после `total: activeSet.length,`:
```ts
        completed,
        total: activeSet.length,
        pomodoros: day?.pomodoros ?? 0,
        ytOver: youtubeMinutes > budget,
```

(e) Новый метод сразу после `updateYoutube`:
```ts
  async updatePomodoros(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextCount = reset ? 0 : Math.max(0, day.pomodoros + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { pomodoros: nextCount } });
    return this.getDay(dateStr);
  }
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run (из `backend/`):
```bash
bunx jest days.service.spec.ts
```
Expected: PASS (все тесты, включая существующие).

- [ ] **Step 5: Добавить DTO**

Create `backend/src/days/dto/update-pomodoros.dto.ts`:
```ts
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdatePomodorosDto {
  @IsOptional()
  @IsInt()
  delta?: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
```

- [ ] **Step 6: Добавить маршрут в контроллер**

В `backend/src/days/days.controller.ts`:

(a) Импорт рядом с `UpdateYoutubeDto`:
```ts
import { UpdatePomodorosDto } from './dto/update-pomodoros.dto';
```

(b) Метод сразу после `updateYoutube` (важно: до generic `@Patch('days/:date')`):
```ts
  @Patch('days/:date/pomodoros')
  updatePomodoros(@Param('date') date: string, @Body() dto: UpdatePomodorosDto) {
    return this.daysService.updatePomodoros(date, dto.delta, dto.reset);
  }
```

- [ ] **Step 7: Собрать бэкенд**

Run (из `backend/`):
```bash
bun run build
```
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add backend/src/days
git commit -m "feat(backend): expose pomodoros in day/history and add increment endpoint"
```

---

### Task 3: Frontend — типы + API-клиент `updatePomodoros`

**Files:**
- Modify: `frontend/types/api.ts` (`DayView`, `HistoryEntry`)
- Modify: `frontend/lib/api.ts`
- Test: `frontend/lib/api.spec.ts`

**Interfaces:**
- Consumes: backend-ответы `DayView`/`HistoryEntry` с полем `pomodoros` (Task 2).
- Produces:
  - `DayView.pomodoros: number`, `HistoryEntry.pomodoros: number`.
  - `updatePomodoros(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView>`.

- [ ] **Step 1: Написать падающий тест**

В `frontend/lib/api.spec.ts` добавить импорт и тест:
```ts
import { getDay, updatePomodoros } from './api';
```
```ts
it('sends a PATCH to the pomodoros endpoint with the given body', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ date: '2026-07-18', pomodoros: 1 }),
  }) as unknown as typeof fetch;

  await updatePomodoros('2026-07-18', { delta: 1 });

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:3001/days/2026-07-18/pomodoros',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ delta: 1 }) }),
  );
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run (из `frontend/`):
```bash
bunx jest api.spec.ts
```
Expected: FAIL — `updatePomodoros is not a function`.

- [ ] **Step 3: Реализовать**

(a) В `frontend/types/api.ts`, `DayView`, после `youtubeMinutes`:
```ts
  youtubeMinutes: number;
  pomodoros: number;
```
(b) В `frontend/types/api.ts`, `HistoryEntry`, после `total`:
```ts
  completed: number;
  total: number;
  pomodoros: number;
  ytOver: boolean;
  rating: number | null;
```
(c) В `frontend/lib/api.ts`, сразу после `updateYoutube`:
```ts
export function updatePomodoros(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/pomodoros`, { method: 'PATCH', body: JSON.stringify(data) });
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run (из `frontend/`):
```bash
bunx jest api.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/types/api.ts frontend/lib/api.ts frontend/lib/api.spec.ts
git commit -m "feat(frontend): add pomodoros to types and api client"
```

---

### Task 4: Frontend — обобщённый стрик + `computePomodoroStreak`

**Files:**
- Modify: `frontend/lib/streak.ts`
- Create: `frontend/lib/pomodoro.ts`
- Test: `frontend/lib/streak.spec.ts` (существующий — регрессионная страховка), `frontend/lib/pomodoro.spec.ts` (новый)

**Interfaces:**
- Consumes: `HistoryEntry` с полем `pomodoros` (Task 3).
- Produces:
  - `streakByThreshold<T extends { date: string }>(history: T[], todayDate: string, todayValue: number, getValue: (e: T) => number, threshold: number): number` (экспорт из `streak.ts`).
  - `POMODORO_MIN = 4`, `POMODORO_OPT = 8`.
  - `computePomodoroStreak(history: HistoryEntry[], today: { date: string; pomodoros: number }, threshold: number): number`.

- [ ] **Step 1: Рефакторинг `streak.ts` под общий хелпер (существующие тесты — страховка)**

Заменить тело `frontend/lib/streak.ts` (сохраняя комментарий-обоснование про `today`):
```ts
import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export const STREAK_THRESHOLD = 2;

export interface TodayCompletion {
  date: string;
  completed: number;
}

// Общий backward-loop для серий по порогу. Сегодняшняя запись из history
// исключается: цикл идёт с вчера и никогда не заходит на today.date, а
// сегодняшнее значение берётся из todayValue (свежий live-параметр), не из
// возможно устаревшей записи history за ту же дату.
export function streakByThreshold<T extends { date: string }>(
  history: T[],
  todayDate: string,
  todayValue: number,
  getValue: (entry: T) => number,
  threshold: number,
): number {
  const map = new Map(history.filter((h) => h.date !== todayDate).map((h) => [h.date, h]));

  let streak = 0;
  let cursor = addDaysUTC(parseUTC(todayDate), -1);
  while (true) {
    const rec = map.get(formatUTC(cursor));
    if (rec && getValue(rec) >= threshold) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    } else {
      break;
    }
  }

  if (todayValue >= threshold) {
    streak++;
  }

  return streak;
}

export function computeStreak(history: HistoryEntry[], today: TodayCompletion): number {
  return streakByThreshold(history, today.date, today.completed, (h) => h.completed, STREAK_THRESHOLD);
}
```

- [ ] **Step 2: Прогнать существующие тесты стрика — убедиться, что рефакторинг ничего не сломал**

Run (из `frontend/`):
```bash
bunx jest streak.spec.ts
```
Expected: PASS (все существующие тесты `computeStreak`).

- [ ] **Step 3: Написать падающие тесты `computePomodoroStreak`**

Create `frontend/lib/pomodoro.spec.ts`:
```ts
import { POMODORO_MIN, POMODORO_OPT, computePomodoroStreak } from './pomodoro';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, pomodoros: number): HistoryEntry {
  return { date, completed: 0, total: 6, pomodoros, ytOver: false, rating: null };
}

describe('pomodoro thresholds', () => {
  it('exports 4 and 8', () => {
    expect(POMODORO_MIN).toBe(4);
    expect(POMODORO_OPT).toBe(8);
  });
});

describe('computePomodoroStreak', () => {
  it('counts consecutive days at or above the threshold, ending yesterday', () => {
    const history = [entry('2026-07-15', 4), entry('2026-07-16', 5), entry('2026-07-17', 8)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 0 }, 4)).toBe(3);
  });

  it('adds today only when today meets the threshold', () => {
    // Вчера (17) ниже порога 8 → backward-loop сразу обрывается, в серию идёт
    // только сегодня. День-позавчера (16) с 8 недостижим из-за обрыва.
    const history = [entry('2026-07-16', 8), entry('2026-07-17', 3)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 8 }, 8)).toBe(1);
  });

  it('breaks at the first day below the threshold looking backward', () => {
    const history = [entry('2026-07-15', 8), entry('2026-07-16', 3), entry('2026-07-17', 8)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 8 }, 8)).toBe(2);
  });

  it('treats a day with no history record as broken', () => {
    const history = [entry('2026-07-17', 4)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 4 }, 4)).toBe(2);
  });

  it('uses the live today value over a stale same-date history record', () => {
    const history = [entry('2026-07-16', 4), entry('2026-07-17', 4), entry('2026-07-18', 0)];
    expect(computePomodoroStreak(history, { date: '2026-07-18', pomodoros: 4 }, 4)).toBe(3);
  });
});
```

- [ ] **Step 4: Запустить — убедиться, что падают**

Run (из `frontend/`):
```bash
bunx jest pomodoro.spec.ts
```
Expected: FAIL — модуль `./pomodoro` не найден.

- [ ] **Step 5: Реализовать `pomodoro.ts`**

Create `frontend/lib/pomodoro.ts`:
```ts
import type { HistoryEntry } from '@/types/api';
import { streakByThreshold } from './streak';

export const POMODORO_MIN = 4;
export const POMODORO_OPT = 8;

export interface TodayPomodoros {
  date: string;
  pomodoros: number;
}

export function computePomodoroStreak(history: HistoryEntry[], today: TodayPomodoros, threshold: number): number {
  return streakByThreshold(history, today.date, today.pomodoros, (h) => h.pomodoros, threshold);
}
```

- [ ] **Step 6: Запустить оба спека — убедиться, что проходят**

Run (из `frontend/`):
```bash
bunx jest streak.spec.ts pomodoro.spec.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/streak.ts frontend/lib/pomodoro.ts frontend/lib/pomodoro.spec.ts
git commit -m "feat(frontend): add computePomodoroStreak via shared threshold-streak helper"
```

---

### Task 5: Frontend — `pomodoroHeatmapColor`

**Files:**
- Modify: `frontend/lib/heatmap.ts`
- Test: `frontend/lib/heatmap.spec.ts`

**Interfaces:**
- Produces: `pomodoroHeatmapColor(count: number, min: number, opt: number): string` — только `background`; свечение оптимума — задача компонента (Task 7).

- [ ] **Step 1: Написать падающие тесты**

В `frontend/lib/heatmap.spec.ts` обновить импорт и добавить блок:
```ts
import { categoryHeatmapColor, mondayOffset, pomodoroHeatmapColor, thresholdHeatmapColor, youtubeHeatmapColor } from './heatmap';
```
```ts
describe('pomodoroHeatmapColor', () => {
  it('returns the empty panel color for zero', () => {
    expect(pomodoroHeatmapColor(0, 4, 8)).toBe('var(--panel-alt)');
  });
  it('returns the soft tint below the minimum', () => {
    expect(pomodoroHeatmapColor(3, 4, 8)).toBe('var(--accent-soft)');
  });
  it('returns the dense accent at the minimum', () => {
    expect(pomodoroHeatmapColor(4, 4, 8)).toBe('rgba(224, 164, 88, 0.6)');
  });
  it('stays dense accent just below the optimum', () => {
    expect(pomodoroHeatmapColor(7, 4, 8)).toBe('rgba(224, 164, 88, 0.6)');
  });
  it('returns solid accent at the optimum', () => {
    expect(pomodoroHeatmapColor(8, 4, 8)).toBe('var(--accent)');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run (из `frontend/`):
```bash
bunx jest heatmap.spec.ts
```
Expected: FAIL — `pomodoroHeatmapColor is not a function`.

- [ ] **Step 3: Реализовать**

В конец `frontend/lib/heatmap.ts`:
```ts
export function pomodoroHeatmapColor(count: number, min: number, opt: number): string {
  if (count <= 0) return 'var(--panel-alt)';
  if (count >= opt) return 'var(--accent)';
  if (count >= min) return 'rgba(224, 164, 88, 0.6)';
  return 'var(--accent-soft)';
}
```

- [ ] **Step 4: Запустить — убедиться, что проходят**

Run (из `frontend/`):
```bash
bunx jest heatmap.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/heatmap.ts frontend/lib/heatmap.spec.ts
git commit -m "feat(frontend): add pomodoroHeatmapColor gradient buckets"
```

---

### Task 6: Frontend — компонент `PomodoroPanel`

**Files:**
- Create: `frontend/components/PomodoroPanel.tsx`
- Create: `frontend/components/PomodoroPanel.module.css`

**Interfaces:**
- Consumes: `POMODORO_MIN`, `POMODORO_OPT` (Task 4).
- Produces: `PomodoroPanel` с props `{ count: number; streakMin: number; streakOpt: number; onAdd: (delta: number) => void; onReset: () => void }`.

- [ ] **Step 1: Написать компонент**

Create `frontend/components/PomodoroPanel.tsx`:
```tsx
import styles from './PomodoroPanel.module.css';
import { POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';

interface PomodoroPanelProps {
  count: number;
  streakMin: number;
  streakOpt: number;
  onAdd: (delta: number) => void;
  onReset: () => void;
}

export default function PomodoroPanel({ count, streakMin, streakOpt, onAdd, onReset }: PomodoroPanelProps) {
  const pct = Math.min(100, (count / POMODORO_OPT) * 100);
  const minMarkerPct = (POMODORO_MIN / POMODORO_OPT) * 100;
  const reachedMin = count >= POMODORO_MIN;
  const reachedOpt = count >= POMODORO_OPT;

  let barColor = 'var(--panel-alt)';
  if (reachedOpt) barColor = 'var(--accent)';
  else if (reachedMin) barColor = 'rgba(224, 164, 88, 0.6)';
  else if (count > 0) barColor = 'var(--accent-soft)';

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Помидорки</h2>
      <div className={styles.top}>
        <div className={`${styles.count} ${reachedOpt ? styles.countOpt : ''}`}>
          {count}
          <span className={styles.of}> / {POMODORO_OPT}</span>
        </div>
        <span className={styles.reset} onClick={onReset}>
          сбросить
        </span>
      </div>
      <div className={styles.bar}>
        <div
          className={`${styles.barFill} ${reachedOpt ? styles.barFillOpt : ''}`}
          style={{ width: `${pct}%`, background: barColor }}
        />
        <div className={styles.minMarker} style={{ left: `${minMarkerPct}%` }} />
      </div>
      <div className={styles.caption}>
        минимум {POMODORO_MIN} · оптимум {POMODORO_OPT}
      </div>
      <div className={styles.buttons}>
        <button type="button" onClick={() => onAdd(1)}>
          +1
        </button>
        <button type="button" onClick={() => onAdd(-1)}>
          −1
        </button>
      </div>
      <div className={styles.streaks}>
        <span className={styles.streakMin}>серия ≥{POMODORO_MIN}: {streakMin}</span>
        <span className={`${styles.streakOpt} ${streakOpt > 0 ? styles.streakOptGlow : ''}`}>
          ≥{POMODORO_OPT}: {streakOpt}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Написать CSS-модуль**

Create `frontend/components/PomodoroPanel.module.css`:
```css
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 18px 20px;
}

.heading {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 14px;
  font-weight: 600;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.count {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.countOpt {
  color: var(--accent);
  text-shadow: 0 0 10px var(--accent-glow);
}

.of {
  color: var(--text-dim);
  font-weight: 400;
  font-size: 15px;
}

.reset {
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bar {
  position: relative;
  height: 8px;
  background: var(--panel-alt);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
  border: 1px solid var(--border);
}

.barFill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.25s, background 0.25s;
}

.barFillOpt {
  box-shadow: 0 0 8px var(--accent-glow);
}

.minMarker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--text-dim);
  opacity: 0.7;
}

.caption {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  margin-bottom: 12px;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.buttons button {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-family: var(--font-mono);
  cursor: pointer;
}

.buttons button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.streaks {
  display: flex;
  gap: 14px;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 12px;
}

.streakMin {
  color: var(--accent);
}

.streakOpt {
  color: var(--text-muted);
}

.streakOptGlow {
  color: var(--accent);
  text-shadow: 0 0 8px var(--accent-glow);
  font-weight: 700;
}
```

- [ ] **Step 3: Типизация — убедиться, что компонент компилируется**

Run (из `frontend/`):
```bash
bunx tsc --noEmit
```
Expected: без ошибок (компонент пока не импортирован — проверяется в Task 8, здесь только его собственная валидность типов).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/PomodoroPanel.tsx frontend/components/PomodoroPanel.module.css
git commit -m "feat(frontend): add PomodoroPanel component"
```

---

### Task 7: Frontend — компонент `PomodoroHeatmap` + подключение в `StatsPanel`

**Files:**
- Create: `frontend/components/PomodoroHeatmap.tsx`
- Create: `frontend/components/PomodoroHeatmap.module.css`
- Modify: `frontend/components/StatsPanel.tsx`

**Interfaces:**
- Consumes: `HistoryEntry.pomodoros` (Task 3), `pomodoroHeatmapColor` (Task 5), `POMODORO_MIN`/`POMODORO_OPT` (Task 4).
- Produces: `PomodoroHeatmap` с props `{ history: HistoryEntry[] }`; отрисован внутри `StatsPanel`.

- [ ] **Step 1: Написать компонент**

Create `frontend/components/PomodoroHeatmap.tsx`:
```tsx
'use client';

import styles from './PomodoroHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { pomodoroHeatmapColor } from '@/lib/heatmap';
import { POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';

const DAYS = 30;

interface PomodoroHeatmapProps {
  history: HistoryEntry[];
}

export default function PomodoroHeatmap({ history }: PomodoroHeatmapProps) {
  if (history.length === 0) return null;
  const recent = history.slice(-DAYS);
  const minDays = recent.filter((h) => h.pomodoros >= POMODORO_MIN).length;
  const optDays = recent.filter((h) => h.pomodoros >= POMODORO_OPT).length;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Помидорки · {recent.length} дней</div>
      <div className={styles.grid}>
        {recent.map((h) => (
          <div
            key={h.date}
            className={`${styles.cell} ${h.pomodoros >= POMODORO_OPT ? styles.optimum : ''}`}
            style={{ background: pomodoroHeatmapColor(h.pomodoros, POMODORO_MIN, POMODORO_OPT) }}
            title={`${h.date}: ${h.pomodoros} помидорок`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        ≥{POMODORO_MIN}: {minDays}/{recent.length} дней · ≥{POMODORO_OPT}: {optDays}/{recent.length} дней
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Написать CSS-модуль**

Create `frontend/components/PomodoroHeatmap.module.css`:
```css
.wrap {
  margin-top: 20px;
}

.title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 12px;
  font-weight: 600;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 10px;
}

.cell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  border: 1px solid var(--border);
}

.optimum {
  border-color: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}

.legend {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Подключить в `StatsPanel`**

В `frontend/components/StatsPanel.tsx`:

(a) Импорт после `YoutubeDailyHeatmap`:
```ts
import YoutubeDailyHeatmap from './YoutubeDailyHeatmap';
import PomodoroHeatmap from './PomodoroHeatmap';
```
(b) В разметке после `<YoutubeDailyHeatmap />`:
```tsx
      <YoutubeDailyHeatmap />
      <PomodoroHeatmap history={history} />
```

- [ ] **Step 4: Типизация**

Run (из `frontend/`):
```bash
bunx tsc --noEmit
```
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/PomodoroHeatmap.tsx frontend/components/PomodoroHeatmap.module.css frontend/components/StatsPanel.tsx
git commit -m "feat(frontend): add PomodoroHeatmap to stats panel"
```

---

### Task 8: Frontend — подключение в `Dashboard` (панель, хендлеры, серии, уведомление)

**Files:**
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `updatePomodoros` (Task 3), `computePomodoroStreak`/`POMODORO_MIN`/`POMODORO_OPT` (Task 4), `PomodoroPanel` (Task 6).
- Produces: рабочая панель помидорок на главном экране + вечернее уведомление о недоборе минимума.

- [ ] **Step 1: Импорты**

В `frontend/components/Dashboard.tsx`:

(a) В блок импортов из `@/lib/api` добавить `updatePomodoros`:
```ts
  updateDay,
  updatePomodoros,
  updateYoutube,
```
(b) После импорта `computeStreak`:
```ts
import { computeStreak, STREAK_THRESHOLD } from '@/lib/streak';
import { computePomodoroStreak, POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';
```
(c) После импорта `YoutubePanel`:
```ts
import YoutubePanel from './YoutubePanel';
import PomodoroPanel from './PomodoroPanel';
```

- [ ] **Step 2: Хендлеры**

Сразу после `resetYoutube`:
```ts
  async function addPomodoro(delta: number) {
    setDay(await updatePomodoros(date, { delta }));
    refreshHistory();
  }

  async function resetPomodoro() {
    setDay(await updatePomodoros(date, { reset: true }));
    refreshHistory();
  }
```

- [ ] **Step 3: Уведомление в вечернем окне**

В `useEffect` уведомлений, в функцию `check`, после вечерней ветки закрытия дня:
```ts
      if (isEveningWindow(now) && day && !day.eveningClosed) {
        new Notification('Отметь сферы за сегодня и закрой день');
      }
      if (isEveningWindow(now) && day && day.pomodoros < POMODORO_MIN) {
        new Notification(`Помидорки за день: ${day.pomodoros}/${POMODORO_MIN} — добей минимум`);
      }
```

- [ ] **Step 4: Отрисовать панель в сетке**

В JSX, после `</YoutubePanel>` (закрывающего тега `<YoutubePanel ... />`), внутри `<div className={styles.grid}>`:
```tsx
        <YoutubePanel
          minutes={day.youtubeMinutes}
          budget={settings.youtubeBudget}
          onAdd={addYoutubeMinutes}
          onReset={resetYoutube}
          onBudgetChange={changeYoutubeBudget}
        />
        <PomodoroPanel
          count={day.pomodoros}
          streakMin={computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_MIN)}
          streakOpt={computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_OPT)}
          onAdd={addPomodoro}
          onReset={resetPomodoro}
        />
```

- [ ] **Step 5: Типизация + сборка**

Run (из `frontend/`):
```bash
bunx tsc --noEmit && bun run build
```
Expected: без ошибок.

- [ ] **Step 6: Проверка в браузере**

Поднять стек (`docker compose up -d --build` или локальный dev), открыть `http://localhost:4887`. Убедиться:
- Панель «Помидорки» в верхней сетке (2×2), число `0 / 8`, метка минимума на баре.
- `+1` увеличивает счётчик и заливку; на `4` бар плотнеет, на `8` число и бар «загораются».
- `−1` не уходит ниже 0; «сбросить» обнуляет.
- Серии `≥4`/`≥8` отображаются; `≥8` визуально ярче.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/Dashboard.tsx
git commit -m "feat(frontend): wire pomodoro panel, streaks and evening reminder into dashboard"
```

---

### Task 9: Frontend — помидорки в `DayDetailModal` (просмотр + редактирование прошлого дня)

**Files:**
- Modify: `frontend/components/DayDetailModal.tsx`

**Interfaces:**
- Consumes: `updatePomodoros` (Task 3), `DayView.pomodoros` (Task 3).
- Produces: строка «Помидорок: N» в просмотре и мини-редактор `+1/−1/сбросить` в режиме редактирования.

- [ ] **Step 1: Импорт `updatePomodoros`**

В `frontend/components/DayDetailModal.tsx`, в импорт из `@/lib/api` добавить `updatePomodoros`:
```ts
import { addDaily, carryDailies, deleteDaily, getDay, setCategoryDone, updateDaily, updateDay, updatePomodoros, updateYoutube } from '@/lib/api';
```

- [ ] **Step 2: Хендлеры**

После `resetYoutube`:
```ts
  async function addPomodoro(delta: number) {
    await updatePomodoros(date, { delta });
    await refresh();
  }

  async function resetPomodoro() {
    await updatePomodoros(date, { reset: true });
    await refresh();
  }
```

- [ ] **Step 3: Строка в просмотре**

В блоке `stage === 'view'`, в секции с `YouTube:`, после строки YouTube:
```tsx
              <div className={styles.viewLine}>YouTube: {day.youtubeMinutes} мин</div>
              <div className={styles.viewLine}>Помидорок: {day.pomodoros}</div>
```

- [ ] **Step 4: Мини-редактор (переиспользуем классы `ytEditor*`)**

В блоке `stage === 'edit' && day`, после блока `<div className={styles.ytEditor}> … </div>` (YouTube-редактор), добавить второй такой же блок для помидорок:
```tsx
            <div className={styles.ytEditor}>
              <div className={styles.ytEditorHeading}>Помидорки</div>
              <div className={styles.ytEditorTop}>
                <span className={styles.ytEditorMinutes}>{day.pomodoros}</span>
                <span className={styles.ytEditorReset} onClick={resetPomodoro}>
                  сбросить
                </span>
              </div>
              <div className={styles.ytEditorButtons}>
                <button type="button" onClick={() => addPomodoro(1)}>
                  +1
                </button>
                <button type="button" onClick={() => addPomodoro(-1)}>
                  −1
                </button>
              </div>
            </div>
```

- [ ] **Step 5: Типизация**

Run (из `frontend/`):
```bash
bunx tsc --noEmit
```
Expected: без ошибок.

- [ ] **Step 6: Проверка в браузере**

Открыть прошлый день через клетку хитмапа сфер/серии → в просмотре видна строка «Помидорок: N»; после «Редактировать» доступен блок +1/−1/сбросить, изменения сохраняются и отражаются в хитмапе помидорок.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/DayDetailModal.tsx
git commit -m "feat(frontend): view and edit pomodoros for past days in day detail modal"
```

---

## Self-Review

**Spec coverage:**
- Счётчик помидорок за день (ручной +1) → Task 1 (поле), Task 2 (эндпоинт), Task 6 (панель), Task 8 (подключение). ✓
- Дефолт/пороги 4 и 8 зашиты → Task 4 (`POMODORO_MIN`/`POMODORO_OPT`). ✓
- 30-дневный хитмап количества по дням → Task 5 (цвет), Task 7 (компонент). ✓
- Две серии (≥4 и ≥8) → Task 4 (`computePomodoroStreak`), Task 6/8 (отображение). ✓
- Сквозная иерархия «оптимум ярче минимума» (хитмап, серии, панель) → Task 5+7 (glow-клетки), Task 6 (countOpt/streakOptGlow/barFillOpt). ✓
- Вечернее напоминание при недоборе минимума → Task 8 (Step 3). ✓
- Просмотр/редактирование прошлых дней → Task 9. ✓
- Без новых stats-эндпоинтов, без изменения `seed.ts`/`Settings` → соблюдено (хитмап/серии из `/history`). ✓

**Placeholder scan:** плейсхолдеров нет — весь код приведён дословно. ✓

**Type consistency:**
- `updatePomodoros(dateStr, delta?, reset?)` (бэк) ↔ `updatePomodoros(date, { delta?, reset? })` (фронт-клиент) — согласовано.
- `streakByThreshold(history, todayDate, todayValue, getValue, threshold)` определён в Task 4 и используется `computeStreak`/`computePomodoroStreak` с той же сигнатурой. ✓
- `pomodoroHeatmapColor(count, min, opt)` определён в Task 5, вызван в Task 7 с `(h.pomodoros, POMODORO_MIN, POMODORO_OPT)`. ✓
- `PomodoroPanel` props `{ count, streakMin, streakOpt, onAdd, onReset }` — Task 6 объявляет, Task 8 передаёт ровно их. ✓
- `HistoryEntry.pomodoros`/`DayView.pomodoros` добавлены и на бэке (Task 2), и в типах фронта (Task 3). ✓
