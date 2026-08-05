# Дневная сводка: зачёт вместо стены крестиков — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести дневную сводку в Telegram к тому же языку, что недельную: помидорки с пометкой зачёта, сферы без стены крестиков.

**Architecture:** Меняется одна чистая функция `buildDaySummary` в `backend/src/telegram/telegram.helpers.ts` и её тесты. Порог зачёта импортируется из соседнего `weekly.helpers.ts` — это тот же пакет, третьей копии числа не заводим. Механика публикации, фронтенд и недельная сводка не трогаются.

**Tech Stack:** NestJS 11, Jest 30 + ts-jest, Bun.

## Global Constraints

- Все команды через **bun** из каталога `backend/`: `bun run test`, `bunx tsc --noEmit -p tsconfig.json`. Не npm/yarn/pnpm.
- Никаких новых зависимостей.
- Комментарии в коде — на русском, поясняют «почему», а не «что».
- Порог зачёта — `POMODORO_MIN` из `./weekly.helpers`. **Не объявлять третью копию числа 4.**
- Названия сфер экранируются существующим `escapeHtml` — и в списке закрытых, и в строке «Не тронуты».
- Правило схлопывания одно: нет закрытых сфер — нет ни счётчика, ни списка, только строка `Сферы не тронуты`. Отдельного понятия «пустой день» в коде быть не должно.
- Механика публикации не меняется: триггер по закрытию дня, захват `Day.telegramMessageId`, `TelegramService.postDaySummary`.

## File Structure

| Файл | Что меняется |
|---|---|
| `backend/src/telegram/telegram.helpers.ts` | `buildDaySummary`: строка помидорок с зачётом, блок сфер без крестиков |
| `backend/src/telegram/telegram.helpers.spec.ts` | Тесты на новый формат |

---

### Task 1: Новый формат дневной сводки

**Files:**
- Modify: `backend/src/telegram/telegram.helpers.ts`
- Test: `backend/src/telegram/telegram.helpers.spec.ts`

**Interfaces:**
- Consumes: `POMODORO_MIN` из `./weekly.helpers`; существующие `escapeHtml`, `formatRuDate` и тип `DaySummaryInput` из этого же файла (`{ date, pomodoros, rating, comment, categories: { label, done }[] }`).
- Produces: `buildDaySummary(day: DaySummaryInput): string` с новым форматом. Сигнатура не меняется — вызывающий код (`TelegramService.postDaySummary`) не трогается.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `backend/src/telegram/telegram.helpers.spec.ts`. Хелпер для входа объявить рядом с тестами:

```ts
function makeDay(overrides: Partial<Parameters<typeof buildDaySummary>[0]> = {}) {
  return {
    date: '2026-08-05',
    pomodoros: 0,
    rating: null,
    comment: null,
    categories: [] as { label: string; done: boolean }[],
    ...overrides,
  };
}

describe('buildDaySummary pomodoro line', () => {
  it('marks a day that reached the minimum', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 6 }))).toContain('🍅 Помидорок: 6 — день в зачёте');
  });

  it('marks exactly the minimum as qualified', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 4 }))).toContain('🍅 Помидорок: 4 — день в зачёте');
  });

  it('says how many are missing below the minimum', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 3 }))).toContain('🍅 Помидорок: 3 — до зачёта не хватило 1');
    expect(buildDaySummary(makeDay({ pomodoros: 1 }))).toContain('🍅 Помидорок: 1 — до зачёта не хватило 3');
  });

  it('does not nag on a day with nothing at all', () => {
    const text = buildDaySummary(makeDay({ pomodoros: 0 }));

    expect(text).toContain('🍅 Помидорок: 0');
    expect(text).not.toContain('не хватило');
    expect(text).not.toContain('зачёт');
  });
});

describe('buildDaySummary spheres', () => {
  it('lists only the closed spheres with a counter', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: true },
          { label: 'Финансы', done: false },
          { label: 'Обучение', done: true },
        ],
      }),
    );

    expect(text).toContain('Сферы — 2 / 3');
    expect(text).toContain('✅ Спорт');
    expect(text).toContain('✅ Обучение');
    expect(text).not.toContain('❌');
  });

  it('collapses untouched spheres into one line', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: true },
          { label: 'Финансы', done: false },
          { label: 'Проекты', done: false },
        ],
      }),
    );

    expect(text).toContain('Не тронуты: Финансы, Проекты');
  });

  it('omits the untouched line when everything is closed', () => {
    const text = buildDaySummary(makeDay({ categories: [{ label: 'Спорт', done: true }] }));

    expect(text).not.toContain('Не тронуты');
  });

  it('collapses the whole block when nothing is closed', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: false },
          { label: 'Финансы', done: false },
        ],
      }),
    );

    expect(text).toContain('Сферы не тронуты');
    expect(text).not.toContain('Не тронуты:');
    expect(text).not.toContain('Сферы —');
    expect(text).not.toContain('❌');
  });

  it('omits the block entirely when there are no categories', () => {
    const text = buildDaySummary(makeDay({ categories: [] }));

    expect(text).not.toContain('Сферы');
  });

  it('escapes html in both the closed list and the untouched line', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт <b>', done: true },
          { label: 'Финансы <i>', done: false },
        ],
      }),
    );

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).toContain('Финансы &lt;i&gt;');
    expect(text).not.toContain('<b>');
    expect(text).not.toContain('<i>');
  });
});

describe('buildDaySummary rating and comment', () => {
  it('keeps printing the rating and the comment when set', () => {
    const text = buildDaySummary(makeDay({ rating: 8, comment: 'Разобрал бэклог' }));

    expect(text).toContain('⭐ Оценка: 8/10');
    expect(text).toContain('💬 Разобрал бэклог');
  });

  it('omits both when unset', () => {
    const text = buildDaySummary(makeDay());

    expect(text).not.toContain('Оценка');
    expect(text).not.toContain('💬');
  });
});
```

Существующие тесты `buildDaySummary` в этом файле проверяли старый формат (`Сферы — 0 / 6` со списком `❌`). Те из них, что противоречат новому формату, надо привести в соответствие, а не удалить: сохрани смысл проверки, поменяв ожидание. Что именно поправил — в отчёт.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && bun run test telegram.helpers`
Expected: FAIL — в тексте нет ни «день в зачёте», ни «Не тронуты», зато есть `❌`.

- [ ] **Step 3: Переписать `buildDaySummary`**

В `backend/src/telegram/telegram.helpers.ts` добавить импорт порога к существующим:

```ts
import { POMODORO_MIN } from './weekly.helpers';
```

И заменить функцию целиком:

```ts
// Строка помидорок в том же языке, что недельная сводка: день либо в зачёте,
// либо видно, сколько не хватило. При нуле — только число: напоминать про
// недостачу в день, который толком не начался, незачем.
function pomodoroLine(pomodoros: number): string {
  if (pomodoros >= POMODORO_MIN) return `🍅 Помидорок: ${pomodoros} — день в зачёте`;
  if (pomodoros > 0) return `🍅 Помидорок: ${pomodoros} — до зачёта не хватило ${POMODORO_MIN - pomodoros}`;
  return `🍅 Помидорок: ${pomodoros}`;
}

export function buildDaySummary(day: DaySummaryInput): string {
  const lines: string[] = [`📅 ${formatRuDate(day.date)}`, '', pomodoroLine(day.pomodoros)];

  if (day.rating != null) {
    lines.push(`⭐ Оценка: ${day.rating}/10`);
  }

  if (day.categories.length > 0) {
    const done = day.categories.filter((c) => c.done);
    const untouched = day.categories.filter((c) => !c.done);

    // Ни одной закрытой — весь блок схлопывается в одну строку. Счётчик
    // «0 / 6» и список крестиков ровно ничего не добавляли, кроме упрёка.
    if (done.length === 0) {
      lines.push('', 'Сферы не тронуты');
    } else {
      lines.push('', `Сферы — ${done.length} / ${day.categories.length}`);
      for (const c of done) {
        lines.push(`✅ ${escapeHtml(c.label)}`);
      }
      if (untouched.length > 0) {
        lines.push(`Не тронуты: ${untouched.map((c) => escapeHtml(c.label)).join(', ')}`);
      }
    }
  }

  const comment = day.comment?.trim();
  if (comment) {
    lines.push('', `💬 ${escapeHtml(comment)}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend && bun run test telegram`
Expected: PASS, включая тесты `TelegramService` и недельной сводки.

Run: `cd backend && bun run test`
Expected: PASS, весь набор.

Run: `cd backend && bunx tsc --noEmit -p tsconfig.json`
Expected: без ошибок типов.

- [ ] **Step 5: Проверить, что не появилось циклического импорта**

`telegram.helpers.ts` теперь импортирует из `weekly.helpers.ts`, а `weekly.helpers.ts` импортирует `escapeHtml` из `telegram.helpers.ts`. Это цикл на уровне модулей.

Run: `cd backend && bun run test weekly.helpers`
Expected: PASS. Обе функции вызываются после полной загрузки модулей, поэтому цикл безопасен — но убедиться надо, а не предположить.

Если тесты падают с `undefined` вместо значения константы или функции — цикл всё-таки кусается. В этом случае вынеси `POMODORO_MIN` и `escapeHtml` в новый `backend/src/telegram/telegram.constants.ts`, импортируй оба файла из него и опиши это решение в отчёте.

- [ ] **Step 6: Commit**

```bash
git add backend/src/telegram/
git commit -m "feat(backend): дневная сводка без стены крестиков"
```

---

### Task 2: Живая проверка

**Files:** правок кода не предполагается.

- [ ] **Step 1: Пересобрать бэкенд**

Run: `docker compose up -d --build backend`
Expected: контейнер поднялся.

- [ ] **Step 2: Убедиться, что сегодняшний день открыт и не публиковался**

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c "select date, \"eveningClosed\", \"telegramMessageId\", pomodoros from \"Day\" where date = '2026-08-05';"`
Expected: `eveningClosed = f`, `telegramMessageId` пуст. Если не так — обнулить:

```bash
docker compose exec -T postgres psql -U tracker -d tracker -c "update \"Day\" set \"eveningClosed\" = false, \"telegramMessageId\" = null where date = '2026-08-05';"
```

- [ ] **Step 3: Опубликовать дневную сводку**

Run: `curl -s -X PATCH http://localhost:3001/days/2026-08-05 -H 'Content-Type: application/json' -d '{"eveningClosed": true}'`
Expected: JSON дня с `"eveningClosed":true`.

Это закрытие дня через API, а не через браузер: недельная сводка при этом не отправится (день не воскресенье), а дневная уйдёт — она и проверяется.

- [ ] **Step 4: Проверить пост**

Посмотреть на сообщение в канале. Ожидается для дня с нулём помидорок и нулём закрытых сфер:

```
📅 5 августа 2026, среда

🍅 Помидорок: 0
Сферы не тронуты
```

Ни одного `❌`, ни строки `Сферы — 0 / 6`.

- [ ] **Step 5: Вернуть день в исходное состояние**

Публикация — часть проверки, а закрытый день — нет: 5 августа ещё не прожит.

Run: `docker compose exec -T postgres psql -U tracker -d tracker -c "update \"Day\" set \"eveningClosed\" = false, \"telegramMessageId\" = null where date = '2026-08-05';"`
Expected: `UPDATE 1`. После этого вечернее закрытие дня опубликует настоящую сводку.

Сообщение проверки из канала удаляет владелец руками — из кода это не делается.
