# Сводка дня в Telegram-канал — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При закрытии дня (`Day.eveningClosed: false → true`) бэкенд публикует одно сводное сообщение в Telegram-канал через бота — дата, день недели, помидорки, бинарный список сфер, оценка, комментарий.

**Architecture:** Новый env-gated модуль `backend/src/telegram/` по образцу `backend/src/obsidian/` и `backend/src/icloud/`: чистые хелперы форматирования + тонкий сервис поверх `fetch`. `DaysService.updateDay` дёргает его и сохраняет вернувшийся `message_id` в новое поле `Day.telegramMessageId`, которое служит ключом идемпотентности («один пост на дату навсегда»). Отправка best-effort: любая ошибка логируется и не ломает закрытие дня. Фронтенд не меняется.

**Tech Stack:** NestJS, Prisma, Jest (ts-jest), встроенный `fetch` (новых зависимостей нет), Bun как рантайм и пакетный менеджер.

## Global Constraints

- Пакетный менеджер и рантайм — **Bun**: `bun install`, `bun run`, `bunx`. Не npm/yarn/pnpm.
- Все команды бэкенда запускаются из каталога `backend/`.
- Новых npm-зависимостей не добавлять — HTTP-вызов делается встроенным `fetch`.
- Тесты бэкенда мокают `PrismaService` напрямую, без `@nestjs/testing` TestingModule: `new XService(mockPrisma, ...)` с `any`-моками. Следовать этому стилю.
- `backend/tsconfig.json` имеет `strictPropertyInitialization: false` — не добавлять `!` к полям DTO и не трогать флаг.
- Даты обрабатываются только через UTC-безопасные хелперы из `backend/src/common/date.util.ts`. `toLocaleDateString` не использовать нигде.
- Обе env-переменные (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) необязательны: если любая пуста — интеграция молча выключена, сетевого вызова не происходит.
- Ошибка отправки никогда не бросается наружу и не влияет на HTTP-ответ `PATCH /days/:date`.
- В коммитах не добавлять трейлер `Co-Authored-By` и любые упоминания AI.
- Сообщения коммитов — на русском, в стиле существующей истории (`feat(backend): ...`, `docs: ...`).

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `backend/src/telegram/telegram.helpers.ts` (создать) | Чистое форматирование: экранирование HTML, русская дата с днём недели, сборка тела сообщения. Не знает ни про сеть, ни про Prisma. |
| `backend/src/telegram/telegram.helpers.spec.ts` (создать) | Тесты хелперов. |
| `backend/src/telegram/telegram.service.ts` (создать) | Один сетевой вызов `sendMessage`, чтение env, проглатывание ошибок. Не знает про Prisma. |
| `backend/src/telegram/telegram.service.spec.ts` (создать) | Тесты сервиса с подменённым `global.fetch`. |
| `backend/src/telegram/telegram.module.ts` (создать) | Провайдит и экспортирует `TelegramService`. |
| `backend/prisma/schema.prisma` (изменить) | Поле `telegramMessageId Int?` в `model Day`. |
| `backend/src/days/days.service.ts` (изменить) | Вызов отправки из `updateDay` + сохранение `message_id`. |
| `backend/src/days/days.service.spec.ts` (изменить) | Тесты условия отправки. |
| `backend/src/days/days.module.ts` (изменить) | Импорт `TelegramModule`. |
| `.env.example`, `docker-compose.yml`, `README.md` (изменить) | Проброс и документирование двух переменных. |

---

### Task 1: Чистые хелперы форматирования

**Files:**
- Create: `backend/src/telegram/telegram.helpers.ts`
- Test: `backend/src/telegram/telegram.helpers.spec.ts`

**Interfaces:**
- Consumes: `parseDateParam(dateStr: string): Date` из `backend/src/common/date.util.ts`.
- Produces:
  - `export interface DaySummaryInput { date: string; pomodoros: number; rating: number | null; comment: string | null; categories: { label: string; done: boolean }[] }`
  - `export function escapeHtml(s: string): string`
  - `export function formatRuDate(dateStr: string): string`
  - `export function buildDaySummary(day: DaySummaryInput): string`

`DaySummaryInput` намеренно объявлен локально, а не импортирован из `days.service.ts`: `DaysModule` будет импортировать `TelegramModule`, и обратный импорт замкнул бы зависимость. `DayView` структурно удовлетворяет этому интерфейсу (у него есть все пять полей плюс лишние), поэтому TypeScript пропустит его без приведения типов. Тот же приём уже применён в `backend/src/obsidian/obsidian.service.ts` (локальный `RefItem`).

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/telegram/telegram.helpers.spec.ts`:

```ts
import { buildDaySummary, escapeHtml, formatRuDate } from './telegram.helpers';

describe('escapeHtml', () => {
  it('escapes the three characters Telegram HTML mode cares about', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('escapes the ampersand first so entities are not double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves plain Cyrillic text untouched', () => {
    expect(escapeHtml('Спорт и чтение')).toBe('Спорт и чтение');
  });
});

describe('formatRuDate', () => {
  it('formats a date as day, genitive month, year, weekday', () => {
    expect(formatRuDate('2026-08-01')).toBe('1 августа 2026, суббота');
  });

  it('does not shift by a day on a month boundary', () => {
    expect(formatRuDate('2026-02-01')).toBe('1 февраля 2026, воскресенье');
    expect(formatRuDate('2026-01-31')).toBe('31 января 2026, суббота');
  });

  it('handles the last day of the year', () => {
    expect(formatRuDate('2026-12-31')).toBe('31 декабря 2026, четверг');
  });
});

describe('buildDaySummary', () => {
  const base = {
    date: '2026-08-01',
    pomodoros: 7,
    rating: 8,
    comment: 'Тяжёлое утро, но вытянул вечер',
    categories: [
      { label: 'Спорт', done: true },
      { label: 'Английский', done: true },
      { label: 'Медитация', done: false },
    ],
  };

  it('renders a full day', () => {
    expect(buildDaySummary(base)).toBe(
      [
        '📅 1 августа 2026, суббота',
        '',
        '🍅 Помидорок: 7',
        '⭐ Оценка: 8/10',
        '',
        'Сферы — 2 / 3',
        '✅ Спорт',
        '✅ Английский',
        '❌ Медитация',
        '',
        '💬 Тяжёлое утро, но вытянул вечер',
      ].join('\n'),
    );
  });

  it('omits the rating line when rating is null', () => {
    expect(buildDaySummary({ ...base, rating: null })).not.toContain('Оценка');
  });

  it('omits the comment line when comment is null or blank', () => {
    expect(buildDaySummary({ ...base, comment: null })).not.toContain('💬');
    expect(buildDaySummary({ ...base, comment: '   ' })).not.toContain('💬');
  });

  it('trims the comment', () => {
    expect(buildDaySummary({ ...base, comment: '  ок  ' })).toContain('💬 ок');
  });

  it('always prints the pomodoro line, even at zero', () => {
    expect(buildDaySummary({ ...base, pomodoros: 0 })).toContain('🍅 Помидорок: 0');
  });

  it('omits the spheres block entirely when there are no active categories', () => {
    const result = buildDaySummary({ ...base, categories: [] });
    expect(result).not.toContain('Сферы');
    expect(result).not.toContain('✅');
  });

  it('counts all categories as done when they all are', () => {
    const result = buildDaySummary({
      ...base,
      categories: [
        { label: 'Спорт', done: true },
        { label: 'Код', done: true },
      ],
    });
    expect(result).toContain('Сферы — 2 / 2');
    expect(result).not.toContain('❌');
  });

  it('escapes html-significant characters in category labels and comment', () => {
    const result = buildDaySummary({
      ...base,
      categories: [{ label: 'Код <всё>', done: true }],
      comment: 'a & b',
    });
    expect(result).toContain('✅ Код &lt;всё&gt;');
    expect(result).toContain('💬 a &amp; b');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && bunx jest telegram.helpers.spec.ts`
Expected: FAIL — `Cannot find module './telegram.helpers'`.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `backend/src/telegram/telegram.helpers.ts`:

```ts
import { parseDateParam } from '../common/date.util';

export interface DaySummaryInput {
  date: string;
  pomodoros: number;
  rating: number | null;
  comment: string | null;
  categories: { label: string; done: boolean }[];
}

// Родительный падеж — строка читается как «1 августа 2026».
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatRuDate(dateStr: string): string {
  const date = parseDateParam(dateStr);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${WEEKDAYS[date.getUTCDay()]}`;
}

export function buildDaySummary(day: DaySummaryInput): string {
  const lines: string[] = [`📅 ${formatRuDate(day.date)}`, '', `🍅 Помидорок: ${day.pomodoros}`];

  if (day.rating !== null) {
    lines.push(`⭐ Оценка: ${day.rating}/10`);
  }

  if (day.categories.length > 0) {
    const done = day.categories.filter((c) => c.done).length;
    lines.push('', `Сферы — ${done} / ${day.categories.length}`);
    for (const c of day.categories) {
      lines.push(`${c.done ? '✅' : '❌'} ${escapeHtml(c.label)}`);
    }
  }

  const comment = day.comment?.trim();
  if (comment) {
    lines.push('', `💬 ${escapeHtml(comment)}`);
  }

  return lines.join('\n');
}
```

Порядок замен в `escapeHtml` важен: `&` заменяется первым, иначе уже вставленные `&lt;`/`&gt;` были бы испорчены повторным экранированием амперсанда.

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd backend && bunx jest telegram.helpers.spec.ts`
Expected: PASS, 13 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/telegram/telegram.helpers.ts backend/src/telegram/telegram.helpers.spec.ts
git commit -m "feat(backend): хелперы форматирования сводки дня для Telegram"
```

---

### Task 2: `TelegramService` и модуль

**Files:**
- Create: `backend/src/telegram/telegram.service.ts`
- Create: `backend/src/telegram/telegram.module.ts`
- Test: `backend/src/telegram/telegram.service.spec.ts`

**Interfaces:**
- Consumes: `buildDaySummary(day: DaySummaryInput): string` и тип `DaySummaryInput` из Task 1.
- Produces:
  - `export class TelegramService { async postDaySummary(day: DaySummaryInput): Promise<number | null> }`
  - `export class TelegramModule` — провайдит и экспортирует `TelegramService`.

Сервис намеренно не трогает Prisma: он возвращает `message_id`, а сохраняет его вызывающая сторона (Task 3). Благодаря этому модуль независим от схемы БД и тестируется одним лишь подменённым `fetch`.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/telegram/telegram.service.spec.ts`:

```ts
import { TelegramService } from './telegram.service';

const day = {
  date: '2026-08-01',
  pomodoros: 7,
  rating: 8,
  comment: null,
  categories: [{ label: 'Спорт', done: true }],
};

describe('TelegramService.postDaySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '@my_channel';
    // Сервис глотает ошибки через logger.warn — глушим, чтобы вывод тестов был чистым.
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    jest.restoreAllMocks();
  });

  it('does nothing without a bot token', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without a chat id', async () => {
    delete process.env.TELEGRAM_CHAT_ID;

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when an env var is present but empty', async () => {
    process.env.TELEGRAM_CHAT_ID = '';

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to sendMessage and returns the message id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });

    await expect(service.postDaySummary(day)).resolves.toBe(42);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('@my_channel');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('📅 1 августа 2026, суббота');
    expect(body.text).toContain('🍅 Помидорок: 7');
  });

  it('returns null on a non-2xx response without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request: chat not found',
    });

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });

  it('returns null when telegram replies ok:false in a 200 body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, description: 'blocked' }),
    });

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });

  it('returns null when fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && bunx jest telegram.service.spec.ts`
Expected: FAIL — `Cannot find module './telegram.service'`.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `backend/src/telegram/telegram.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { buildDaySummary, DaySummaryInput } from './telegram.helpers';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  async postDaySummary(day: DaySummaryInput): Promise<number | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildDaySummary(day),
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
        return null;
      }

      const body = (await response.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
      if (!body.ok || !body.result) {
        this.logger.warn(`Telegram sendMessage rejected: ${body.description ?? 'unknown error'}`);
        return null;
      }

      return body.result.message_id;
    } catch (e) {
      this.logger.warn(`Telegram sendMessage(${day.date}) failed: ${e}`);
      return null;
    }
  }
}
```

Создать `backend/src/telegram/telegram.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd backend && bunx jest telegram.service.spec.ts`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/telegram/telegram.service.ts backend/src/telegram/telegram.service.spec.ts backend/src/telegram/telegram.module.ts
git commit -m "feat(backend): TelegramService — отправка сводки дня в канал"
```

---

### Task 3: Поле `telegramMessageId` и вызов из `DaysService.updateDay`

**Files:**
- Modify: `backend/prisma/schema.prisma` (`model Day`, строки 18–29)
- Modify: `backend/src/days/days.service.ts` (конструктор, строки 38–42; `updateDay`, строки 118–122)
- Modify: `backend/src/days/days.module.ts`
- Test: `backend/src/days/days.service.spec.ts` (новый `describe`; плюс правка четырёх существующих вызовов `new DaysService(...)`)

**Interfaces:**
- Consumes: `TelegramService.postDaySummary(day): Promise<number | null>` и `TelegramModule` из Task 2.
- Produces: конструктор `DaysService` получает четвёртый параметр `private telegram: TelegramService`. Публичная сигнатура `updateDay(dateStr: string, data: UpdateDayData): Promise<DayView>` не меняется; `DayView` тоже не меняется — `telegramMessageId` наружу не отдаётся.

- [ ] **Step 1: Добавить поле в схему Prisma**

В `backend/prisma/schema.prisma`, в `model Day`, после строки `comment String?` добавить:

```prisma
  telegramMessageId Int?
```

- [ ] **Step 2: Сгенерировать и применить миграцию**

Run:
```bash
docker compose up -d postgres
cd backend && bunx prisma migrate dev --name day_telegram_message_id
```
Expected: создан каталог `backend/prisma/migrations/<timestamp>_day_telegram_message_id/` с `ALTER TABLE "Day" ADD COLUMN "telegramMessageId" INTEGER;`, клиент Prisma перегенерирован. Существующие строки не затронуты — колонка nullable.

- [ ] **Step 3: Написать падающий тест**

В конец `backend/src/days/days.service.spec.ts` добавить:

```ts
describe('DaysService.updateDay telegram posting', () => {
  let service: DaysService;
  let prisma: any;
  let telegram: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
    };
    telegram = { postDaySummary: jest.fn().mockResolvedValue(555) };
    service = new DaysService(
      prisma,
      { findActive: jest.fn().mockResolvedValue([]) } as any,
      { getForDate: jest.fn().mockResolvedValue([]) } as any,
      telegram,
    );
  });

  // getOrCreateDayId() и getDay() внутри updateDay() тоже ходят в findUnique —
  // возвращаем одну и ту же строку дня на все вызовы.
  function dayRow(overrides: any = {}) {
    return {
      id: 1,
      date: new Date('2026-08-01T00:00:00.000Z'),
      youtubeMinutes: 0,
      pomodoros: 7,
      eveningClosed: false,
      rating: 8,
      comment: null,
      telegramMessageId: null,
      categories: [],
      ...overrides,
    };
  }

  it('posts the summary and stores the returned message id when the day is closed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay('2026-08-01', { eveningClosed: true });

    expect(telegram.postDaySummary).toHaveBeenCalledTimes(1);
    expect(telegram.postDaySummary.mock.calls[0][0]).toMatchObject({ date: '2026-08-01', pomodoros: 7 });
    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { telegramMessageId: 555 } });
  });

  it('does not post again for a day that was already posted', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow({ telegramMessageId: 555 }));

    await service.updateDay('2026-08-01', { eveningClosed: true });

    expect(telegram.postDaySummary).not.toHaveBeenCalled();
  });

  it('does not store anything when the post failed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());
    telegram.postDaySummary.mockResolvedValue(null);

    await expect(service.updateDay('2026-08-01', { eveningClosed: true })).resolves.toMatchObject({
      date: '2026-08-01',
    });

    expect(prisma.day.update).toHaveBeenCalledTimes(1); // только сам апдейт дня
  });

  it('does not post when only rating or comment changed', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow());

    await service.updateDay('2026-08-01', { rating: 9 });

    expect(telegram.postDaySummary).not.toHaveBeenCalled();
  });

  it('does not post when the day is being reopened', async () => {
    prisma.day.findUnique.mockResolvedValue(dayRow({ eveningClosed: true }));

    await service.updateDay('2026-08-01', { eveningClosed: false });

    expect(telegram.postDaySummary).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `cd backend && bunx jest days.service.spec.ts`
Expected: FAIL — новый `describe` падает (`telegram.postDaySummary` не вызывался), плюс ошибка компиляции TypeScript о четвёртом аргументе конструктора.

- [ ] **Step 5: Подключить `TelegramService` в `DaysService`**

В `backend/src/days/days.service.ts` добавить импорт:

```ts
import { TelegramService } from '../telegram/telegram.service';
```

и четвёртый параметр конструктора:

```ts
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private gtdService: GtdService,
    private telegram: TelegramService,
  ) {}
```

- [ ] **Step 6: Реализовать отправку в `updateDay`**

Заменить тело `updateDay` в `backend/src/days/days.service.ts` на:

```ts
  async updateDay(dateStr: string, data: UpdateDayData): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const before = await this.prisma.day.findUnique({ where: { id: dayId } });
    await this.prisma.day.update({ where: { id: dayId }, data });
    const view = await this.getDay(dateStr);

    // Ключ идемпотентности — сам telegramMessageId, а не предыдущее значение
    // eveningClosed: так «один пост на дату» переживает переоткрытие дня.
    if (data.eveningClosed === true && before?.telegramMessageId == null) {
      const messageId = await this.telegram.postDaySummary(view);
      if (messageId != null) {
        await this.prisma.day.update({ where: { id: dayId }, data: { telegramMessageId: messageId } });
      }
    }

    return view;
  }
```

- [ ] **Step 7: Подключить `TelegramModule` в `DaysModule`**

В `backend/src/days/days.module.ts` добавить импорт `import { TelegramModule } from '../telegram/telegram.module';` и включить `TelegramModule` в массив `imports` рядом с `CategoriesModule` и `GtdModule`.

- [ ] **Step 8: Починить существующие вызовы конструктора в тестах**

В `backend/src/days/days.service.spec.ts` дописать четвёртый аргумент в четыре существующих вызова (строки 13, 61, 193, 229):

- строка 13: `service = new DaysService(prisma, categoriesService, gtdService, {} as any);`
- строки 61, 193, 229: `service = new DaysService(prisma, {} as any, {} as any, {} as any);`

- [ ] **Step 9: Запустить весь набор тестов бэкенда**

Run: `cd backend && bun run test`
Expected: PASS, все спеки зелёные, включая пять новых тестов в `days.service.spec.ts`.

- [ ] **Step 10: Коммит**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/days/days.service.ts backend/src/days/days.service.spec.ts backend/src/days/days.module.ts
git commit -m "feat(backend): публикация сводки дня в Telegram при закрытии дня"
```

---

### Task 4: Env-переменные, Docker и документация

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml` (сервис `backend`, блок `environment`, строки 22–29)
- Modify: `README.md` (после секции «iCloud Reminders (GTD)», которая начинается на строке 118)

**Interfaces:**
- Consumes: имена переменных `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`, которые читает `TelegramService` из Task 2. Написание должно совпадать посимвольно.
- Produces: ничего для последующих задач — это финальная задача плана.

- [ ] **Step 1: Дополнить `.env.example`**

В конец `.env.example` добавить:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 2: Пробросить переменные в контейнер бэкенда**

В `docker-compose.yml`, в блок `environment` сервиса `backend`, после строки `ICLOUD_REMINDERS_LIST_NAME: ...` добавить:

```yaml
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
```

Синтаксис `${VAR:-}` — тот же, что уже используется для `ICLOUD_*`: если переменной нет в корневом `.env`, в контейнер приходит пустая строка, и `TelegramService` молча выключается.

- [ ] **Step 3: Проверить, что compose-файл валиден и подстановка работает**

Run: `docker compose config | grep -A 2 TELEGRAM`
Expected: файл парсится без ошибок, в выводе видны обе переменные (со значениями из корневого `.env`, либо пустые).

- [ ] **Step 4: Дописать секцию в README**

В `README.md`, сразу после секции «iCloud Reminders (GTD)» (перед «Мобильный захват в Корзину»), добавить:

```markdown
### Сводка дня в Telegram

Когда день отмечается закрытым, бэкенд публикует в Telegram-канал одно сводное
сообщение: дата с днём недели, количество помидорок, бинарный список сфер с отметками,
оценка дня и комментарий. Ровно один пост на дату — переоткрытие и повторное закрытие
дня ничего не шлёт (идемпотентность обеспечивается полем `Day.telegramMessageId`).

Настройка (один раз, руками):
1. Создать бота у `@BotFather` (`/newbot`) и забрать токен.
2. Добавить бота администратором канала с правом публикации сообщений.
3. Узнать `chat_id`: для публичного канала это `@имя_канала`, для приватного —
   числовой идентификатор вида `-1001234567890` (например, переслать любой пост
   канала боту `@userinfobot`).
4. Заполнить в корневом `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Без этих двух переменных интеграция молча выключена — остальной трекер работает как обычно.
Ошибка отправки (нет сети, неверный токен, бот не админ) не ломает закрытие дня:
она пишется в лог бэкенда, а поле `telegramMessageId` остаётся пустым, поэтому
следующее закрытие этого же дня попробует отправить снова.
```

- [ ] **Step 5: Проверить сборку и полный набор тестов**

Run: `cd backend && bun run build && bun run test`
Expected: сборка без ошибок TypeScript, все тесты зелёные.

- [ ] **Step 6: Коммит**

```bash
git add .env.example docker-compose.yml README.md
git commit -m "docs: настройка Telegram-интеграции (env, compose, README)"
```

---

## Ручная проверка после реализации

Не входит в задачи (требует реального бота), но выполняется один раз перед тем, как считать фичу принятой:

1. Создать бота, добавить в канал, заполнить `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` в корневом `.env`.
2. `docker compose up -d --build backend`
3. Открыть https://tracker.performance:4888, поставить дню оценку и комментарий, отметить день закрытым.
4. Убедиться, что в канале появился пост нужного вида.
5. Переоткрыть день и закрыть снова — второго поста быть не должно.
6. `docker compose logs backend | grep -i telegram` — при успешной отправке предупреждений нет.
