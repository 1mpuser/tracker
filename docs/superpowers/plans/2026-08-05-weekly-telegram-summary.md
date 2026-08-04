# Недельная сводка в Telegram с графиком — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При закрытии воскресенья публиковать в Telegram-канал недельную сводку — PNG с графиком помидорок по дням недели и текст с итогами.

**Architecture:** Бэкенд агрегирует неделю и собирает текст из базы; график рисует фронтенд теми же компонентами Recharts, что и интерфейс, снимает с него PNG через canvas и отдаёт байты бэкенду отдельным запросом. Идемпотентность — атомарный захват нового поля `Day.weeklyTelegramMessageId`, тем же приёмом, что уже защищает дневную сводку.

**Tech Stack:** NestJS 11, Prisma 7, Jest 30 + ts-jest, Next.js 16 (App Router), React 19, Recharts 3, Bun.

## Global Constraints

- Все команды через **bun**: `bun run test` из `backend/` и из `frontend/`. Не npm/yarn/pnpm.
- **Никаких новых зависимостей** ни в бэкенде, ни во фронтенде. Recharts уже стоит; `FormData` и `Blob` глобальны в Bun.
- Комментарии и сообщения в коде — на русском, в стиле существующего кода: поясняют «почему», а не «что».
- Текст сводки собирает **бэкенд из базы**. Клиент присылает только пиксели.
- **Один пост на неделю**: захват `Day.weeklyTelegramMessageId` через `updateMany` с условием в `where` (не read-then-write).
- **Картинка не обязательна**: без неё уходит текстовый пост, сводка не теряется.
- Неделя — понедельник по воскресенье того воскресенья, которое закрыли.
- Токен бота не должен попадать в лог — вырезать из строки ошибки, как в `backend/src/telegram/telegram.service.ts:40`.
- Подпись к фото у Telegram ограничена **1024 символами**. Не влезает — фото без подписи, следом текст отдельным сообщением.
- В графике: `isAnimationActive={false}` и **литеральные hex-цвета** вместо `var(--…)`. Обе вещи обязательны, иначе экспорт ломается.
- Тесты фронта матчатся как `.*\.spec\.ts$`; компонентных рендер-тестов в проекте нет и заводить их нельзя (`@testing-library/react` отсутствует).
- Цвета: фон `#1a1d24`, столбики `#e0574e`, лучший день `#ff6f5c`, подписи `#888d98`, сетка `#2a2e37`.

## File Structure

| Файл | Ответственность |
|---|---|
| `backend/prisma/schema.prisma` + миграция | Поле `Day.weeklyTelegramMessageId` |
| `backend/src/stats/stats.service.ts` | `weekStats(endDateStr)` — агрегат недели |
| `backend/src/stats/stats.controller.ts` | `GET /stats/week` |
| `backend/src/telegram/weekly.helpers.ts` (создать) | Чистое: границы недели, значки сфер, текст сводки, лимит подписи |
| `backend/src/telegram/telegram.service.ts` | `postWeeklySummary(text, chartPngBase64)` |
| `backend/src/days/days.service.ts` | `postWeeklySummary(dateStr, chartPngBase64)` — захват и публикация |
| `backend/src/days/days.controller.ts` | `POST /days/:date/weekly-summary` |
| `backend/src/days/dto/weekly-summary.dto.ts` (создать) | Валидация тела запроса |
| `backend/src/main.ts` | Лимит тела 2 МБ |
| `frontend/lib/weekly.ts` (создать) | `isSunday`, `toChartSeries` |
| `frontend/lib/chart-export.ts` (создать) | `svgToPngBase64` |
| `frontend/components/WeeklyChart.tsx` (создать) | График за неделю, 800×400 |
| `frontend/lib/useWeeklySummary.ts` (создать) | Хук: закрыли воскресенье → отправить сводку |
| `frontend/components/Dashboard.tsx`, `DayDetailModal.tsx` | Вызов хука |
| `frontend/lib/api.ts`, `frontend/types/api.ts` | `getWeekStats`, `postWeeklySummary`, тип `WeekStats` |

---

### Task 1: Поле `weeklyTelegramMessageId` и агрегат недели

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/stats/stats.service.ts`, `backend/src/stats/stats.controller.ts`
- Test: `backend/src/stats/stats.service.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  ```ts
  export interface WeekDayStat { date: string; weekday: string; pomodoros: number; rating: number | null; closed: boolean }
  export interface WeekStats {
    weekStart: string; weekEnd: string; days: WeekDayStat[];
    totalPomodoros: number; avgPomodoros: number;
    bestDay: { date: string; weekday: string; pomodoros: number } | null;
    avgRating: number | null; ratedDays: number;
    categories: { label: string; doneCount: number }[];
    youtubeAvgMinutes: number; youtubeBudget: number;
  }
  export class StatsService { weekStats(endDateStr: string): Promise<WeekStats> }
  ```
  Плюс маршрут `GET /stats/week?end=YYYY-MM-DD`. Использует Task 2, 3, 5.

- [ ] **Step 1: Добавить поле в схему Prisma**

В `backend/prisma/schema.prisma`, в модель `Day`, сразу после `telegramMessageId`:

```prisma
  weeklyTelegramMessageId Int?
```

- [ ] **Step 2: Создать миграцию**

Run: `docker compose up -d postgres && cd backend && DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker bunx prisma migrate dev --name day_weekly_telegram_message_id`
Expected: создан каталог `backend/prisma/migrations/<timestamp>_day_weekly_telegram_message_id/`, миграция применена.

- [ ] **Step 3: Написать падающие тесты**

Добавить в конец `backend/src/stats/stats.service.spec.ts`:

```ts
describe('StatsService.weekStats', () => {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  function makePrisma(overrides: any = {}) {
    return {
      settings: { findUnique: jest.fn().mockResolvedValue({ youtubeBudget: 60 }) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      dayCategoryStatus: { findMany: jest.fn().mockResolvedValue([]) },
      day: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  it('spans monday..sunday of the given sunday', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.weekStart).toBe('2026-07-27');
    expect(result.weekEnd).toBe('2026-08-02');
    expect(result.days).toHaveLength(7);
    expect(result.days[0].weekday).toBe('Пн');
    expect(result.days[6].weekday).toBe('Вс');
  });

  it('spans the containing week for a mid-week date', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-07-29');

    expect(result.weekStart).toBe('2026-07-27');
    expect(result.weekEnd).toBe('2026-08-02');
  });

  it('fills missing days with zeros instead of skipping them', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 29), pomodoros: 5, rating: 8, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.days.map((d) => d.pomodoros)).toEqual([0, 0, 5, 0, 0, 0, 0]);
    expect(result.days[0].closed).toBe(false);
  });

  it('averages pomodoros over seven days, not over closed days', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 7, rating: null, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 28), pomodoros: 7, rating: null, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.totalPomodoros).toBe(14);
    expect(result.avgPomodoros).toBe(2);
  });

  it('averages rating over rated days only', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 0, rating: 8, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 28), pomodoros: 0, rating: 6, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 29), pomodoros: 0, rating: null, eveningClosed: false, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.avgRating).toBe(7);
    expect(result.ratedDays).toBe(2);
  });

  it('returns null rating and null best day for an empty week', async () => {
    const service = new StatsService(makePrisma() as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.avgRating).toBeNull();
    expect(result.ratedDays).toBe(0);
    expect(result.bestDay).toBeNull();
  });

  it('picks the earliest day when the best day ties', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 28), pomodoros: 9, rating: null, eveningClosed: true, youtubeMinutes: 0 },
          { date: utc(2026, 7, 31), pomodoros: 9, rating: null, eveningClosed: true, youtubeMinutes: 0 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.bestDay).toEqual({ date: '2026-07-28', weekday: 'Вт', pomodoros: 9 });
  });

  it('counts category completions over the week', async () => {
    const prisma = makePrisma({
      category: { findMany: jest.fn().mockResolvedValue([{ id: 1, label: 'Спорт', order: 0 }]) },
      dayCategoryStatus: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 1, done: true },
          { categoryId: 1, done: true },
          { categoryId: 1, done: false },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.categories).toEqual([{ label: 'Спорт', doneCount: 2 }]);
  });

  it('averages youtube minutes over seven days', async () => {
    const prisma = makePrisma({
      day: {
        findMany: jest.fn().mockResolvedValue([
          { date: utc(2026, 7, 27), pomodoros: 0, rating: null, eveningClosed: false, youtubeMinutes: 70 },
        ]),
      },
    });
    const service = new StatsService(prisma as any);

    const result = await service.weekStats('2026-08-02');

    expect(result.youtubeAvgMinutes).toBe(10);
    expect(result.youtubeBudget).toBe(60);
  });
});
```

- [ ] **Step 4: Убедиться, что тесты падают**

Run: `cd backend && bun run test stats.service`
Expected: FAIL — `service.weekStats is not a function`.

- [ ] **Step 5: Реализовать `weekStats`**

Добавить в `backend/src/stats/stats.service.ts` — импорт `parseDateParam` к существующим, экспортируемые интерфейсы над классом и метод внутри класса рядом с остальными:

```ts
// в шапке файла:
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export interface WeekDayStat {
  date: string;
  weekday: string;
  pomodoros: number;
  rating: number | null;
  closed: boolean;
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  days: WeekDayStat[];
  totalPomodoros: number;
  avgPomodoros: number;
  bestDay: { date: string; weekday: string; pomodoros: number } | null;
  avgRating: number | null;
  ratedDays: number;
  categories: { label: string; doneCount: number }[];
  youtubeAvgMinutes: number;
  youtubeBudget: number;
}
```

Метод класса:

```ts
  async weekStats(endDateStr: string): Promise<WeekStats> {
    const monday = this.mondayOf(parseDateParam(endDateStr));
    const sunday = addDays(monday, 6);

    const [settings, categories, dayRows, statuses] = await Promise.all([
      this.prisma.settings.findUnique({ where: { id: 1 } }),
      this.prisma.category.findMany({ where: { archived: false }, orderBy: { order: 'asc' } }),
      this.prisma.day.findMany({
        where: { date: { gte: monday, lte: sunday } },
        select: { date: true, pomodoros: true, rating: true, eveningClosed: true, youtubeMinutes: true },
      }),
      this.prisma.dayCategoryStatus.findMany({
        where: { day: { date: { gte: monday, lte: sunday } } },
        select: { categoryId: true, done: true },
      }),
    ]);

    const rowByDate = new Map(dayRows.map((d) => [formatDate(d.date), d]));

    // Неделя всегда ровно 7 точек: пропущенный день — это ноль, а не дырка,
    // иначе график на фронте поедет по оси X.
    const days: WeekDayStat[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const key = formatDate(date);
      const row = rowByDate.get(key);
      days.push({
        date: key,
        weekday: WEEKDAY_SHORT[date.getUTCDay()],
        pomodoros: row?.pomodoros ?? 0,
        rating: row?.rating ?? null,
        closed: row?.eveningClosed ?? false,
      });
    }

    const totalPomodoros = days.reduce((sum, d) => sum + d.pomodoros, 0);
    const rated = days.filter((d) => d.rating != null);

    // Строгое «больше» оставляет за собой самый ранний из равных дней.
    let bestDay: WeekStats['bestDay'] = null;
    for (const d of days) {
      if (d.pomodoros > 0 && (!bestDay || d.pomodoros > bestDay.pomodoros)) {
        bestDay = { date: d.date, weekday: d.weekday, pomodoros: d.pomodoros };
      }
    }

    const doneByCategory = new Map<number, number>();
    for (const s of statuses) {
      if (s.done) doneByCategory.set(s.categoryId, (doneByCategory.get(s.categoryId) ?? 0) + 1);
    }

    const youtubeTotal = dayRows.reduce((sum, d) => sum + d.youtubeMinutes, 0);

    return {
      weekStart: formatDate(monday),
      weekEnd: formatDate(sunday),
      days,
      totalPomodoros,
      // Делим на 7, а не на число закрытых дней: пропущенный день — это ноль
      // продуктивности, а не отсутствие данных.
      avgPomodoros: Math.round((totalPomodoros / 7) * 10) / 10,
      bestDay,
      avgRating:
        rated.length > 0
          ? Math.round((rated.reduce((sum, d) => sum + (d.rating ?? 0), 0) / rated.length) * 10) / 10
          : null,
      ratedDays: rated.length,
      categories: categories.map((c) => ({ label: c.label, doneCount: doneByCategory.get(c.id) ?? 0 })),
      youtubeAvgMinutes: Math.round((youtubeTotal / 7) * 10) / 10,
      youtubeBudget: settings?.youtubeBudget ?? 60,
    };
  }
```

- [ ] **Step 6: Добавить маршрут**

В `backend/src/stats/stats.controller.ts`, метод после существующих:

```ts
  @Get('week')
  weekStats(@Query('end') end?: string) {
    return this.statsService.weekStats(end ?? new Date().toISOString().slice(0, 10));
  }
```

- [ ] **Step 7: Убедиться, что тесты проходят**

Run: `cd backend && bun run test`
Expected: PASS, весь набор зелёный.

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma backend/src/stats/
git commit -m "feat(backend): агрегат недели и поле для недельной сводки"
```

---

### Task 2: Текст недельной сводки

**Files:**
- Create: `backend/src/telegram/weekly.helpers.ts`, `backend/src/telegram/weekly.helpers.spec.ts`

**Interfaces:**
- Consumes: тип `WeekStats` из `../stats/stats.service` (Task 1).
- Produces:
  ```ts
  export const TELEGRAM_CAPTION_LIMIT = 1024;
  export function formatWeekRange(weekStart: string, weekEnd: string): string;   // '27 июля — 2 августа 2026'
  export function categoryIcon(doneCount: number): string;                        // '✅' | '⚠️' | '❌'
  export function buildWeekSummary(stats: WeekStats): string;                     // готовое HTML-тело
  export function fitsInCaption(text: string): boolean;
  ```
  Использует Task 3.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/src/telegram/weekly.helpers.spec.ts`:

```ts
import type { WeekStats } from '../stats/stats.service';
import { buildWeekSummary, categoryIcon, fitsInCaption, formatWeekRange } from './weekly.helpers';

function makeStats(overrides: Partial<WeekStats> = {}): WeekStats {
  return {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [],
    totalPomodoros: 34,
    avgPomodoros: 4.9,
    bestDay: { date: '2026-07-29', weekday: 'Ср', pomodoros: 8 },
    avgRating: 7.4,
    ratedDays: 6,
    categories: [{ label: 'Спорт', doneCount: 5 }],
    youtubeAvgMinutes: 42,
    youtubeBudget: 60,
    ...overrides,
  };
}

describe('formatWeekRange', () => {
  it('renders both months when the week spans two of them', () => {
    expect(formatWeekRange('2026-07-27', '2026-08-02')).toBe('27 июля — 2 августа 2026');
  });

  it('still names both months inside a single month', () => {
    expect(formatWeekRange('2026-08-03', '2026-08-09')).toBe('3 августа — 9 августа 2026');
  });
});

describe('categoryIcon', () => {
  it('marks five or more days as done', () => {
    expect(categoryIcon(5)).toBe('✅');
    expect(categoryIcon(7)).toBe('✅');
  });

  it('marks two to four days as partial', () => {
    expect(categoryIcon(4)).toBe('⚠️');
    expect(categoryIcon(2)).toBe('⚠️');
  });

  it('marks zero or one day as failed', () => {
    expect(categoryIcon(1)).toBe('❌');
    expect(categoryIcon(0)).toBe('❌');
  });
});

describe('buildWeekSummary', () => {
  it('includes totals, best day, rating, spheres and youtube', () => {
    const text = buildWeekSummary(makeStats());

    expect(text).toContain('📊 Неделя 27 июля — 2 августа 2026');
    expect(text).toContain('🍅 Помидорок: 34 (в среднем 4.9/день)');
    expect(text).toContain('🔥 Лучший день: среда — 8');
    expect(text).toContain('⭐ Средняя оценка: 7.4/10 (по 6 дням)');
    expect(text).toContain('✅ Спорт 5/7');
    expect(text).toContain('📺 YouTube: 42 мин/день при бюджете 60');
  });

  it('omits the rating line when nothing was rated', () => {
    const text = buildWeekSummary(makeStats({ avgRating: null, ratedDays: 0 }));

    expect(text).not.toContain('Средняя оценка');
  });

  it('omits the best-day line when the week had no pomodoros', () => {
    const text = buildWeekSummary(makeStats({ bestDay: null, totalPomodoros: 0, avgPomodoros: 0 }));

    expect(text).not.toContain('Лучший день');
    expect(text).toContain('🍅 Помидорок: 0');
  });

  it('escapes html in category labels', () => {
    const text = buildWeekSummary(makeStats({ categories: [{ label: 'Спорт <b>', doneCount: 5 }] }));

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).not.toContain('<b>');
  });

  it('omits the spheres block entirely when there are no categories', () => {
    const text = buildWeekSummary(makeStats({ categories: [] }));

    expect(text).not.toContain('Сферы за неделю');
  });
});

describe('fitsInCaption', () => {
  it('accepts a normal summary', () => {
    expect(fitsInCaption(buildWeekSummary(makeStats()))).toBe(true);
  });

  it('rejects text over the telegram caption limit', () => {
    expect(fitsInCaption('x'.repeat(1025))).toBe(false);
  });

  it('accepts text exactly at the limit', () => {
    expect(fitsInCaption('x'.repeat(1024))).toBe(true);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test weekly.helpers`
Expected: FAIL — `Cannot find module './weekly.helpers'`.

- [ ] **Step 3: Реализовать `weekly.helpers.ts`**

```ts
import type { WeekStats } from '../stats/stats.service';
import { parseDateParam } from '../common/date.util';
import { escapeHtml } from './telegram.helpers';

// Telegram обрезает подпись к фото на 1024 символах — за пределом сводка
// уезжает отдельным сообщением, а не теряет хвост.
export const TELEGRAM_CAPTION_LIMIT = 1024;

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAYS_FULL = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
];

const DAYS_IN_WEEK = 7;

function dayAndMonth(dateStr: string): string {
  const date = parseDateParam(dateStr);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const year = parseDateParam(weekEnd).getUTCFullYear();
  return `${dayAndMonth(weekStart)} — ${dayAndMonth(weekEnd)} ${year}`;
}

export function categoryIcon(doneCount: number): string {
  if (doneCount >= 5) return '✅';
  if (doneCount >= 2) return '⚠️';
  return '❌';
}

export function fitsInCaption(text: string): boolean {
  return text.length <= TELEGRAM_CAPTION_LIMIT;
}

export function buildWeekSummary(stats: WeekStats): string {
  const lines: string[] = [
    `📊 Неделя ${formatWeekRange(stats.weekStart, stats.weekEnd)}`,
    '',
    `🍅 Помидорок: ${stats.totalPomodoros} (в среднем ${stats.avgPomodoros}/день)`,
  ];

  if (stats.bestDay) {
    const weekdayName = WEEKDAYS_FULL[parseDateParam(stats.bestDay.date).getUTCDay()];
    lines.push(`🔥 Лучший день: ${weekdayName} — ${stats.bestDay.pomodoros}`);
  }

  if (stats.avgRating != null) {
    lines.push(`⭐ Средняя оценка: ${stats.avgRating}/10 (по ${stats.ratedDays} дням)`);
  }

  if (stats.categories.length > 0) {
    lines.push('', 'Сферы за неделю');
    for (const c of stats.categories) {
      lines.push(`${categoryIcon(c.doneCount)} ${escapeHtml(c.label)} ${c.doneCount}/${DAYS_IN_WEEK}`);
    }
  }

  lines.push('', `📺 YouTube: ${stats.youtubeAvgMinutes} мин/день при бюджете ${stats.youtubeBudget}`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && bun run test weekly.helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/weekly.helpers.ts backend/src/telegram/weekly.helpers.spec.ts
git commit -m "feat(backend): текст недельной сводки"
```

---

### Task 3: Отправка недельной сводки в Telegram

**Files:**
- Modify: `backend/src/telegram/telegram.service.ts`
- Test: `backend/src/telegram/telegram.service.spec.ts`

**Interfaces:**
- Consumes: `fitsInCaption` из `./weekly.helpers` (Task 2).
- Produces:
  ```ts
  // number — id опубликованного поста; null — не настроено или не отправилось
  postWeeklySummary(text: string, chartPngBase64?: string | null): Promise<number | null>
  ```
  Использует Task 4.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/telegram/telegram.service.spec.ts`:

```ts
describe('TelegramService.postWeeklySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;
  // 1x1 прозрачный PNG — достаточно, чтобы проверить путь с картинкой.
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 77 } }),
    });
    (global as any).fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '@my_channel';
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    jest.restoreAllMocks();
  });

  it('does nothing without telegram configured', async () => {
    delete process.env.TELEGRAM_CHAT_ID;

    await expect(service.postWeeklySummary('текст', pngBase64)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a photo with the text as caption when a chart is given', async () => {
    const result = await service.postWeeklySummary('текст сводки', pngBase64);

    expect(result).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
  });

  it('falls back to a text message when no chart is given', async () => {
    const result = await service.postWeeklySummary('текст сводки', null);

    expect(result).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
  });

  it('sends photo and text separately when the caption is too long', async () => {
    await service.postWeeklySummary('x'.repeat(1025), pngBase64);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
    expect(fetchMock.mock.calls[1][0]).toContain('/sendMessage');
  });

  it('returns null when telegram rejects the post', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });

    await expect(service.postWeeklySummary('текст', pngBase64)).resolves.toBeNull();
  });

  it('never leaks the bot token into the log message', async () => {
    fetchMock.mockRejectedValue(new Error('failed for token 123:ABC'));
    const warn = service['logger'].warn as jest.Mock;

    await service.postWeeklySummary('текст', pngBase64);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('123:ABC');
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test telegram.service`
Expected: FAIL — `service.postWeeklySummary is not a function`.

- [ ] **Step 3: Реализовать метод**

В `backend/src/telegram/telegram.service.ts` добавить импорт и метод:

```ts
import { fitsInCaption } from './weekly.helpers';
```

```ts
  // number — id опубликованного поста, null — не настроено или не отправилось.
  // Картинка необязательна: без неё уходит текстовый пост, чтобы недельный
  // итог не потерялся из-за сбоя рендера на фронте.
  async postWeeklySummary(text: string, chartPngBase64?: string | null): Promise<number | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;

    try {
      if (!chartPngBase64) {
        return await this.sendText(token, chatId, text);
      }

      // Подпись длиннее лимита Telegram молча обрежет, поэтому в этом случае
      // отправляем фото без подписи и текст отдельным сообщением.
      const asCaption = fitsInCaption(text);
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', new Blob([Buffer.from(chartPngBase64, 'base64')], { type: 'image/png' }), 'week.png');
      if (asCaption) {
        form.append('caption', text);
        form.append('parse_mode', 'HTML');
      }

      const photoId = await this.postForm(token, 'sendPhoto', form);
      if (photoId === null) return null;
      if (asCaption) return photoId;

      await this.sendText(token, chatId, text);
      return photoId;
    } catch (e) {
      this.logger.warn(`Telegram postWeeklySummary failed: ${String(e).split(token).join('<redacted>')}`);
      return null;
    }
  }

  private async sendText(token: string, chatId: string, text: string): Promise<number | null> {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10000),
    });
    return this.readMessageId(response, 'sendMessage');
  }

  private async postForm(token: string, method: string, form: FormData): Promise<number | null> {
    // Картинка может весить сотни килобайт — таймаут щедрее, чем у текста.
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    return this.readMessageId(response, method);
  }

  private async readMessageId(response: Response, method: string): Promise<number | null> {
    if (!response.ok) {
      this.logger.warn(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
      return null;
    }
    const body = (await response.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!body.ok || !body.result) {
      this.logger.warn(`Telegram ${method} rejected: ${body.description ?? 'unknown error'}`);
      return null;
    }
    return body.result.message_id;
  }
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && bun run test telegram`
Expected: PASS, включая существующие тесты `postDaySummary`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/
git commit -m "feat(backend): отправка недельной сводки с картинкой"
```

---

### Task 4: Эндпоинт публикации недельной сводки

**Files:**
- Create: `backend/src/days/dto/weekly-summary.dto.ts`
- Modify: `backend/src/days/days.service.ts`, `backend/src/days/days.controller.ts`, `backend/src/days/days.module.ts`, `backend/src/main.ts`
- Test: `backend/src/days/days.service.spec.ts`, `backend/src/days/days.controller.spec.ts`

**Interfaces:**
- Consumes: `StatsService.weekStats` (Task 1), `buildWeekSummary` (Task 2), `TelegramService.postWeeklySummary` (Task 3).
- Produces:
  ```ts
  // в DaysService
  postWeeklySummary(dateStr: string, chartPngBase64?: string | null):
    Promise<{ posted: boolean; withChart: boolean; reason?: 'already-posted' | 'send-failed' }>
  ```
  Маршрут `POST /days/:date/weekly-summary`, тело `{ chartPng?: string }`. Использует Task 6.

- [ ] **Step 1: Написать падающие тесты сервиса**

Добавить в конец `backend/src/days/days.service.spec.ts`:

```ts
describe('DaysService.postWeeklySummary', () => {
  let prisma: any;
  let telegram: any;
  let stats: any;
  let service: DaysService;

  const weekStats = {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [],
    totalPomodoros: 10,
    avgPomodoros: 1.4,
    bestDay: null,
    avgRating: null,
    ratedDays: 0,
    categories: [],
    youtubeAvgMinutes: 0,
    youtubeBudget: 60,
  };

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    telegram = { postWeeklySummary: jest.fn().mockResolvedValue(42) };
    stats = { weekStats: jest.fn().mockResolvedValue(weekStats) };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      telegram,
      stats,
    );
  });

  it('claims the row and posts once', async () => {
    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(prisma.day.updateMany).toHaveBeenCalledWith({
      where: { id: 1, weeklyTelegramMessageId: null },
      data: { weeklyTelegramMessageId: 0 },
    });
    expect(telegram.postWeeklySummary).toHaveBeenCalledTimes(1);
    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { weeklyTelegramMessageId: 42 },
    });
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('does not post twice for the same week', async () => {
    prisma.day.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(telegram.postWeeklySummary).not.toHaveBeenCalled();
    expect(result).toEqual({ posted: false, withChart: false, reason: 'already-posted' });
  });

  it('releases the claim when sending fails', async () => {
    telegram.postWeeklySummary.mockResolvedValue(null);

    const result = await service.postWeeklySummary('2026-08-02', 'AAAA');

    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { weeklyTelegramMessageId: null },
    });
    expect(result).toEqual({ posted: false, withChart: true, reason: 'send-failed' });
  });

  it('reports withChart false when no image was supplied', async () => {
    const result = await service.postWeeklySummary('2026-08-02', null);

    expect(telegram.postWeeklySummary).toHaveBeenCalledWith(expect.any(String), null);
    expect(result).toEqual({ posted: true, withChart: false });
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test days.service`
Expected: FAIL — `service.postWeeklySummary is not a function`.

- [ ] **Step 3: Реализовать метод сервиса**

В `backend/src/days/days.service.ts` добавить импорты и зависимость:

```ts
import { StatsService } from '../stats/stats.service';
import { buildWeekSummary } from '../telegram/weekly.helpers';
```

В конструктор — пятым параметром `private stats: StatsService`. Существующие четыре параметра и их порядок не менять.

Метод после `updateDay`:

```ts
  // Публикует недельную сводку за неделю, заканчивающуюся этой (воскресной)
  // датой. Картинку рисует фронт и присылает готовым PNG — в контейнере
  // рисовать нечем; текст собираем здесь из базы, чтобы пост не разошёлся
  // с реальными числами, даже если клиент прислал что-то своё.
  async postWeeklySummary(
    dateStr: string,
    chartPngBase64?: string | null,
  ): Promise<{ posted: boolean; withChart: boolean; reason?: 'already-posted' | 'send-failed' }> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const withChart = Boolean(chartPngBase64);

    // Тот же атомарный захват, что у дневной сводки: строку занимает ровно
    // один конкурентный запрос, остальные получают count 0 и молчат.
    const claim = await this.prisma.day.updateMany({
      where: { id: dayId, weeklyTelegramMessageId: null },
      data: { weeklyTelegramMessageId: TELEGRAM_CLAIMED },
    });
    if (claim.count !== 1) {
      return { posted: false, withChart: false, reason: 'already-posted' };
    }

    const stats = await this.stats.weekStats(dateStr);
    const messageId = await this.telegram.postWeeklySummary(buildWeekSummary(stats), chartPngBase64 ?? null);

    // Не отправилось -> сбрасываем захват обратно в null, чтобы следующее
    // закрытие этого воскресенья попробовало снова.
    await this.prisma.day.update({ where: { id: dayId }, data: { weeklyTelegramMessageId: messageId } });

    return messageId === null
      ? { posted: false, withChart, reason: 'send-failed' }
      : { posted: true, withChart };
  }
```

- [ ] **Step 4: Убедиться, что тесты сервиса проходят**

Run: `cd backend && bun run test days.service`
Expected: PASS.

- [ ] **Step 5: Создать DTO**

`backend/src/days/dto/weekly-summary.dto.ts`:

```ts
import { IsBase64, IsOptional, IsString, MaxLength } from 'class-validator';

export class WeeklySummaryDto {
  // ~1.4 МБ base64 ≈ 1 МБ PNG: с запасом на график 1600×800, но не даёт
  // залить в память что угодно.
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  @IsBase64()
  chartPng?: string;
}
```

- [ ] **Step 6: Написать падающие тесты контроллера**

Добавить в конец `backend/src/days/days.controller.spec.ts`:

```ts
describe('DaysController.postWeeklySummary', () => {
  let daysService: any;
  let controller: DaysController;

  beforeEach(() => {
    daysService = { postWeeklySummary: jest.fn().mockResolvedValue({ posted: true, withChart: true }) };
    controller = new DaysController(daysService, { isEnabled: jest.fn(), syncDate: jest.fn() } as any);
  });

  it('rejects a date that is not a sunday', async () => {
    // 2026-08-03 — понедельник
    await expect(controller.postWeeklySummary('2026-08-03', {})).rejects.toThrow(BadRequestException);
    expect(daysService.postWeeklySummary).not.toHaveBeenCalled();
  });

  it('posts for a sunday and passes the chart through', async () => {
    const result = await controller.postWeeklySummary('2026-08-02', { chartPng: 'AAAA' });

    expect(daysService.postWeeklySummary).toHaveBeenCalledWith('2026-08-02', 'AAAA');
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('passes null when no chart was supplied', async () => {
    await controller.postWeeklySummary('2026-08-02', {});

    expect(daysService.postWeeklySummary).toHaveBeenCalledWith('2026-08-02', null);
  });

  it('reports an already-posted week without throwing', async () => {
    daysService.postWeeklySummary.mockResolvedValue({ posted: false, withChart: false, reason: 'already-posted' });

    const result = await controller.postWeeklySummary('2026-08-02', {});

    expect(result).toEqual({ posted: false, reason: 'already-posted' });
  });

  it('turns a send failure into 502', async () => {
    daysService.postWeeklySummary.mockResolvedValue({ posted: false, withChart: true, reason: 'send-failed' });

    await expect(controller.postWeeklySummary('2026-08-02', {})).rejects.toThrow(BadGatewayException);
  });
});
```

В шапке файла добавить `BadRequestException` к уже импортируемым из `@nestjs/common`.

- [ ] **Step 7: Реализовать маршрут**

В `backend/src/days/days.controller.ts` — импорты (`BadRequestException` к существующим, плюс DTO и утилита даты):

```ts
import { WeeklySummaryDto } from './dto/weekly-summary.dto';
import { parseDateParam } from '../common/date.util';
```

Метод после `syncSessionPomodoros`:

```ts
  @Post('days/:date/weekly-summary')
  async postWeeklySummary(@Param('date') date: string, @Body() dto: WeeklySummaryDto) {
    // Сводка привязана к неделе, а неделя заканчивается воскресеньем: пускать
    // сюда любую дату значило бы плодить посты за одну и ту же неделю.
    if (parseDateParam(date).getUTCDay() !== 0) {
      throw new BadRequestException('Недельная сводка публикуется только за воскресенье');
    }

    const result = await this.daysService.postWeeklySummary(date, dto.chartPng ?? null);

    if (result.reason === 'already-posted') {
      return { posted: false, reason: 'already-posted' };
    }
    if (result.reason === 'send-failed') {
      throw new BadGatewayException('Не удалось опубликовать недельную сводку');
    }
    return { posted: true, withChart: result.withChart };
  }
```

- [ ] **Step 8: Подключить `StatsModule` в `DaysModule`**

`StatsModule` сейчас не экспортирует свой сервис — сначала добавить экспорт в `backend/src/stats/stats.module.ts`:

```ts
@Module({
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
```

Затем в `backend/src/days/days.module.ts` добавить импорт `StatsModule` из `../stats/stats.module` и внести его в массив `imports` рядом с `CategoriesModule`, `GtdModule`, `TelegramModule`, `SessionModule`.

- [ ] **Step 9: Поднять лимит тела запроса**

В `backend/src/main.ts`, до `app.listen`:

```ts
  // PNG графика приезжает base64-строкой в JSON; дефолтные 100 КБ его не пускают.
  app.useBodyParser('json', { limit: '2mb' });
```

Приложение должно создаваться как express-типизированное: `const app = await NestFactory.create<NestExpressApplication>(AppModule);` с импортом `NestExpressApplication` из `@nestjs/platform-express`. Если `useBodyParser` в установленной версии недоступен, использовать альтернативу: `NestFactory.create(AppModule, { bodyParser: false })` плюс `app.use(express.json({ limit: '2mb' }))` с импортом `express` из уже установленного `express`. Выбранный способ описать в отчёте.

- [ ] **Step 10: Прогнать всё**

Run: `cd backend && bun run test`
Expected: PASS.

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 11: Commit**

```bash
git add backend/src/
git commit -m "feat(backend): эндпоинт публикации недельной сводки"
```

---

### Task 5: Клиент API и чистые функции фронта

**Files:**
- Create: `frontend/lib/weekly.ts`, `frontend/lib/weekly.spec.ts`
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/lib/api.spec.ts`

**Interfaces:**
- Consumes: `GET /stats/week?end=…` и `POST /days/:date/weekly-summary` (Task 1, 4).
- Produces:
  ```ts
  // frontend/types/api.ts
  export interface WeekDayStat { date: string; weekday: string; pomodoros: number; rating: number | null; closed: boolean }
  export interface WeekStats { weekStart: string; weekEnd: string; days: WeekDayStat[]; totalPomodoros: number;
    avgPomodoros: number; bestDay: { date: string; weekday: string; pomodoros: number } | null;
    avgRating: number | null; ratedDays: number; categories: { label: string; doneCount: number }[];
    youtubeAvgMinutes: number; youtubeBudget: number }
  // frontend/lib/api.ts
  export function getWeekStats(end: string): Promise<WeekStats>;
  export function postWeeklySummary(date: string, chartPng: string | null): Promise<{ posted: boolean; withChart?: boolean; reason?: string }>;
  // frontend/lib/weekly.ts
  export function isSunday(dateStr: string): boolean;
  export interface ChartPoint { weekday: string; pomodoros: number; best: boolean }
  export function toChartSeries(stats: WeekStats): ChartPoint[];
  ```
  Использует Task 6, 7.

- [ ] **Step 1: Написать падающие тесты**

Создать `frontend/lib/weekly.spec.ts`:

```ts
import type { WeekStats } from '@/types/api';
import { isSunday, toChartSeries } from './weekly';

function makeStats(overrides: Partial<WeekStats> = {}): WeekStats {
  return {
    weekStart: '2026-07-27',
    weekEnd: '2026-08-02',
    days: [
      { date: '2026-07-27', weekday: 'Пн', pomodoros: 4, rating: null, closed: true },
      { date: '2026-07-28', weekday: 'Вт', pomodoros: 0, rating: null, closed: false },
      { date: '2026-07-29', weekday: 'Ср', pomodoros: 8, rating: null, closed: true },
      { date: '2026-07-30', weekday: 'Чт', pomodoros: 2, rating: null, closed: true },
      { date: '2026-07-31', weekday: 'Пт', pomodoros: 5, rating: null, closed: true },
      { date: '2026-08-01', weekday: 'Сб', pomodoros: 1, rating: null, closed: true },
      { date: '2026-08-02', weekday: 'Вс', pomodoros: 3, rating: null, closed: true },
    ],
    totalPomodoros: 23,
    avgPomodoros: 3.3,
    bestDay: { date: '2026-07-29', weekday: 'Ср', pomodoros: 8 },
    avgRating: null,
    ratedDays: 0,
    categories: [],
    youtubeAvgMinutes: 0,
    youtubeBudget: 60,
    ...overrides,
  };
}

describe('isSunday', () => {
  it('recognises a sunday', () => {
    expect(isSunday('2026-08-02')).toBe(true);
  });

  it('rejects a monday and a saturday', () => {
    expect(isSunday('2026-08-03')).toBe(false);
    expect(isSunday('2026-08-01')).toBe(false);
  });
});

describe('toChartSeries', () => {
  it('keeps monday-to-sunday order', () => {
    expect(toChartSeries(makeStats()).map((p) => p.weekday)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });

  it('marks only the best day', () => {
    const series = toChartSeries(makeStats());

    expect(series.filter((p) => p.best).map((p) => p.weekday)).toEqual(['Ср']);
  });

  it('marks nothing when the week had no best day', () => {
    const series = toChartSeries(makeStats({ bestDay: null }));

    expect(series.some((p) => p.best)).toBe(false);
  });

  it('passes zero days through as zeros', () => {
    expect(toChartSeries(makeStats())[1]).toEqual({ weekday: 'Вт', pomodoros: 0, best: false });
  });
});
```

Добавить в конец `describe('api request helper', ...)` в `frontend/lib/api.spec.ts`:

```ts
  it('requests week stats for the given end date', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ weekStart: '2026-07-27' }),
    }) as unknown as typeof fetch;

    await getWeekStats('2026-08-02');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/stats/week?end=2026-08-02',
      expect.objectContaining({ method: undefined }),
    );
  });

  it('posts the weekly summary with the chart payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posted: true, withChart: true }),
    }) as unknown as typeof fetch;

    const result = await postWeeklySummary('2026-08-02', 'AAAA');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-02/weekly-summary',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ chartPng: 'AAAA' }) }),
    );
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('omits the chart field entirely when there is no image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posted: true, withChart: false }),
    }) as unknown as typeof fetch;

    await postWeeklySummary('2026-08-02', null);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-02/weekly-summary',
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
  });
```

И добавить `getWeekStats`, `postWeeklySummary` в импорт в первой строке файла.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && bun run test weekly` и `cd frontend && bun run test api`
Expected: FAIL — модуль `./weekly` не найден, `getWeekStats is not a function`.

- [ ] **Step 3: Добавить типы**

В `frontend/types/api.ts`:

```ts
export interface WeekDayStat {
  date: string;
  weekday: string;
  pomodoros: number;
  rating: number | null;
  closed: boolean;
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  days: WeekDayStat[];
  totalPomodoros: number;
  avgPomodoros: number;
  bestDay: { date: string; weekday: string; pomodoros: number } | null;
  avgRating: number | null;
  ratedDays: number;
  categories: { label: string; doneCount: number }[];
  youtubeAvgMinutes: number;
  youtubeBudget: number;
}
```

- [ ] **Step 4: Добавить функции API**

В `frontend/lib/api.ts` (тип `WeekStats` добавить в существующий импорт из `@/types/api`):

```ts
export function getWeekStats(end: string): Promise<WeekStats> {
  return request(`/stats/week?end=${end}`);
}

export function postWeeklySummary(
  date: string,
  chartPng: string | null,
): Promise<{ posted: boolean; withChart?: boolean; reason?: string }> {
  return request(`/days/${date}/weekly-summary`, {
    method: 'POST',
    body: JSON.stringify(chartPng ? { chartPng } : {}),
  });
}
```

- [ ] **Step 5: Реализовать `frontend/lib/weekly.ts`**

```ts
import type { WeekStats } from '@/types/api';

export interface ChartPoint {
  weekday: string;
  pomodoros: number;
  best: boolean;
}

export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0;
}

export function toChartSeries(stats: WeekStats): ChartPoint[] {
  return stats.days.map((d) => ({
    weekday: d.weekday,
    pomodoros: d.pomodoros,
    best: stats.bestDay != null && d.date === stats.bestDay.date,
  }));
}
```

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && bun run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/weekly.ts frontend/lib/weekly.spec.ts frontend/lib/api.ts frontend/lib/api.spec.ts frontend/types/api.ts
git commit -m "feat(frontend): клиент недельной сводки и подготовка данных графика"
```

---

### Task 6: Компонент графика и снятие PNG

**Files:**
- Create: `frontend/components/WeeklyChart.tsx`, `frontend/lib/chart-export.ts`

**Interfaces:**
- Consumes: `ChartPoint`, `toChartSeries` (Task 5).
- Produces:
  ```ts
  // WeeklyChart.tsx
  export const WEEKLY_CHART_WIDTH = 800;
  export const WEEKLY_CHART_HEIGHT = 400;
  interface WeeklyChartProps { data: ChartPoint[]; title: string }
  // forwardRef на HTMLDivElement — владелец достаёт из него смонтированный <svg>
  declare const WeeklyChart: React.ForwardRefExoticComponent<WeeklyChartProps & React.RefAttributes<HTMLDivElement>>;
  export default WeeklyChart;
  // chart-export.ts
  export async function svgToPngBase64(svg: SVGSVGElement, width: number, height: number, scale?: number): Promise<string>;
  ```
  Использует Task 7.

Юнит-тестов в этой задаче нет: компонентных тестов проект не поддерживает, а `chart-export.ts` состоит из вызовов браузерных API — их мок проверял бы мок. Обе части проверяются живым прогоном в Task 8.

- [ ] **Step 1: Создать `frontend/components/WeeklyChart.tsx`**

```tsx
'use client';

import { forwardRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts';
import type { ChartPoint } from '@/lib/weekly';
import { POMODORO_MIN } from '@/lib/pomodoro';

export const WEEKLY_CHART_WIDTH = 800;
export const WEEKLY_CHART_HEIGHT = 400;

// Литеральные hex вместо var(--…): при сериализации SVG в отрыве от документа
// CSS-переменные не разрешаются, и график уехал бы чёрно-белым.
const BG = '#1a1d24';
const BAR = '#e0574e';
const BAR_BEST = '#ff6f5c';
const TEXT = '#888d98';
const GRID = '#2a2e37';

interface WeeklyChartProps {
  data: ChartPoint[];
  title: string;
}

// forwardRef, чтобы владелец мог достать смонтированный SVG и снять с него PNG.
const WeeklyChart = forwardRef<HTMLDivElement, WeeklyChartProps>(function WeeklyChart({ data, title }, ref) {
  return (
    <div ref={ref} style={{ width: WEEKLY_CHART_WIDTH, height: WEEKLY_CHART_HEIGHT, background: BG }}>
      <BarChart
        width={WEEKLY_CHART_WIDTH}
        height={WEEKLY_CHART_HEIGHT}
        data={data}
        margin={{ top: 48, right: 32, left: 8, bottom: 16 }}
      >
        <text x={32} y={32} fill={TEXT} fontSize={18} fontFamily="sans-serif">
          {title}
        </text>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="weekday"
          tick={{ fill: TEXT, fontSize: 14, fontFamily: 'sans-serif' }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: TEXT, fontSize: 14, fontFamily: 'sans-serif' }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine
          y={POMODORO_MIN}
          stroke={TEXT}
          strokeDasharray="4 4"
          label={{ value: `минимум ${POMODORO_MIN}`, position: 'right', fill: TEXT, fontSize: 12 }}
        />
        {/* Анимацию обязательно выключить: снимок поймал бы промежуточный кадр
            и в канал уехал бы график с недорисованными столбиками. */}
        <Bar dataKey="pomodoros" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="pomodoros" position="top" fill={TEXT} fontSize={13} />
          {data.map((point) => (
            <Cell key={point.weekday} fill={point.best ? BAR_BEST : BAR} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
});

export default WeeklyChart;
```

- [ ] **Step 2: Создать `frontend/lib/chart-export.ts`**

```ts
// Снимает PNG с уже смонтированного SVG. Ничего не знает про недели и
// помидорки: на вход SVG, на выход base64 — так функцию можно переиспользовать
// для любого другого графика.
export async function svgToPngBase64(
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale = 2,
): Promise<string> {
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    // SVG прозрачен, а прозрачный PNG в тёмной теме Telegram выглядит дырой.
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  } finally {
    // Без этого каждая сводка подтекает блобом до перезагрузки страницы.
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed to rasterise chart svg'));
    image.src = url;
  });
}
```

- [ ] **Step 3: Проверить типы и сборку**

Run: `cd frontend && bunx tsc --noEmit`
Expected: без новых ошибок. В `lib/gtd.spec.ts` и `lib/streak.spec.ts` есть три ошибки, существовавшие до этой работы — их игнорировать и не чинить.

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/WeeklyChart.tsx frontend/lib/chart-export.ts
git commit -m "feat(frontend): график недели и снятие PNG с SVG"
```

---

### Task 7: Хук и подключение к закрытию дня

**Files:**
- Create: `frontend/lib/useWeeklySummary.tsx`
- Modify: `frontend/components/Dashboard.tsx`, `frontend/components/DayDetailModal.tsx`

**Interfaces:**
- Consumes: `isSunday`, `toChartSeries`, `getWeekStats`, `postWeeklySummary` (Task 5); `WeeklyChart`, `svgToPngBase64`, `WEEKLY_CHART_WIDTH`, `WEEKLY_CHART_HEIGHT` (Task 6).
- Produces:
  ```ts
  export function useWeeklySummary(): {
    sendIfSunday: (date: string) => Promise<void>;
    chartNode: React.ReactNode;   // скрытый график, который владелец обязан отрендерить
  };
  ```

Юнит-тестов нет по той же причине, что в Task 6 — это React-хук, а рендер-тестов проект не поддерживает. Проверяется живым прогоном в Task 8.

- [ ] **Step 1: Создать `frontend/lib/useWeeklySummary.tsx`**

Файл с расширением `.tsx`, а не `.ts` — он возвращает JSX.

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import type { WeekStats } from '@/types/api';
import { getWeekStats, postWeeklySummary } from '@/lib/api';
import { formatWeekRangeShort, isSunday, toChartSeries } from '@/lib/weekly';
import { svgToPngBase64 } from '@/lib/chart-export';
import WeeklyChart, { WEEKLY_CHART_HEIGHT, WEEKLY_CHART_WIDTH } from '@/components/WeeklyChart';

export function useWeeklySummary() {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);

  const sendIfSunday = useCallback(async (date: string) => {
    if (!isSunday(date)) return;

    try {
      const weekStats = await getWeekStats(date);
      setStats(weekStats);

      // Ждём кадр, чтобы React успел смонтировать график до снятия PNG.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const svg = holderRef.current?.querySelector('svg');
      const chartPng = svg
        ? await svgToPngBase64(svg as SVGSVGElement, WEEKLY_CHART_WIDTH, WEEKLY_CHART_HEIGHT)
        : null;

      // Картинка необязательна: не сняли — уходит текстовый пост, недельный
      // итог важнее графика.
      await postWeeklySummary(date, chartPng);
    } catch {
      // Сводка — побочный эффект закрытия дня. Упала отправка или рендер —
      // день всё равно закрыт, интерфейсу об этом сообщать нечего.
    } finally {
      setStats(null);
    }
  }, []);

  const chartNode = stats ? (
    <div style={{ position: 'absolute', left: -10000, top: 0 }} aria-hidden>
      <WeeklyChart
        ref={holderRef}
        data={toChartSeries(stats)}
        title={`Помидорки · ${formatWeekRangeShort(stats.weekStart, stats.weekEnd)}`}
      />
    </div>
  ) : null;

  return { sendIfSunday, chartNode };
}
```

- [ ] **Step 2: Добавить `formatWeekRangeShort` в `frontend/lib/weekly.ts`**

```ts
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function dayAndMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export function formatWeekRangeShort(weekStart: string, weekEnd: string): string {
  return `${dayAndMonth(weekStart)} — ${dayAndMonth(weekEnd)}`;
}
```

- [ ] **Step 3: Добавить тест на новую функцию**

В `frontend/lib/weekly.spec.ts` добавить `formatWeekRangeShort` в импорт и блок:

```ts
describe('formatWeekRangeShort', () => {
  it('renders both ends without a year', () => {
    expect(formatWeekRangeShort('2026-07-27', '2026-08-02')).toBe('27 июля — 2 августа');
  });
});
```

Run: `cd frontend && bun run test weekly`
Expected: PASS.

- [ ] **Step 4: Подключить в `Dashboard.tsx`**

Импорт: `import { useWeeklySummary } from '@/lib/useWeeklySummary';`

Рядом с остальными хуками в теле компонента:

```tsx
  const { sendIfSunday, chartNode } = useWeeklySummary();
```

В функции закрытия дня (`frontend/components/Dashboard.tsx:143-150`, где сейчас `setDay(await updateDay(date, { eveningClosed: !day.eveningClosed }))`) — после успешного обновления, только когда день именно закрывают, а не открывают обратно:

```tsx
      const wasClosing = !day.eveningClosed;
      setDay(await updateDay(date, { eveningClosed: !day.eveningClosed }));
      // Сводка идёт фоном: интерфейс уже показал закрытый день.
      if (wasClosing) void sendIfSunday(date);
```

В JSX, внутри корневого элемента компонента, рядом с остальными модалками:

```tsx
      {chartNode}
```

- [ ] **Step 5: Подключить в `DayDetailModal.tsx`**

Тот же импорт и вызов хука. В `toggleEveningClosed` (`frontend/components/DayDetailModal.tsx:51-60`):

```tsx
  async function toggleEveningClosed() {
    if (!day || closingDay) return;
    setClosingDay(true);
    try {
      const wasClosing = !day.eveningClosed;
      await updateDay(date, { eveningClosed: !day.eveningClosed });
      await refresh();
      if (wasClosing) void sendIfSunday(date);
    } finally {
      setClosingDay(false);
    }
  }
```

И `{chartNode}` в корневой JSX модалки.

- [ ] **Step 6: Проверить типы, тесты и сборку**

Run: `cd frontend && bun run test`
Expected: PASS.

Run: `cd frontend && bunx tsc --noEmit`
Expected: без новых ошибок (три существовавших ранее в `gtd.spec.ts` / `streak.spec.ts` игнорировать).

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): отправка недельной сводки при закрытии воскресенья"
```

---

### Task 8: Живая проверка и документация

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: всё из Task 1–7.
- Produces: ничего для кода.

Эта задача — главная проверка фичи. Автотесты не доказывают того, ради чего всё делалось: что в канал приходит **красивая картинка**. Ошибки экспорта (анимация, CSS-переменные, прозрачный фон) не ловятся ассертами — только глазами.

- [ ] **Step 1: Пересобрать стек**

Run: `docker compose up -d --build postgres backend frontend`
Expected: контейнеры поднялись, `docker compose ps` показывает их живыми. Миграция из Task 1 применяется автоматически при старте бэкенда — убедиться в этом по `docker compose logs backend`.

- [ ] **Step 2: Проверить эндпоинты вручную**

Run: `curl -s 'http://localhost:3001/stats/week?end=2026-08-02'`
Expected: JSON с `weekStart: "2026-07-27"`, `weekEnd: "2026-08-02"` и ровно семью элементами в `days`.

Run: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/days/2026-08-03/weekly-summary -H 'Content-Type: application/json' -d '{}'`
Expected: `400` — понедельник не воскресенье.

- [ ] **Step 3: Выбрать воскресенье для живого прогона**

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c "select date, \"eveningClosed\", \"telegramMessageId\", \"weeklyTelegramMessageId\" from \"Day\" where extract(dow from date) = 0 order by date desc limit 5;"`

Выбрать воскресенье, у которого `telegramMessageId` уже заполнен, а `weeklyTelegramMessageId` пуст: такой день уже публиковал дневную сводку, поэтому повторное закрытие не задублирует её в канале, а недельная уйдёт впервые. Если подходящего нет — взять любое прошедшее воскресенье и учесть, что дневная сводка тоже уйдёт.

- [ ] **Step 4: Прогнать через браузер**

Открыть http://localhost:4887, в истории кликнуть выбранное воскресенье, в модалке нажать «закрыть день» (если день уже закрыт — сначала открыть, потом закрыть).

Ожидается: в канале появляется пост с картинкой и текстом.

- [ ] **Step 5: Посмотреть на картинку глазами**

Проверить на присланном изображении:
- столбики дорисованы полностью, а не наполовину (провал = не выключена анимация);
- столбики красные, подписи серые, фон тёмный (всё серо-чёрное = слетели цвета);
- фон не прозрачный;
- подписи дней `Пн`…`Вс` читаются, числа над столбиками видны;
- пунктирная линия минимума на месте;
- лучший день недели светлее остальных.

Если любой пункт не выполняется — это дефект реализации, а не косметика: чинить и прогонять заново.

- [ ] **Step 6: Проверить идемпотентность на живом стеке**

Повторно открыть и закрыть то же воскресенье.
Expected: второго поста в канале нет.

Run: `curl -s -X POST http://localhost:3001/days/<та же дата>/weekly-summary -H 'Content-Type: application/json' -d '{}'`
Expected: `{"posted":false,"reason":"already-posted"}`.

- [ ] **Step 7: Дописать раздел в README**

Сразу после раздела «Сводка дня в Telegram» вставить:

```markdown
### Недельная сводка с графиком

При закрытии **воскресенья** в тот же канал уходит вторая, недельная сводка: картинка
с графиком помидорок по дням недели и текст с итогами — сумма и среднее за день,
лучший день, средняя оценка, сферы в формате «5/7» и среднее по YouTube.

Отдельной настройки нет: работает на тех же `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
Один пост на неделю — переоткрытие и повторное закрытие воскресенья ничего не шлёт
(идемпотентность обеспечивается полем `Day.weeklyTelegramMessageId`).

График рисует **браузер**, а не сервер: в контейнере нет ни canvas, ни шрифтов, поэтому
картинку снимает та же страница теми же компонентами, что рисуют графики в интерфейсе,
и отправляет её бэкенду готовым PNG. Практическое следствие: если закрыть воскресенье
не из браузера (например курлом), сводка уйдёт **текстом без картинки**. Если браузер
не смог снять картинку, пост тоже уходит текстом — терять недельный итог из-за сбоя
рендера незачем.
```

- [ ] **Step 8: Прогнать оба набора тестов начисто**

Run: `cd backend && bun run test`
Expected: PASS.

Run: `cd frontend && bun run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: недельная сводка в Telegram"
```
