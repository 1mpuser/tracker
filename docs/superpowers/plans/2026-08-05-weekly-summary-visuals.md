# Визуал недельной сводки: зачёт вместо упрёка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать вид недельной сводки в Telegram так, чтобы она подсвечивала засчитанные дни, а не перечисляла провалы.

**Architecture:** Данные и механика публикации не трогаются вообще. Меняется текст сводки (`weekly.helpers.ts` на бэкенде) и раскраска графика (`WeeklyChart.tsx` плюс подготовка серии в `lib/weekly.ts` на фронте). Цвет столбика перестаёт значить «помидорки» и начинает значить «день в зачёте».

**Tech Stack:** NestJS 11, Jest 30 + ts-jest, Next.js 16, React 19, Recharts 3, Bun.

## Global Constraints

- Все команды через **bun**: `bun run test` из `backend/` и из `frontend/`. Не npm/yarn/pnpm.
- Никаких новых зависимостей.
- Комментарии и сообщения в коде — на русском, поясняют «почему», а не «что».
- **Зелёного в палитре нет и вводить его нельзя.** Контраст строится на ярком и приглушённом.
- Порог зачёта — `POMODORO_MIN = 4`. На фронте он уже есть в `frontend/lib/pomodoro.ts`; в бэкенде появляется вторая копия, **обе получают комментарий со ссылкой друг на друга**.
- Механика публикации не меняется: триггер, захват `Day.weeklyTelegramMessageId`, коды `400`/`409`/`502`, необязательность картинки, лимит подписи 1024.
- В `WeeklyChart.tsx` нельзя трогать: фиксированные 800×400, `isAnimationActive={false}`, литеральные hex вместо `var(--…)`, `fontFamily` на всех текстах. Это условия корректного снятия PNG.
- Тесты фронта матчатся как `.*\.spec\.ts$`; компонентных рендер-тестов в проекте нет и заводить их нельзя.
- В `frontend/lib/gtd.spec.ts` и `streak.spec.ts` есть три ошибки `tsc --noEmit`, существовавшие до этой работы — не чинить, новых не добавлять.

## File Structure

| Файл | Что меняется |
|---|---|
| `backend/src/telegram/weekly.helpers.ts` | Порог зачёта, строка «В зачёте», пороги значков, свёртка нетронутых сфер, склонение дней |
| `backend/src/telegram/weekly.helpers.spec.ts` | Тесты на всё перечисленное |
| `frontend/lib/weekly.ts` | `ChartPoint.best` → `ChartPoint.qualified` |
| `frontend/lib/weekly.spec.ts` | Тесты на `qualified` |
| `frontend/components/WeeklyChart.tsx` | Раскраска столбиков по зачёту |
| `frontend/lib/useWeeklySummary.tsx` | Заголовок картинки с «N из 7 в зачёте» |

---

### Task 1: Текст сводки

**Files:**
- Modify: `backend/src/telegram/weekly.helpers.ts`
- Test: `backend/src/telegram/weekly.helpers.spec.ts`

**Interfaces:**
- Consumes: тип `WeekStats` из `../stats/stats.service` (поля `days[].pomodoros`, `categories[].label/doneCount`, `ratedDays`, `avgRating`, `bestDay`, `totalPomodoros`, `avgPomodoros`).
- Produces:
  ```ts
  export const POMODORO_MIN = 4;
  export function categoryIcon(doneCount: number): string;   // '✅' | '⚠️'
  export function pluralDays(count: number): string;         // 'дню' | 'дням'
  export function buildWeekSummary(stats: WeekStats): string;
  ```

- [ ] **Step 1: Написать падающие тесты**

Заменить существующий блок `describe('categoryIcon', …)` целиком и дописать остальное в `backend/src/telegram/weekly.helpers.spec.ts`. Импорт в первой строке файла дополнить: `categoryIcon, pluralDays`.

```ts
describe('categoryIcon', () => {
  it('marks five or more days as done', () => {
    expect(categoryIcon(5)).toBe('✅');
    expect(categoryIcon(7)).toBe('✅');
  });

  it('marks anything below five as partial', () => {
    expect(categoryIcon(4)).toBe('⚠️');
    expect(categoryIcon(1)).toBe('⚠️');
  });
});

describe('pluralDays', () => {
  it('uses the singular form for one', () => {
    expect(pluralDays(1)).toBe('дню');
    expect(pluralDays(21)).toBe('дню');
  });

  it('uses the plural form for the rest', () => {
    expect(pluralDays(2)).toBe('дням');
    expect(pluralDays(5)).toBe('дням');
    expect(pluralDays(0)).toBe('дням');
  });

  it('uses the plural form for the teens, where the last digit lies', () => {
    expect(pluralDays(11)).toBe('дням');
    expect(pluralDays(14)).toBe('дням');
  });
});

describe('buildWeekSummary qualified days', () => {
  const day = (date: string, weekday: string, pomodoros: number) => ({
    date,
    weekday,
    pomodoros,
    rating: null,
    closed: true,
  });

  it('counts days at or above the pomodoro minimum', () => {
    const text = buildWeekSummary(
      makeStats({
        days: [
          day('2026-07-27', 'Пн', 4),
          day('2026-07-28', 'Вт', 9),
          day('2026-07-29', 'Ср', 3),
          day('2026-07-30', 'Чт', 0),
          day('2026-07-31', 'Пт', 0),
          day('2026-08-01', 'Сб', 0),
          day('2026-08-02', 'Вс', 0),
        ],
      }),
    );

    expect(text).toContain('✅ В зачёте: 2 из 7 дней');
  });

  it('still reports a week with nothing qualified', () => {
    const text = buildWeekSummary(makeStats({ days: [day('2026-07-27', 'Пн', 3)] }));

    expect(text).toContain('✅ В зачёте: 0 из 7 дней');
  });
});

describe('buildWeekSummary spheres', () => {
  it('lists only the spheres with something done', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 1 },
          { label: 'Обучение', doneCount: 6 },
        ],
      }),
    );

    expect(text).toContain('⚠️ Финансы 1/7');
    expect(text).toContain('✅ Обучение 6/7');
    expect(text).not.toContain('Спорт 0/7');
  });

  it('collapses untouched spheres into one quiet line', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 1 },
          { label: 'Проекты', doneCount: 0 },
        ],
      }),
    );

    expect(text).toContain('Не тронуты: Спорт, Проекты');
    expect(text).not.toContain('❌');
  });

  it('omits the untouched line when every sphere was touched', () => {
    const text = buildWeekSummary(
      makeStats({ categories: [{ label: 'Спорт', doneCount: 2 }] }),
    );

    expect(text).not.toContain('Не тронуты');
  });

  it('keeps only the untouched line when nothing was touched', () => {
    const text = buildWeekSummary(
      makeStats({
        categories: [
          { label: 'Спорт', doneCount: 0 },
          { label: 'Финансы', doneCount: 0 },
        ],
      }),
    );

    expect(text).toContain('Сферы за неделю');
    expect(text).toContain('Не тронуты: Спорт, Финансы');
    expect(text).not.toContain('0/7');
  });

  it('escapes html in the untouched line too', () => {
    const text = buildWeekSummary(
      makeStats({ categories: [{ label: 'Спорт <b>', doneCount: 0 }] }),
    );

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).not.toContain('<b>');
  });
});

describe('buildWeekSummary rating line', () => {
  it('declines the day count correctly', () => {
    expect(buildWeekSummary(makeStats({ avgRating: 3, ratedDays: 1 }))).toContain('(по 1 дню)');
    expect(buildWeekSummary(makeStats({ avgRating: 3, ratedDays: 6 }))).toContain('(по 6 дням)');
  });
});
```

Существующий хелпер `makeStats` в этом файле не имеет поля `days` в дефолтах — дополнить его дефолт пустым массивом, если его там нет, чтобы новые тесты могли переопределять только нужное.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test weekly.helpers`
Expected: FAIL — `pluralDays is not a function`, `categoryIcon(1)` возвращает `❌`, в тексте нет строки «В зачёте».

- [ ] **Step 3: Переписать `weekly.helpers.ts`**

Добавить константу рядом с остальными в шапке файла:

```ts
// Порог «зачётного» дня. Должен совпадать с POMODORO_MIN в
// frontend/lib/pomodoro.ts: там по нему красится график, здесь — считается
// строка «В зачёте». Разъедутся — картинка и текст начнут противоречить.
export const POMODORO_MIN = 4;
```

Заменить `categoryIcon` (ветка `❌` больше не нужна — нулевые сферы в список не попадают):

```ts
export function categoryIcon(doneCount: number): string {
  return doneCount >= 5 ? '✅' : '⚠️';
}
```

Добавить склонение:

```ts
// Русское счётное склонение: остаток 11–14 всегда даёт «дням», иначе решает
// последняя цифра. Без этого получалось «по 1 дням».
export function pluralDays(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'дням';
  return count % 10 === 1 ? 'дню' : 'дням';
}
```

Заменить тело `buildWeekSummary` целиком:

```ts
export function buildWeekSummary(stats: WeekStats): string {
  const qualifiedDays = stats.days.filter((d) => d.pomodoros >= POMODORO_MIN).length;

  const lines: string[] = [
    `📊 Неделя ${formatWeekRange(stats.weekStart, stats.weekEnd)}`,
    '',
    `🍅 Помидорок: ${stats.totalPomodoros} (в среднем ${stats.avgPomodoros}/день)`,
    // Ставится всегда, даже при нуле: это объяснение раскраске графика,
    // а не похвала, и без него картинка читается как загадка.
    `✅ В зачёте: ${qualifiedDays} из ${DAYS_IN_WEEK} дней`,
  ];

  if (stats.bestDay) {
    const weekdayName = WEEKDAYS_FULL[parseDateParam(stats.bestDay.date).getUTCDay()];
    lines.push(`🔥 Лучший день: ${weekdayName} — ${stats.bestDay.pomodoros}`);
  }

  if (stats.avgRating != null) {
    lines.push(`⭐ Средняя оценка: ${stats.avgRating}/10 (по ${stats.ratedDays} ${pluralDays(stats.ratedDays)})`);
  }

  if (stats.categories.length > 0) {
    lines.push('', 'Сферы за неделю');

    // Нетронутые сферы уезжают в одну спокойную строку: стена из крестиков
    // была главной причиной, по которой сводка читалась как выговор.
    const touched = stats.categories.filter((c) => c.doneCount > 0);
    const untouched = stats.categories.filter((c) => c.doneCount === 0);

    for (const c of touched) {
      lines.push(`${categoryIcon(c.doneCount)} ${escapeHtml(c.label)} ${c.doneCount}/${DAYS_IN_WEEK}`);
    }
    if (untouched.length > 0) {
      lines.push(`Не тронуты: ${untouched.map((c) => escapeHtml(c.label)).join(', ')}`);
    }
  }

  lines.push('', `📺 YouTube: ${stats.youtubeAvgMinutes} мин/день при бюджете ${stats.youtubeBudget}`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && bun run test weekly.helpers`
Expected: PASS, включая существующие тесты этого файла.

Run: `cd backend && bun run test`
Expected: PASS, весь набор.

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/
git commit -m "feat(backend): недельная сводка подсвечивает зачёт вместо провалов"
```

---

### Task 2: Раскраска графика

**Files:**
- Modify: `frontend/lib/weekly.ts`, `frontend/components/WeeklyChart.tsx`, `frontend/lib/useWeeklySummary.tsx`
- Test: `frontend/lib/weekly.spec.ts`

**Interfaces:**
- Consumes: `POMODORO_MIN` из `@/lib/pomodoro`; `WeekStats` из `@/types/api`.
- Produces:
  ```ts
  export interface ChartPoint { weekday: string; pomodoros: number; qualified: boolean }
  export function toChartSeries(stats: WeekStats): ChartPoint[];
  ```
  Поле `best` удаляется — после этой задачи им никто не пользуется.

- [ ] **Step 1: Переписать тесты серии**

В `frontend/lib/weekly.spec.ts` заменить блок `describe('toChartSeries', …)` целиком:

```ts
describe('toChartSeries', () => {
  it('keeps monday-to-sunday order', () => {
    expect(toChartSeries(makeStats()).map((p) => p.weekday)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });

  it('marks days at or above the pomodoro minimum as qualified', () => {
    const series = toChartSeries(makeStats());

    expect(series.filter((p) => p.qualified).map((p) => p.weekday)).toEqual(['Пн', 'Ср', 'Пт']);
  });

  it('marks nothing when no day reached the minimum', () => {
    const stats = makeStats();
    const series = toChartSeries({ ...stats, days: stats.days.map((d) => ({ ...d, pomodoros: 1 })) });

    expect(series.some((p) => p.qualified)).toBe(false);
  });

  it('passes zero days through as zeros', () => {
    expect(toChartSeries(makeStats())[1]).toEqual({ weekday: 'Вт', pomodoros: 0, qualified: false });
  });
});
```

Хелпер `makeStats` в этом файле отдаёт дни с помидорками `Пн 4, Вт 0, Ср 8, Чт 2, Пт 5, Сб 1, Вс 3` — при пороге 4 в зачёт попадают ровно Пн, Ср и Пт, как и ожидают тесты выше. Сам хелпер менять не нужно.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && bun run test weekly`
Expected: FAIL — у точек серии нет поля `qualified`.

- [ ] **Step 3: Переписать `toChartSeries`**

В `frontend/lib/weekly.ts`:

```ts
import type { WeekStats } from '@/types/api';
import { POMODORO_MIN } from '@/lib/pomodoro';

export interface ChartPoint {
  weekday: string;
  pomodoros: number;
  qualified: boolean;
}

export function toChartSeries(stats: WeekStats): ChartPoint[] {
  return stats.days.map((d) => ({
    weekday: d.weekday,
    pomodoros: d.pomodoros,
    qualified: d.pomodoros >= POMODORO_MIN,
  }));
}
```

Остальное в файле (`isSunday`, `formatWeekRangeShort`, массив месяцев) не трогать.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && bun run test weekly`
Expected: PASS.

- [ ] **Step 5: Перекрасить график**

В `frontend/components/WeeklyChart.tsx` заменить цветовые константы:

```ts
// Литеральные hex вместо var(--…): при сериализации SVG в отрыве от документа
// CSS-переменные не разрешаются, и график уехал бы чёрно-белым.
const BG = '#1a1d24';
// Цвет столбика значит «день в зачёте», а не «сколько помидорок»: яркий —
// набрал минимум, приглушённый — нет. Так сводка подсвечивает засчитанное,
// а не орёт красным на каждый провал.
const BAR_QUALIFIED = '#ff6f5c';
const BAR_MISSED = '#2f343d';
const TEXT = '#888d98';
const GRID = '#2a2e37';
```

И заменить раскраску ячеек (сейчас там `point.best ? BAR_BEST : BAR`):

```tsx
          {data.map((point) => (
            <Cell key={point.weekday} fill={point.qualified ? BAR_QUALIFIED : BAR_MISSED} />
          ))}
```

Больше в этом файле ничего не менять: размеры, `isAnimationActive={false}`, `fontFamily` на всех текстах, `margin`, `ReferenceLine` остаются как есть.

- [ ] **Step 6: Добавить счётчик зачёта в заголовок картинки**

В `frontend/lib/useWeeklySummary.tsx` — импорт `POMODORO_MIN` из `@/lib/pomodoro` к существующим, и заголовок:

```tsx
  const chartNode = stats ? (
    <div style={{ position: 'absolute', left: -10000, top: 0 }} aria-hidden>
      <WeeklyChart
        ref={holderRef}
        data={toChartSeries(stats)}
        title={`Помидорки · ${formatWeekRangeShort(stats.weekStart, stats.weekEnd)} · ${
          stats.days.filter((d) => d.pomodoros >= POMODORO_MIN).length
        } из ${stats.days.length} в зачёте`}
      />
    </div>
  ) : null;
```

Всё остальное в хуке не трогать: скрытие через `left: -10000`, двойной `requestAnimationFrame`, `try/catch/finally`, `console.warn`.

- [ ] **Step 7: Проверить типы, тесты и сборку**

Run: `cd frontend && bun run test`
Expected: PASS.

Run: `cd frontend && bunx tsc --noEmit`
Expected: ровно три дореализационные ошибки в `gtd.spec.ts` и `streak.spec.ts`, новых нет. Если появилась ошибка про несуществующее поле `best` — значит где-то остался его потребитель, найди и поправь.

Run: `cd frontend && bun run build`
Expected: сборка проходит.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): график недели красит дни по зачёту"
```

---

### Task 3: Живая проверка

**Files:** правок кода не предполагается.

**Interfaces:**
- Consumes: всё из Task 1–2.

Эта задача — единственная проверка того, ради чего работа затевалась. Автотесты не показывают, как выглядит картинка.

- [ ] **Step 1: Пересобрать стек**

Run: `docker compose up -d --build backend frontend`
Expected: контейнеры поднялись.

- [ ] **Step 2: Освободить слот недели**

За воскресенье `2026-08-02` сводка уже публиковалась, и идемпотентность заблокирует повторную публикацию. Освободить:

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c "update \"Day\" set \"weeklyTelegramMessageId\" = null where date = '2026-08-02';"`
Expected: `UPDATE 1`.

Эта неделя подходит для проверки: помидорки по дням `2, 4, 0, 0, 0, 0, 0`, то есть есть и зачётный день (вторник, 4), и провальные — ровно тот контраст, который надо увидеть.

- [ ] **Step 3: Опубликовать сводку**

Прогнать через браузер: открыть http://localhost:4887, найти в истории 2 августа, открыть модалку, снять и снова поставить отметку закрытия дня.

Если браузерное управление недоступно, вместо этого поднять headless Chrome по DevTools Protocol и прокликать то же самое, перехватив PNG из тела уходящего запроса (`Network.requestWillBeSent`, поле `request.postData`, ключ `chartPng`). Сохранить перехваченный PNG в файл.

- [ ] **Step 4: Посмотреть на картинку глазами**

Открыть сохранённый PNG инструментом Read и проверить по пунктам:
- столбик вторника (4 помидорки) — яркий `#ff6f5c`;
- столбик понедельника (2 помидорки) — приглушённый, почти сливается с фоном и не притягивает взгляд;
- заголовок содержит «1 из 7 в зачёте»;
- пунктирная линия минимума на месте и объясняет раскраску;
- столбики дорисованы целиком, шрифты одинаковые, фон не прозрачный.

- [ ] **Step 5: Прочитать текст поста**

Проверить в ответе бэкенда и в самом посте:
- есть строка `✅ В зачёте: 1 из 7 дней`;
- в сферах нет ни одного `❌`;
- нетронутые сферы собраны в строку `Не тронуты: …`;
- строка оценки склоняется верно (`по 1 дню`).

- [ ] **Step 6: Прогнать оба набора тестов начисто**

Run: `cd backend && bun run test`
Expected: PASS.

Run: `cd frontend && bun run test`
Expected: PASS.
