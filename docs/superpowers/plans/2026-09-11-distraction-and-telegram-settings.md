# «Залипание» вместо YouTube + Telegram-бот и чаты в настройках — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать трекер пригодным не только для владельца: (A) YouTube-трекинг превращается в нейтральный счётчик «залипания» с настраиваемым названием (у владельца — «YouTube», у друга — «Шортсы», «Reels» и т. п.); (B) Telegram-бот настраивается из интерфейса отдельной вкладкой; (C) список чатов, куда уходят сводки, настраивается отдельной вкладкой — чатов может быть несколько.

**Architecture:** Часть A — чистое переименование `youtube*` → `distraction*` по всему стеку (колонки БД переименовываются миграцией без потери данных) + новое поле `Settings.distractionLabel`. Части B/C — токен бота хранится в `Settings.telegramBotToken`, чаты — в новой таблице `TelegramChat`, факт публикации — в новой таблице `TelegramPost` (идемпотентность «один пост на день/неделю» теперь *на каждый чат*). Переменные `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` остаются как фоллбэк, чтобы текущая инсталляция владельца не сломалась ни на секунду.

**Tech Stack:** NestJS + Prisma (Postgres), Next.js App Router (client-only Dashboard), Jest, Bun везде (`bun`/`bunx`, не npm).

**Spec:** этот файл, раздел «Решения» ниже. Контекст продукта — `docs/system-overview.md`; устройство Telegram-сводок — `docs/superpowers/specs/2026-08-01-telegram-day-summary-design.md` и `docs/superpowers/specs/2026-08-05-weekly-telegram-summary-design.md`.

## Global Constraints

- Пакетный менеджер и рантайм — **Bun** (`bun install`, `bun run test`, `bunx prisma ...`). Не npm/yarn/pnpm.
- Коммиты — в стиле репозитория: `feat(backend): ...`, `feat(frontend): ...`, `refactor: ...`, `docs: ...`, описание по-русски. **Никаких `Co-Authored-By` и прочих AI-атрибуций в сообщениях коммитов** — жёсткое требование владельца.
- Коммит после каждой задачи. Ветка: работать не в `master`, а в отдельной ветке `feat/distraction-telegram-settings` (или worktree через superpowers:using-git-worktrees).
- После изменения кода в каждой задаче: `graphify update .` (см. `AGENTS.md`), изменения в `graphify-out/` коммитить вместе с задачей.
- Бэкенд-тесты — стиль репо: `new XService(mockPrisma, ...)`, без `@nestjs/testing`. `fetch` мокается через `(global as any).fetch = jest.fn()`.
- Комментарии в коде — по-русски и только там, где объясняют «почему» (как в существующем коде).
- Токен бота **никогда** не возвращается API целиком и не пишется в логи (в логах — `String(e).split(token).join('<redacted>')`, как уже сделано в `telegram.service.ts`).
- Файлы `claude_code_prompt.md` и `daily_tracker.html` — исторические, **не трогать**.
- UI-тексты — по-русски. Цвета — только через CSS-переменные из `frontend/app/globals.css`, без UI-библиотек.

---

## Решения (спека)

### A. «Залипание»

1. Сущность в коде называется **distraction** (минуты залипания). Все имена `youtube*` / `yt*` в бэкенде, фронте, API, CSS-переменных и env переименовываются:

   | Было | Стало |
   |---|---|
   | `Day.youtubeMinutes` | `Day.distractionMinutes` |
   | `Settings.youtubeBudget` | `Settings.distractionBudget` |
   | — | `Settings.distractionLabel` (новое, `String`, default `'Залипание'`) |
   | `PATCH /days/:date/youtube` | `PATCH /days/:date/distraction` |
   | `GET /stats/youtube` | `GET /stats/distraction` |
   | `GET /stats/youtube-daily` | `GET /stats/distraction-daily` |
   | `HistoryEntry.ytOver` | `HistoryEntry.distractionOver` |
   | `WeekStats.youtubeAvgMinutes` / `youtubeBudget` | `distractionAvgMinutes` / `distractionBudget` + новое `distractionLabel` |
   | `YoutubeWeekStat` / `YoutubeDayStat` | `DistractionWeekStat` / `DistractionDayStat` |
   | `UpdateYoutubeDto`, `updateYoutube`, `youtubeWeeklyStats`, `youtubeDailyStats` | `UpdateDistractionDto`, `updateDistraction`, `distractionWeeklyStats`, `distractionDailyStats` |
   | `YoutubePanel`, `YoutubeDailyHeatmap`, `YoutubeWeeklyChart` | `DistractionPanel`, `DistractionDailyHeatmap`, `DistractionWeeklyChart` |
   | `youtubeHeatmapColor` | `distractionHeatmapColor` |
   | CSS `--yt`, `--yt-soft` | `--distraction`, `--distraction-soft` |
   | env `YOUTUBE_BUDGET_DEFAULT` | `DISTRACTION_BUDGET_DEFAULT` |

2. Миграция **переименовывает** колонки (`ALTER TABLE ... RENAME COLUMN`), а не drop+add — история минут должна сохраниться. Prisma по умолчанию генерирует drop+add, поэтому SQL правится руками.
3. У существующей строки `Settings` миграция ставит `distractionLabel = 'YouTube'` — у владельца в интерфейсе ничего не меняется. Новая инсталляция (друг) получает `'Залипание'`.
4. Везде, где раньше в UI/сводках было захардкожено «YouTube», теперь выводится `distractionLabel`: заголовок панели, заголовок хитмепа, заголовок недельного графика, DayDetailModal, подсказка и легенда в `CategoryHeatmap`, строка в недельной Telegram-сводке (`📺 ${label}: N мин/день при бюджете M`).
5. Название и бюджет редактируются в новой вкладке настроек **«Залипание»** (инлайн-инпут бюджета в панели остаётся). Название: trim, 1–32 символа.
6. Подпись под панелью (про Qbserve) заменяется на нейтральную: «Здесь только то, что занесено вручную. Точные цифры — в «Экранном времени» телефона и компьютера.»

### B. Telegram-бот — отдельная вкладка «Telegram-бот»

1. Токен хранится в `Settings.telegramBotToken String?`. `GET /settings` его **не отдаёт**.
2. Эффективный токен: токен из БД, если задан; иначе `TELEGRAM_BOT_TOKEN` из env; иначе бот не настроен.
3. Эндпоинты:
   - `GET /telegram/bot` → `TelegramBotView`: `{ configured: boolean; source: 'db' | 'env' | null; username: string | null; tokenHint: string | null }`. `tokenHint` — `'…' + последние 4 символа`. `username` берётся из `getMe` (при ошибке — `null`, но `configured` остаётся `true`).
   - `PUT /telegram/bot` body `{ token: string }` → проверяет формат (`/^\d+:[A-Za-z0-9_-]{30,}$/`), затем вызывает Telegram `getMe`. Не прошло → `400` с понятным текстом, в БД ничего не пишется. Прошло → сохраняет и возвращает `TelegramBotView`.
   - `DELETE /telegram/bot` → обнуляет токен в БД (если в env есть токен — он снова становится эффективным), возвращает `TelegramBotView`.

### C. Чаты — отдельная вкладка «Чаты»

1. Новая таблица `TelegramChat { id, title, chatId (unique, строка: '-100…', '@channel', '12345'), daily Boolean @default(true), weekly Boolean @default(true), createdAt }`.
2. Эффективный список получателей: чаты из таблицы; **если таблица пуста** и задан `TELEGRAM_CHAT_ID` — один виртуальный чат из env (`daily: true, weekly: true`). Добавил хотя бы один чат в UI — env-чат больше не используется. UI показывает это баннером.
3. Эндпоинты:
   - `GET /telegram/chats` → `{ chats: TelegramChat[]; envFallback: string | null }` (`envFallback` — `TELEGRAM_CHAT_ID`, если таблица пуста и переменная задана, иначе `null`).
   - `POST /telegram/chats` body `{ title, chatId, daily?, weekly? }` → создаёт; дубликат `chatId` → `409`.
   - `PATCH /telegram/chats/:id` body `{ title?, daily?, weekly? }`.
   - `DELETE /telegram/chats/:id` → `204`. Строки `TelegramPost` этого чата не удаляются (они по `chatId`-строке, без FK) — если чат вернут, старые дни туда повторно не уйдут.
   - `POST /telegram/chats/:id/test` → отправляет тестовое сообщение «✅ Трекер подключён к этому чату». `{ ok: true }` или `502` с описанием от Telegram.
   - `GET /telegram/discover` → вызывает `getUpdates` и возвращает чаты, которые бот видел и которых ещё нет в таблице: `{ chatId, title, type }[]`. Это кнопка «Найти чаты» — чтобы не выковыривать id через curl. В UI рядом подсказка: «Добавь бота в чат и напиши там любое сообщение (в канале — сделай бота админом), потом нажми «Найти». Telegram хранит апдейты ~24 часа».
4. Идемпотентность — **на каждый чат**: таблица `TelegramPost { id, dayId → Day, chatId String, kind TelegramPostKind (day | week), messageId Int, createdAt, @@unique([dayId, chatId, kind]) }`. Захват слота — `create` строки с `messageId: 0`; уникальный конфликт (`P2002`) = «уже отправлено/отправляется». Успех — пишем реальный `messageId`; неудача — удаляем строку, чтобы следующее закрытие дня попробовало снова.
   Следствие (и это желаемое поведение): день ушёл в чат A, потом добавили чат B, день переоткрыли и снова закрыли → уйдёт только в B.
5. Легаси: колонки `Day.telegramMessageId` и `Day.weeklyTelegramMessageId` остаются в схеме, но новый код в них **не пишет**. Если у дня такая колонка не `null` — этот день/неделя считаются уже разосланными во все чаты (дни до этой фичи повторно не рассылаются). Удалить колонки — отдельная задача на потом, не в этом плане.
6. Дневная сводка уходит во все чаты с `daily: true`, недельная — во все с `weekly: true`. Отправка в разные чаты — последовательно (не параллельно), сбой в одном чате не мешает остальным.
7. Недельный эндпоинт `POST /days/:date/weekly-summary`:
   - `409`, если нет токена или нет ни одного чата с `weekly: true` (текст: «Telegram не настроен: задайте токен бота и хотя бы один чат для недельной сводки в настройках»).
   - `{ posted: true, withChart }`, если хотя бы в один чат ушло сейчас.
   - `{ posted: false, reason: 'already-posted' }`, если все целевые чаты уже получили эту неделю.
   - `502`, если были попытки, и все провалились.

### Модель угроз

Приложение без авторизации и живёт только на localhost — это не меняется. Кто достучался до API, тот может сменить токен; это тот же уровень доверия, что и сейчас с остальными данными. Поэтому достаточно: токен не отдаётся API целиком и не попадает в логи.

---

## Карта файлов

**Часть A (переименование):**
- Modify: `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`
- Create: `backend/prisma/migrations/<timestamp>_distraction_rename/migration.sql`
- Rename+Modify: `backend/src/days/dto/update-youtube.dto.ts` → `update-distraction.dto.ts`
- Modify: `backend/src/days/days.controller.ts`, `days.service.ts`, `days.service.spec.ts`, `days.controller.spec.ts`
- Modify: `backend/src/stats/stats.controller.ts`, `stats.service.ts`, `stats.service.spec.ts`
- Modify: `backend/src/settings/settings.service.ts`, `settings.service.spec.ts`, `dto/update-settings.dto.ts`
- Modify: `backend/src/telegram/weekly.helpers.ts`, `weekly.helpers.spec.ts`
- Modify: `docker-compose.yml`, `.env.example`
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/lib/api.spec.ts`, `frontend/lib/heatmap.ts`, `frontend/lib/heatmap.spec.ts`, `frontend/lib/weekly.spec.ts`, `frontend/app/globals.css`
- Rename+Modify: `frontend/components/YoutubePanel.{tsx,module.css}` → `DistractionPanel.*`, `YoutubeDailyHeatmap.*` → `DistractionDailyHeatmap.*`, `YoutubeWeeklyChart.*` → `DistractionWeeklyChart.*`
- Modify: `frontend/components/Dashboard.tsx`, `StatsPanel.tsx`, `DayDetailModal.tsx` (+ `.module.css` классы `yt*`), `CategoryHeatmap.tsx`, `SettingsModal.tsx`
- Create: `frontend/components/DistractionSettingsTab.tsx`

**Части B/C (Telegram):**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_telegram_settings/migration.sql`
- Modify: `backend/src/telegram/telegram.service.ts` (+ spec) — становится «тупым» HTTP-клиентом Telegram с явными `token`/`chatId`
- Create: `backend/src/telegram/telegram-config.service.ts` (+ spec) — токен и чаты: БД + env-фоллбэк, CRUD, discover
- Create: `backend/src/telegram/telegram-delivery.service.ts` (+ spec) — рассылка по чатам с идемпотентностью `TelegramPost`
- Create: `backend/src/telegram/telegram.controller.ts` (+ spec), `backend/src/telegram/dto/set-bot-token.dto.ts`, `dto/create-chat.dto.ts`, `dto/update-chat.dto.ts`
- Modify: `backend/src/telegram/telegram.module.ts`, `backend/src/app.module.ts`
- Modify: `backend/src/days/days.service.ts`, `days.controller.ts` (+ specs)
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts` (+ spec)
- Create: `frontend/components/TelegramBotTab.tsx`, `TelegramChatsTab.tsx`, `TelegramSettings.module.css`
- Modify: `frontend/components/SettingsModal.tsx`
- Modify: `README.md`, `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/system-overview.md`

---

## Подготовка окружения (один раз, до Task 1)

- [ ] `git checkout -b feat/distraction-telegram-settings`
- [ ] `docker compose up -d postgres`
- [ ] В `backend/.env` должен быть `DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker` (если файла нет — `cp .env.example backend/.env`).
- [ ] `cd backend && bun install && bunx prisma migrate deploy && bun run test` — всё зелёное до начала работ.
- [ ] `cd frontend && bun install && bun run test` — всё зелёное.
- [ ] **Сделать дамп БД владельца перед миграциями:** `docker compose exec postgres pg_dump -U tracker tracker > /tmp/tracker-before-distraction.sql`. Миграции переименовывают колонки с живыми данными.

---

### Task 1: Бэкенд — distraction вместо youtube

**Files:** см. «Часть A» в карте файлов, только `backend/`, `docker-compose.yml`, `.env.example`.

**Interfaces — Produces:**
- Prisma: `Day.distractionMinutes: Int`, `Settings.distractionBudget: Int`, `Settings.distractionLabel: String`.
- `PATCH /days/:date/distraction` body `{ delta?: number; reset?: boolean }` → `DayView` (поле `distractionMinutes`).
- `GET /stats/distraction?weeks=N` → `{ weekStart: string; avgMinutes: number; budget: number }[]`
- `GET /stats/distraction-daily?days=N` → `{ date: string; minutes: number; budget: number; pct: number }[]`
- `GET /history` → элементы с `distractionOver: boolean` вместо `ytOver`.
- `GET /settings` / `PATCH /settings` → `{ id, distractionBudget, distractionLabel, notificationsEnabled, sessionSyncEnabled }`; PATCH принимает `distractionBudget?`, `distractionLabel?`, `notificationsEnabled?`.
- `WeekStats` (бэкенд, `stats.service.ts`): `distractionAvgMinutes`, `distractionBudget`, `distractionLabel`.

- [ ] **Step 1: Схема.** В `backend/prisma/schema.prisma`:

```prisma
model Day {
  // ...
  distractionMinutes Int @default(0)   // было youtubeMinutes
  // ...
}

model Settings {
  id                   Int     @id @default(1)
  distractionBudget    Int     @default(60)
  distractionLabel     String  @default("Залипание")
  notificationsEnabled Boolean @default(false)
}
```

- [ ] **Step 2: Миграция руками.** `cd backend && bunx prisma migrate dev --create-only --name distraction_rename`. Открыть сгенерированный `migration.sql` и **полностью заменить** содержимое (Prisma сгенерирует DROP/ADD — это уничтожит историю):

```sql
-- Переименование, а не drop+add: минуты за всю историю должны сохраниться.
ALTER TABLE "Day" RENAME COLUMN "youtubeMinutes" TO "distractionMinutes";
ALTER TABLE "Settings" RENAME COLUMN "youtubeBudget" TO "distractionBudget";
ALTER TABLE "Settings" ADD COLUMN "distractionLabel" TEXT NOT NULL DEFAULT 'Залипание';
-- У уже существующей инсталляции (владельца) это был YouTube — сохраняем название.
UPDATE "Settings" SET "distractionLabel" = 'YouTube';
```

Затем `bunx prisma migrate dev` (применит) и проверить: `docker compose exec postgres psql -U tracker -d tracker -c 'select date, "distractionMinutes" from "Day" order by date desc limit 5;'` — минуты на месте, не нули.

- [ ] **Step 3: Обновить тесты под новые имена (red).** В `days.service.spec.ts`, `days.controller.spec.ts`, `stats.service.spec.ts`, `settings.service.spec.ts`, `weekly.helpers.spec.ts` заменить все `youtubeMinutes`/`youtubeBudget`/`ytOver`/`updateYoutube`/`youtubeWeeklyStats`/`youtubeDailyStats`/`youtubeAvgMinutes` на новые имена. Добавить тесты:

`settings.service.spec.ts`:
```ts
it('passes distractionLabel through on update', async () => {
  prisma.settings.update.mockResolvedValue({ id: 1, distractionBudget: 60, distractionLabel: 'Шортсы', notificationsEnabled: false });
  const result = await service.update({ distractionLabel: 'Шортсы' });
  expect(prisma.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { distractionLabel: 'Шортсы' } });
  expect(result.distractionLabel).toBe('Шортсы');
});
```

`weekly.helpers.spec.ts` (в фикстуре `WeekStats` добавить `distractionLabel`):
```ts
it('uses the configured distraction label in the summary line', () => {
  const text = buildWeekSummary({ ...baseStats, distractionAvgMinutes: 42.5, distractionBudget: 60, distractionLabel: 'Шортсы' });
  expect(text).toContain('📺 Шортсы: 42.5 мин/день при бюджете 60');
});

it('escapes html in the distraction label', () => {
  const text = buildWeekSummary({ ...baseStats, distractionLabel: '<b>Reels</b>' });
  expect(text).toContain('📺 &lt;b&gt;Reels&lt;/b&gt;:');
});
```
(`baseStats` — существующая фикстура в файле; если называется иначе — использовать её.)

`stats.service.spec.ts` — в тесте `weekStats` проверить, что `distractionLabel` берётся из `settings.distractionLabel`, а при отсутствии строки настроек — `'Залипание'`.

Run: `cd backend && bun run test` → Expected: FAIL (компиляция/имена).

- [ ] **Step 4: Реализация.** Переименовать по таблице из «Решений»:
  - `git mv backend/src/days/dto/update-youtube.dto.ts backend/src/days/dto/update-distraction.dto.ts`, класс `UpdateDistractionDto`.
  - `days.controller.ts`: `@Patch('days/:date/distraction') updateDistraction(...)`.
  - `days.service.ts`: `updateDistraction`, `distractionMinutes`, в `getHistory` — `distractionOver: distractionMinutes > budget`, бюджет из `settings?.distractionBudget ?? 60`.
  - `stats.controller.ts`: `@Get('distraction')`, `@Get('distraction-daily')`; `stats.service.ts`: `distractionWeeklyStats`, `distractionDailyStats`, в `weekStats` поля `distractionAvgMinutes`, `distractionBudget`, `distractionLabel: settings?.distractionLabel ?? 'Залипание'`.
  - `update-settings.dto.ts`:
    ```ts
    import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
    import { Transform } from 'class-transformer';

    export class UpdateSettingsDto {
      @IsOptional()
      @IsInt()
      @Min(0)
      distractionBudget?: number;

      @IsOptional()
      @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
      @IsString()
      @IsNotEmpty()
      @MaxLength(32)
      distractionLabel?: string;

      @IsOptional()
      @IsBoolean()
      notificationsEnabled?: boolean;
    }
    ```
    (`class-transformer` уже в зависимостях, а `main.ts` включает `ValidationPipe({ whitelist: true, transform: true })` — поэтому `@Transform` срабатывает до валидаторов.)
  - `settings.service.ts`: `SettingsRow` → `{ id; distractionBudget; distractionLabel; notificationsEnabled }`.
  - `weekly.helpers.ts`, строка сводки:
    ```ts
    lines.push('', `📺 ${escapeHtml(stats.distractionLabel)}: ${stats.distractionAvgMinutes} мин/день при бюджете ${stats.distractionBudget}`);
    ```
  - `seed.ts`: `DEFAULT_DISTRACTION_BUDGET = parseInt(process.env.DISTRACTION_BUDGET_DEFAULT ?? '60', 10)`, `create: { id: 1, distractionBudget: DEFAULT_DISTRACTION_BUDGET }`.
  - `docker-compose.yml` и `.env.example`: `YOUTUBE_BUDGET_DEFAULT` → `DISTRACTION_BUDGET_DEFAULT`.
  - Контрольный grep, должен быть пуст: `grep -rniE "youtube|\byt[A-Z]" backend/src backend/prisma/seed.ts backend/prisma/schema.prisma docker-compose.yml .env.example`

- [ ] **Step 5: Green.** `cd backend && bun run test && bun run build` → PASS.
- [ ] **Step 6: Commit.** `graphify update .`, затем
  `git add -A backend docker-compose.yml .env.example graphify-out && git commit -m "refactor(backend): youtube становится настраиваемым «залипанием»"`

---

### Task 2: Фронтенд — distraction + вкладка «Залипание»

**Interfaces — Consumes:** API из Task 1.
**Produces:**
- `frontend/types/api.ts`: `DayView.distractionMinutes`, `HistoryEntry.distractionOver`, `Settings { id; distractionBudget; distractionLabel; notificationsEnabled; sessionSyncEnabled }`, `DistractionWeekStat`, `DistractionDayStat`, `WeekStats.distractionAvgMinutes/distractionBudget/distractionLabel`.
- `frontend/lib/api.ts`: `updateDistraction(date, { delta?, reset? })`, `getDistractionWeeklyStats(weeks)`, `getDistractionDailyStats(days)`, `updateSettings(data: { distractionBudget?: number; distractionLabel?: string; notificationsEnabled?: boolean })`.
- `frontend/lib/heatmap.ts`: `distractionHeatmapColor(minutes, budget)` — логика без изменений, только имена и CSS-переменные.

- [ ] **Step 1: Тесты (red).** `heatmap.spec.ts`: переименовать `youtubeHeatmapColor` → `distractionHeatmapColor`, ожидания `var(--yt-soft)` → `var(--distraction-soft)`, `var(--yt)` → `var(--distraction)`. `weekly.spec.ts`: фикстура `distractionAvgMinutes: 0, distractionBudget: 60, distractionLabel: 'Залипание'`. `api.spec.ts`: если там есть тесты на youtube-эндпоинты — поменять URL на `/days/<date>/distraction`, `/stats/distraction`, `/stats/distraction-daily`; если нет — добавить один:
```ts
it('updateDistraction patches the distraction endpoint', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  await updateDistraction('2026-09-11', { delta: 10 });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/days\/2026-09-11\/distraction$/);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ delta: 10 }) });
});
```
В `api.spec.ts` моки делаются через `global.fetch = jest.fn().mockResolvedValue(...) as unknown as typeof fetch` с восстановлением в `afterEach` — в примерах этого плана `fetchMock` означает именно этот `global.fetch` (`const fetchMock = global.fetch as jest.Mock`).

Run: `cd frontend && bun run test` → FAIL.

- [ ] **Step 2: Переименования.**
  - `git mv` компонентов: `YoutubePanel` → `DistractionPanel`, `YoutubeDailyHeatmap` → `DistractionDailyHeatmap`, `YoutubeWeeklyChart` → `DistractionWeeklyChart` (и их `.module.css`).
  - `globals.css`: `--yt` → `--distraction`, `--yt-soft` → `--distraction-soft` (комментарий «youtube — muted steel» → «залипание — приглушённая сталь (лимит, а не достижение)»). `grep -rn "\-\-yt" frontend` должен стать пустым.
  - `types/api.ts`, `lib/api.ts`, `lib/heatmap.ts` — по интерфейсам выше.

- [ ] **Step 3: Название из настроек в UI.**
  - `DistractionPanel`: новый проп `label: string`, заголовок `<h2>{label}</h2>`; подпись заменить на «Здесь только то, что занесено вручную. Точные цифры — в «Экранном времени» телефона и компьютера.»
  - `DistractionDailyHeatmap` и `DistractionWeeklyChart` сейчас сами фетчат статистику и не знают настроек → добавить проп `label: string`; заголовки: `` `${label} · хитмеп · ${DAYS} дней` `` и `` `${label} по неделям` ``.
  - `StatsPanel`: принять `distractionLabel: string` и прокинуть в оба компонента. Комментарий «YouTube (main focus)» → «залипание (главный фокус)».
  - `CategoryHeatmap`: принять `distractionLabel: string`; подсказка `entry.distractionOver ? \`, ${distractionLabel} — перебор\` : ''`, легенда «… · красная черта = перебор: {distractionLabel}».
  - `DayDetailModal`: принять `distractionLabel: string`; «YouTube: N мин» → `{distractionLabel}: N мин`, заголовок редактора — `{distractionLabel}`; вызовы `updateDistraction`; CSS-классы `ytEditor*` → `distractionEditor*`.
  - `Dashboard.tsx`: `addDistractionMinutes`, `resetDistraction`, `changeDistractionBudget` (`updateSettings({ distractionBudget: value })`), прокинуть `settings.distractionLabel` во все компоненты выше.

- [ ] **Step 4: Вкладка «Залипание».** Создать `frontend/components/DistractionSettingsTab.tsx` (переиспользует стили `SettingsModal.module.css`, чтобы не плодить CSS):

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './SettingsModal.module.css';
import type { Settings } from '@/types/api';
import { getSettings, updateSettings } from '@/lib/api';

const LABEL_MAX = 32;

interface DistractionSettingsTabProps {
  onSettingsChanged: (settings: Settings) => void;
}

export default function DistractionSettingsTab({ onSettingsChanged }: DistractionSettingsTabProps) {
  const [label, setLabel] = useState('');
  const [budget, setBudget] = useState(0);

  useEffect(() => {
    getSettings().then((s) => {
      setLabel(s.distractionLabel);
      setBudget(s.distractionBudget);
    });
  }, []);

  async function saveLabel() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSettingsChanged(await updateSettings({ distractionLabel: trimmed.slice(0, LABEL_MAX) }));
  }

  async function saveBudget(value: number) {
    setBudget(value);
    onSettingsChanged(await updateSettings({ distractionBudget: value }));
  }

  return (
    <div className={styles.tabBody}>
      <p>
        Во что утекает время: YouTube, шортсы, Reels, TikTok — назови как удобно. Название появится на панели, в
        графиках и в недельной сводке в Telegram.
      </p>
      <div className={styles.addRow}>
        <input
          value={label}
          maxLength={LABEL_MAX}
          placeholder="Например, Шортсы"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveLabel();
          }}
        />
      </div>
      <div className={styles.addRow}>
        <span>Бюджет в день, мин</span>
        <input
          type="number"
          min={0}
          value={budget}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            saveBudget(Number.isNaN(v) ? 0 : Math.max(0, v));
          }}
        />
      </div>
    </div>
  );
}
```

`SettingsModal.tsx`: `type Tab = 'categories' | 'templates' | 'distraction' | 'telegramBot' | 'telegramChats';` (две последние вкладки заполнит Task 6 — пока добавить только `'distraction'`), кнопка вкладки «Залипание», новый проп `onSettingsChanged: (s: Settings) => void`, в `Dashboard` передать `setSettings`.

- [ ] **Step 5: Green + проверка.** `cd frontend && bun run test && bun run build` → PASS. Контрольный grep должен быть пуст: `grep -rniE "youtube|\byt[A-Z]|ytOver|--yt" frontend/components frontend/lib frontend/types frontend/app`.
  В браузере (`docker compose up -d --build`, http://localhost:4887): панель называется «YouTube» (значение из миграции), минуты прошлых дней на месте, во вкладке «Залипание» сменить на «Шортсы» → заголовки панели, хитмепа, графика и DayDetailModal поменялись; вернуть «YouTube».
- [ ] **Step 6: Commit.** `graphify update .`; `git add -A frontend graphify-out && git commit -m "feat(frontend): «залипание» с настраиваемым названием вместо YouTube"`

---

### Task 3: Бэкенд — схема Telegram-настроек и тупой HTTP-клиент

**Files:**
- Modify: `backend/prisma/schema.prisma`; Create: миграция `telegram_settings`
- Modify: `backend/src/telegram/telegram.service.ts`, `telegram.service.spec.ts`

**Interfaces — Produces:**
```ts
// telegram.service.ts — больше НЕ читает process.env, всё передаётся явно.
export type TelegramSendResult = { ok: true; messageId: number } | { ok: false; error: string };
export interface TelegramChatInfo { chatId: string; title: string; type: string }

class TelegramService {
  getMe(token: string): Promise<{ ok: true; username: string } | { ok: false; error: string }>;
  getUpdatesChats(token: string): Promise<TelegramChatInfo[]>; // уникальные по chatId, при ошибке — []
  sendText(token: string, chatId: string, text: string): Promise<TelegramSendResult>;
  sendDaySummary(token: string, chatId: string, day: DaySummaryInput): Promise<TelegramSendResult>;
  sendWeeklySummary(token: string, chatId: string, text: string, chartPngBase64: string | null): Promise<TelegramSendResult>;
}
```
Методы **не бросают** — все ошибки превращаются в `{ ok: false, error }` (с вырезанным токеном). Логика `sendWeeklySummary` переносится из текущего `postWeeklySummary` один в один: фото с подписью, если `fitsInCaption(text)`, иначе фото + отдельный текст; если фото ушло, а текст нет — всё равно `ok: true` с `messageId` фото (иначе повторная попытка задвоит фото в канале — см. существующий комментарий, его сохранить).

- [ ] **Step 1: Схема.**

```prisma
model Settings {
  // ... поля из Task 1
  telegramBotToken     String?
}

model Day {
  // ... существующие поля; telegramMessageId / weeklyTelegramMessageId НЕ удалять (легаси-гард)
  telegramPosts     TelegramPost[]
}

model TelegramChat {
  id        Int      @id @default(autoincrement())
  title     String
  chatId    String   @unique
  daily     Boolean  @default(true)
  weekly    Boolean  @default(true)
  createdAt DateTime @default(now())
}

enum TelegramPostKind {
  day
  week
}

// Факт публикации конкретной сводки в конкретный чат. chatId — строка, а не FK
// на TelegramChat: удаление чата из настроек не должно стирать историю отправок,
// иначе вернув чат обратно, получим повторную рассылку старых дней.
model TelegramPost {
  id        Int              @id @default(autoincrement())
  dayId     Int
  day       Day              @relation(fields: [dayId], references: [id], onDelete: Cascade)
  chatId    String
  kind      TelegramPostKind
  messageId Int
  createdAt DateTime         @default(now())

  @@unique([dayId, chatId, kind])
}
```

`cd backend && bunx prisma migrate dev --name telegram_settings` — здесь генерация Prisma корректна (только ADD/CREATE), но открыть SQL и убедиться, что в нём нет `DROP`.

- [ ] **Step 2: Тесты клиента (red).** Переписать `telegram.service.spec.ts` под новые сигнатуры. Удалить тесты «does nothing without a bot token/chat id/empty env» — эта ответственность уходит в `TelegramConfigService`. Сохранить по смыслу все остальные существующие кейсы (успех, `!response.ok`, `ok: false`, исключение fetch, редактирование токена в ошибке, фото с подписью, длинный текст → фото + текст, провал текста после фото → всё равно `ok: true`). Добавить:

```ts
describe('TelegramService.getMe', () => {
  it('returns the bot username', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { username: 'my_tracker_bot' } }) });
    await expect(service.getMe('123:ABC')).resolves.toEqual({ ok: true, username: 'my_tracker_bot' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/bot123:ABC/getMe');
  });

  it('reports telegram rejection', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '{"description":"Unauthorized"}' });
    const result = await service.getMe('123:ABC');
    expect(result.ok).toBe(false);
  });

  it('never leaks the token into the error', async () => {
    fetchMock.mockRejectedValue(new TypeError('bad url https://api.telegram.org/bot123:ABC/getMe'));
    const result = await service.getMe('123:ABC');
    expect(result).toEqual({ ok: false, error: expect.not.stringContaining('123:ABC') });
  });
});

describe('TelegramService.getUpdatesChats', () => {
  it('collects unique chats from messages, channel posts and membership updates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          { message: { chat: { id: 111, type: 'private', first_name: 'Аня', last_name: 'К' } } },
          { message: { chat: { id: 111, type: 'private', first_name: 'Аня', last_name: 'К' } } },
          { channel_post: { chat: { id: -1001, type: 'channel', title: 'Мой канал' } } },
          { my_chat_member: { chat: { id: -222, type: 'group', title: 'Вдвоём' } } },
        ],
      }),
    });
    await expect(service.getUpdatesChats('123:ABC')).resolves.toEqual([
      { chatId: '111', title: 'Аня К', type: 'private' },
      { chatId: '-1001', title: 'Мой канал', type: 'channel' },
      { chatId: '-222', title: 'Вдвоём', type: 'group' },
    ]);
  });

  it('returns an empty list on failure', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(service.getUpdatesChats('123:ABC')).resolves.toEqual([]);
  });
});
```

Run: `bunx jest telegram.service.spec.ts` → FAIL.

- [ ] **Step 3: Реализация.** Переписать `telegram.service.ts`: убрать `isConfigured`, `postDaySummary`, `postWeeklySummary`; ввести методы из «Interfaces». Внутренний `readMessageId` → `readResult(response, method): Promise<TelegramSendResult>`. Заголовок чата в `getUpdatesChats`: `chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? '@' + chat.username : String(chat.id))`. Таймауты — прежние (5 с getMe/sendMessage для дня, 10 с текст, 20 с фото). Каждое сообщение об ошибке пропускать через `redact(message, token)`:

```ts
function redact(message: string, token: string): string {
  return token ? message.split(token).join('<redacted>') : message;
}
```

- [ ] **Step 4: Green** для этого файла: `bunx jest telegram.service.spec.ts` → PASS. (Остальные тесты и сборка упадут на `days.service.ts` — это чинится в Task 5. **Не коммитить красный build**: этот и следующие два шага коммитятся вместе в конце Task 5, либо временно оставить в `TelegramService` старые `isConfigured/postDaySummary/postWeeklySummary` как тонкие обёртки над новыми методами с env — и удалить их в Task 5. Выбрать второй вариант, чтобы каждый коммит был зелёным.)
- [ ] **Step 5: Commit.** `bun run test && bun run build` → PASS; `graphify update .`; `git add -A backend graphify-out && git commit -m "feat(backend): Telegram-клиент получает токен и чат явно, схема чатов и публикаций"`

---

### Task 4: Бэкенд — TelegramConfigService и эндпоинты /telegram

**Files:**
- Create: `backend/src/telegram/telegram-config.service.ts`, `telegram-config.service.spec.ts`
- Create: `backend/src/telegram/telegram.controller.ts`, `telegram.controller.spec.ts`
- Create: `backend/src/telegram/dto/set-bot-token.dto.ts`, `dto/create-chat.dto.ts`, `dto/update-chat.dto.ts`
- Modify: `backend/src/telegram/telegram.module.ts`, `backend/src/app.module.ts`

**Interfaces — Consumes:** `TelegramService` из Task 3, Prisma-модели из Task 3.
**Produces:**
```ts
export interface TelegramBotView { configured: boolean; source: 'db' | 'env' | null; username: string | null; tokenHint: string | null }
export interface TelegramRecipient { chatId: string; daily: boolean; weekly: boolean }

class TelegramConfigService {
  constructor(prisma: PrismaService, telegram: TelegramService);
  resolveToken(): Promise<string | null>;               // БД → env → null
  recipients(kind: 'day' | 'week'): Promise<string[]>;  // chatId с daily/weekly = true; env-фоллбэк, если таблица пуста
  getBot(): Promise<TelegramBotView>;
  setBotToken(token: string): Promise<TelegramBotView>; // BadRequestException при неверном формате или отказе getMe
  clearBotToken(): Promise<TelegramBotView>;
  listChats(): Promise<{ chats: TelegramChat[]; envFallback: string | null }>;
  createChat(dto: { title: string; chatId: string; daily?: boolean; weekly?: boolean }): Promise<TelegramChat>; // ConflictException на дубликат
  updateChat(id: number, dto: { title?: string; daily?: boolean; weekly?: boolean }): Promise<TelegramChat>;   // NotFoundException
  deleteChat(id: number): Promise<void>;                                                                      // NotFoundException
  testChat(id: number): Promise<void>;                  // ConflictException без токена, BadGatewayException при отказе Telegram
  discover(): Promise<TelegramChatInfo[]>;              // ConflictException без токена; исключает уже добавленные chatId
}
```

- [ ] **Step 1: Тесты сервиса (red).** `telegram-config.service.spec.ts`, мок Prisma: `settings.findUnique/update/create`, `telegramChat.findMany/count/create/update/delete/findUnique`; мок `TelegramService` — `{ getMe: jest.fn(), sendText: jest.fn(), getUpdatesChats: jest.fn() }`. `afterEach` чистит `process.env.TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID`. Кейсы:

```ts
const VALID = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

it('prefers the db token over env', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'env:token';
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
  await expect(service.resolveToken()).resolves.toBe(VALID);
});

it('falls back to env token when db has none', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'env:token';
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: null });
  await expect(service.resolveToken()).resolves.toBe('env:token');
});

it('treats an empty env token as absent', async () => {
  process.env.TELEGRAM_BOT_TOKEN = '';
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: null });
  await expect(service.resolveToken()).resolves.toBeNull();
});

it('getBot never returns the full token', async () => {
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
  telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
  const view = await service.getBot();
  expect(view).toEqual({ configured: true, source: 'db', username: 'tracker_bot', tokenHint: '…AAAA' });
  expect(JSON.stringify(view)).not.toContain(VALID);
});

it('rejects a malformed token without calling telegram', async () => {
  await expect(service.setBotToken('nope')).rejects.toThrow(BadRequestException);
  expect(telegram.getMe).not.toHaveBeenCalled();
  expect(prisma.settings.update).not.toHaveBeenCalled();
});

it('rejects a token telegram does not accept and does not save it', async () => {
  telegram.getMe.mockResolvedValue({ ok: false, error: 'Unauthorized' });
  await expect(service.setBotToken(VALID)).rejects.toThrow(BadRequestException);
  expect(prisma.settings.update).not.toHaveBeenCalled();
});

it('saves a token that getMe accepts (trimmed)', async () => {
  telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
  await service.setBotToken(`  ${VALID}\n`);
  expect(prisma.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { telegramBotToken: VALID } });
});

it('recipients: uses db chats filtered by kind', async () => {
  prisma.telegramChat.findMany.mockResolvedValue([
    { chatId: '-1', daily: true, weekly: false },
    { chatId: '-2', daily: true, weekly: true },
  ]);
  await expect(service.recipients('week')).resolves.toEqual(['-2']);
  await expect(service.recipients('day')).resolves.toEqual(['-1', '-2']);
});

it('recipients: falls back to env chat only when the table is empty', async () => {
  process.env.TELEGRAM_CHAT_ID = '@legacy';
  prisma.telegramChat.findMany.mockResolvedValue([]);
  await expect(service.recipients('day')).resolves.toEqual(['@legacy']);
});

it('recipients: ignores env chat once any db chat exists, even if disabled for this kind', async () => {
  process.env.TELEGRAM_CHAT_ID = '@legacy';
  prisma.telegramChat.findMany.mockResolvedValue([{ chatId: '-1', daily: false, weekly: true }]);
  await expect(service.recipients('day')).resolves.toEqual([]);
});

it('createChat maps a unique violation to 409', async () => {
  prisma.telegramChat.create.mockRejectedValue({ code: 'P2002' });
  await expect(service.createChat({ title: 'A', chatId: '-1' })).rejects.toThrow(ConflictException);
});

it('discover hides chats that are already added', async () => {
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
  prisma.telegramChat.findMany.mockResolvedValue([{ chatId: '-1' }]);
  telegram.getUpdatesChats.mockResolvedValue([
    { chatId: '-1', title: 'Уже есть', type: 'group' },
    { chatId: '-2', title: 'Новый', type: 'group' },
  ]);
  await expect(service.discover()).resolves.toEqual([{ chatId: '-2', title: 'Новый', type: 'group' }]);
});

it('testChat sends the confirmation text and maps failure to 502', async () => {
  prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
  prisma.telegramChat.findUnique.mockResolvedValue({ id: 5, chatId: '-5' });
  telegram.sendText.mockResolvedValue({ ok: false, error: 'chat not found' });
  await expect(service.testChat(5)).rejects.toThrow(BadGatewayException);
  expect(telegram.sendText).toHaveBeenCalledWith(VALID, '-5', '✅ Трекер подключён к этому чату');
});
```

Run: `bunx jest telegram-config.service.spec.ts` → FAIL.

- [ ] **Step 2: Реализация сервиса.** Ключевые куски:

```ts
const TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]{30,}$/;
const TEST_MESSAGE = '✅ Трекер подключён к этому чату';

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}

// Пустая строка в env — это «не задано»: docker-compose подставляет '' через ${VAR:-}.
function envValue(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}
```

Строку `Settings` получать тем же способом, что `SettingsService.row()` (findUnique → create `{ id: 1 }`), чтобы не падать на пустой БД. `getBot()` зовёт `getMe` только если токен есть; `source` = `'db'`, если токен из БД, `'env'` — если из env. `tokenHint` = `'…' + token.slice(-4)`. `listChats().envFallback` = `envValue('TELEGRAM_CHAT_ID')`, только если `telegramChat.count() === 0`. `createChat` делает `trim()` у `title` и `chatId`.

- [ ] **Step 3: DTO.**

```ts
// set-bot-token.dto.ts
export class SetBotTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  token: string;
}

// create-chat.dto.ts
export class CreateChatDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  title: string;

  // Числовой id (-100…, -123, 123) или @username публичного канала.
  @IsString() @Matches(/^(-?\d+|@[A-Za-z0-9_]{5,})$/, { message: 'chatId: число или @username канала' })
  chatId: string;

  @IsOptional() @IsBoolean() daily?: boolean;
  @IsOptional() @IsBoolean() weekly?: boolean;
}

// update-chat.dto.ts
export class UpdateChatDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) title?: string;
  @IsOptional() @IsBoolean() daily?: boolean;
  @IsOptional() @IsBoolean() weekly?: boolean;
}
```

- [ ] **Step 4: Контроллер + тест.** `telegram.controller.ts`:

```ts
@Controller('telegram')
export class TelegramController {
  constructor(private readonly config: TelegramConfigService) {}

  @Get('bot') getBot() { return this.config.getBot(); }
  @Put('bot') setBot(@Body() dto: SetBotTokenDto) { return this.config.setBotToken(dto.token); }
  @Delete('bot') clearBot() { return this.config.clearBotToken(); }

  @Get('chats') listChats() { return this.config.listChats(); }
  @Post('chats') createChat(@Body() dto: CreateChatDto) { return this.config.createChat(dto); }
  @Patch('chats/:id') updateChat(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChatDto) { return this.config.updateChat(id, dto); }
  @Delete('chats/:id') @HttpCode(204) deleteChat(@Param('id', ParseIntPipe) id: number) { return this.config.deleteChat(id); }
  @Post('chats/:id/test') async testChat(@Param('id', ParseIntPipe) id: number) { await this.config.testChat(id); return { ok: true }; }

  @Get('discover') discover() { return this.config.discover(); }
}
```

`telegram.controller.spec.ts` — в стиле `days.controller.spec.ts`: `new TelegramController(mockConfig)`, по одному тесту на то, что каждый метод делегирует в сервис с правильными аргументами, и что `testChat` возвращает `{ ok: true }`.

- [ ] **Step 5: Модуль.** `telegram.module.ts`: `controllers: [TelegramController]`, `providers: [TelegramService, TelegramConfigService]`, `exports: [TelegramService, TelegramConfigService]`. В `app.module.ts` добавить `TelegramModule` в `imports` явно (он и так попадает в граф через `DaysModule`, но контроллер должен быть очевиден при чтении `AppModule`).
- [ ] **Step 6: Green + ручная проверка.** `bun run test && bun run build` → PASS. `bun run start:dev`, затем:
  - `curl -s localhost:3001/telegram/bot` → `configured` соответствует `.env`, в ответе нет полного токена.
  - `curl -s -X PUT localhost:3001/telegram/bot -H 'Content-Type: application/json' -d '{"token":"nope"}'` → 400.
  - `curl -s localhost:3001/telegram/chats` → `{"chats":[],"envFallback":...}`.
  - `docker compose logs backend | grep -c "<первые символы токена>"` → 0.
- [ ] **Step 7: Commit.** `graphify update .`; `git add -A backend graphify-out && git commit -m "feat(backend): токен бота и список чатов настраиваются через API"`

---

### Task 5: Бэкенд — рассылка по чатам с идемпотентностью на чат

**Files:**
- Create: `backend/src/telegram/telegram-delivery.service.ts`, `telegram-delivery.service.spec.ts`
- Modify: `backend/src/telegram/telegram.module.ts`, `backend/src/telegram/telegram.service.ts` (удалить временные обёртки из Task 3)
- Modify: `backend/src/days/days.service.ts`, `days.service.spec.ts`, `days.controller.ts`, `days.controller.spec.ts`

**Interfaces — Consumes:** `TelegramConfigService.resolveToken()`, `.recipients(kind)`; `TelegramService.sendDaySummary`, `.sendWeeklySummary`.
**Produces:**
```ts
export interface DeliveryReport { sent: number; failed: number; skipped: number } // skipped = уже было отправлено в этот чат

class TelegramDeliveryService {
  constructor(prisma: PrismaService, config: TelegramConfigService, telegram: TelegramService);
  isConfigured(kind: 'day' | 'week'): Promise<boolean>; // есть токен и хотя бы один получатель этого вида
  deliverDay(dayId: number, summary: DaySummaryInput): Promise<DeliveryReport>;
  deliverWeek(dayId: number, text: string, chartPngBase64: string | null): Promise<DeliveryReport>;
}
```

- [ ] **Step 1: Тесты (red).** `telegram-delivery.service.spec.ts`. Мок Prisma: `day.findUnique`, `telegramPost.create`, `telegramPost.update`, `telegramPost.delete`. Кейсы:

```ts
beforeEach(() => {
  prisma = {
    day: { findUnique: jest.fn().mockResolvedValue({ id: 1, telegramMessageId: null, weeklyTelegramMessageId: null }) },
    telegramPost: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 10, ...data })),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  config = { resolveToken: jest.fn().mockResolvedValue('T'), recipients: jest.fn().mockResolvedValue(['-1', '-2']) };
  telegram = {
    sendDaySummary: jest.fn().mockResolvedValue({ ok: true, messageId: 77 }),
    sendWeeklySummary: jest.fn().mockResolvedValue({ ok: true, messageId: 88 }),
  };
  service = new TelegramDeliveryService(prisma, config, telegram);
});

it('sends the day summary to every daily recipient and records each post', async () => {
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
  expect(prisma.telegramPost.create).toHaveBeenCalledWith({ data: { dayId: 1, chatId: '-1', kind: 'day', messageId: 0 } });
  expect(prisma.telegramPost.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { messageId: 77 } });
  expect(telegram.sendDaySummary).toHaveBeenCalledWith('T', '-2', summary);
});

it('skips a chat whose slot is already claimed', async () => {
  prisma.telegramPost.create
    .mockRejectedValueOnce({ code: 'P2002' })
    .mockImplementationOnce(({ data }) => Promise.resolve({ id: 11, ...data }));
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 1, failed: 0, skipped: 1 });
  expect(telegram.sendDaySummary).toHaveBeenCalledTimes(1);
  expect(telegram.sendDaySummary).toHaveBeenCalledWith('T', '-2', summary);
});

it('releases the slot when sending fails so the next close retries', async () => {
  telegram.sendDaySummary.mockResolvedValueOnce({ ok: false, error: 'chat not found' });
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 1, failed: 1, skipped: 0 });
  expect(prisma.telegramPost.delete).toHaveBeenCalledWith({ where: { id: 10 } });
});

it('does nothing without a token', async () => {
  config.resolveToken.mockResolvedValue(null);
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(prisma.telegramPost.create).not.toHaveBeenCalled();
});

it('treats a day posted by the legacy single-chat code as already delivered everywhere', async () => {
  prisma.day.findUnique.mockResolvedValue({ id: 1, telegramMessageId: 555, weeklyTelegramMessageId: null });
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 0, failed: 0, skipped: 2 });
  expect(telegram.sendDaySummary).not.toHaveBeenCalled();
});

it('weekly: uses weekly recipients and the legacy weekly column', async () => {
  prisma.day.findUnique.mockResolvedValue({ id: 1, telegramMessageId: 555, weeklyTelegramMessageId: null });
  await expect(service.deliverWeek(1, 'text', 'png')).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
  expect(config.recipients).toHaveBeenCalledWith('week');
  expect(telegram.sendWeeklySummary).toHaveBeenCalledWith('T', '-1', 'text', 'png');
});

it('a thrown send error still releases the slot and does not break other chats', async () => {
  telegram.sendDaySummary.mockRejectedValueOnce(new Error('boom'));
  await expect(service.deliverDay(1, summary)).resolves.toEqual({ sent: 1, failed: 1, skipped: 0 });
  expect(prisma.telegramPost.delete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Реализация.**

```ts
@Injectable()
export class TelegramDeliveryService {
  private readonly logger = new Logger(TelegramDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private config: TelegramConfigService,
    private telegram: TelegramService,
  ) {}

  async isConfigured(kind: TelegramPostKind): Promise<boolean> {
    const [token, recipients] = await Promise.all([this.config.resolveToken(), this.config.recipients(kind)]);
    return Boolean(token) && recipients.length > 0;
  }

  deliverDay(dayId: number, summary: DaySummaryInput): Promise<DeliveryReport> {
    return this.deliver(dayId, 'day', (token, chatId) => this.telegram.sendDaySummary(token, chatId, summary));
  }

  deliverWeek(dayId: number, text: string, chartPngBase64: string | null): Promise<DeliveryReport> {
    return this.deliver(dayId, 'week', (token, chatId) => this.telegram.sendWeeklySummary(token, chatId, text, chartPngBase64));
  }

  private async deliver(
    dayId: number,
    kind: TelegramPostKind,
    send: (token: string, chatId: string) => Promise<TelegramSendResult>,
  ): Promise<DeliveryReport> {
    const report: DeliveryReport = { sent: 0, failed: 0, skipped: 0 };
    const token = await this.config.resolveToken();
    if (!token) return report;
    const recipients = await this.config.recipients(kind);

    // Дни, разосланные старым одноканальным кодом, помечены прямо в Day.
    // Кому именно они ушли, неизвестно — считаем, что всем, иначе
    // переоткрытие старого дня разослало бы его заново.
    const day = await this.prisma.day.findUnique({ where: { id: dayId } });
    const legacyId = kind === 'day' ? day?.telegramMessageId : day?.weeklyTelegramMessageId;
    if (legacyId != null) return { ...report, skipped: recipients.length };

    // Последовательно, а не Promise.all: чатов единицы, а так проще читать
    // логи и не упереться в лимиты Telegram на частоту сообщений.
    for (const chatId of recipients) {
      let slot: { id: number };
      try {
        // Уникальный индекс (dayId, chatId, kind) — атомарный захват: из
        // конкурентных закрытий дня строку создаст ровно один запрос.
        slot = await this.prisma.telegramPost.create({ data: { dayId, chatId, kind, messageId: 0 } });
      } catch (e) {
        if (isUniqueViolation(e)) { report.skipped++; continue; }
        throw e;
      }

      let result: TelegramSendResult;
      try {
        result = await send(token, chatId);
      } catch (e) {
        result = { ok: false, error: String(e).split(token).join('<redacted>') };
      }

      if (result.ok) {
        await this.prisma.telegramPost.update({ where: { id: slot.id }, data: { messageId: result.messageId } });
        report.sent++;
      } else {
        // Освобождаем слот: следующее закрытие дня попробует этот чат снова.
        await this.prisma.telegramPost.delete({ where: { id: slot.id } });
        this.logger.warn(`Telegram ${kind} → ${chatId} failed: ${result.error}`);
        report.failed++;
      }
    }
    return report;
  }
}
```

`isUniqueViolation` вынести в `backend/src/common/prisma-errors.ts` и использовать и здесь, и в `TelegramConfigService` (заменить локальную копию из Task 4).

- [ ] **Step 3: DaysService.** Заменить зависимость `TelegramService` на `TelegramDeliveryService`, удалить константу `TELEGRAM_CLAIMED` и захваты через `day.updateMany`:
  - `updateDay`: при `data.eveningClosed === true` → `await this.delivery.deliverDay(dayId, view)`. Отчёт игнорируется (как и раньше, закрытие дня не падает из-за Telegram).
  - `postWeeklySummary`: проверки «день существует и закрыт» и сборка текста — как сейчас, до рассылки. Затем:
    ```ts
    const report = await this.delivery.deliverWeek(day.id, text, chartPngBase64 ?? null);
    if (report.sent > 0) return { posted: true, withChart };
    if (report.failed > 0) return { posted: false, withChart, reason: 'send-failed' };
    return { posted: false, withChart: false, reason: 'already-posted' };
    ```
  - `days.controller.ts`: вместо `TelegramService` инжектить `TelegramDeliveryService`; `if (!(await this.delivery.isConfigured('week'))) throw new ConflictException('Telegram не настроен: задайте токен бота и хотя бы один чат для недельной сводки в настройках');`
  - `telegram.module.ts`: добавить `TelegramDeliveryService` в `providers` и `exports`.
  - `telegram.service.ts`: удалить временные обёртки `isConfigured/postDaySummary/postWeeklySummary` из Task 3; `grep -rn "process.env.TELEGRAM" backend/src` должен находить только `telegram-config.service.ts`.
- [ ] **Step 4: Переписать тесты DaysService/контроллера.** В `days.service.spec.ts` блок `DaysService.updateDay telegram posting`: мок `delivery = { deliverDay: jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 }), deliverWeek: jest.fn() }`; проверить, что при `eveningClosed: true` вызывается `deliverDay(1, expect.objectContaining({ date: '2026-08-01', pomodoros: 7 }))`, а при `eveningClosed: false` / без поля — не вызывается. Для `postWeeklySummary` — три кейса маппинга отчёта (`sent>0` → posted, `failed>0 && sent==0` → send-failed, всё skipped → already-posted) + прежние кейсы «день не закрыт → 400». В `days.controller.spec.ts` — 409 при `isConfigured('week') === false`, остальное как было. Удалить тесты, проверяющие `telegramMessageId`-сентинел.
- [ ] **Step 5: Green.** `cd backend && bun run test && bun run build` → PASS.
- [ ] **Step 6: Интеграционная проверка на живой БД** (реальный бот не нужен): `bun run start:dev` с пустым `TELEGRAM_BOT_TOKEN` → закрыть сегодняшний день через `curl -X PATCH localhost:3001/days/$(date +%F) -H 'Content-Type: application/json' -d '{"eveningClosed":true}'` → 200, в `TelegramPost` пусто. Недельный эндпоинт на воскресенье → 409 с новым текстом.
- [ ] **Step 7: Commit.** `graphify update .`; `git add -A backend graphify-out && git commit -m "feat(backend): сводки рассылаются во все выбранные чаты, один пост на чат"`

---

### Task 6: Фронтенд — вкладки «Telegram-бот» и «Чаты»

**Files:**
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/lib/api.spec.ts`
- Create: `frontend/components/TelegramBotTab.tsx`, `frontend/components/TelegramChatsTab.tsx`, `frontend/components/TelegramSettings.module.css`
- Modify: `frontend/components/SettingsModal.tsx`

**Interfaces — Consumes:** эндпоинты `/telegram/*` из Task 4.
**Produces (`types/api.ts`):**
```ts
export interface TelegramBotView { configured: boolean; source: 'db' | 'env' | null; username: string | null; tokenHint: string | null }
export interface TelegramChat { id: number; title: string; chatId: string; daily: boolean; weekly: boolean; createdAt: string }
export interface TelegramChatList { chats: TelegramChat[]; envFallback: string | null }
export interface TelegramChatInfo { chatId: string; title: string; type: string }
```
**`lib/api.ts`:** `getTelegramBot()`, `setTelegramBotToken(token)`, `clearTelegramBotToken()`, `getTelegramChats()`, `createTelegramChat({ title, chatId, daily?, weekly? })`, `updateTelegramChat(id, { title?, daily?, weekly? })`, `deleteTelegramChat(id)`, `testTelegramChat(id)`, `discoverTelegramChats()`.

- [ ] **Step 1: Тесты api (red).** В `api.spec.ts` (в стиле существующих тестов файла):

```ts
it('setTelegramBotToken PUTs the token', async () => {
  // мок fetch → { ok: true, status: 200, json: async () => ({ configured: true }) }
  await setTelegramBotToken('123:abc');
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/telegram\/bot$/);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ token: '123:abc' }) });
});

it('deleteTelegramChat handles 204', async () => {
  // мок fetch → { ok: true, status: 204 }
  await expect(deleteTelegramChat(5)).resolves.toBeUndefined();
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
});

it('testTelegramChat POSTs to the test endpoint', async () => {
  await testTelegramChat(5);
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/telegram\/chats\/5\/test$/);
});
```

- [ ] **Step 2: Реализация api.ts** — однострочники через существующий `request()`. Ошибки `request()` бросает как `Error` с телом ответа — вкладкам нужен читаемый текст от бэкенда: добавить в `lib/api.ts` экспортируемый хелпер и покрыть тестом:

```ts
// NestJS отдаёт ошибки как {"message": "...", ...}; request() кладёт тело в текст Error.
export function apiErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const json = raw.slice(raw.indexOf('{'));
  try {
    const message = (JSON.parse(json) as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;
  } catch {
    // не JSON — отдаём как есть
  }
  return raw;
}
```
```ts
it('apiErrorMessage extracts the nest message', () => {
  expect(apiErrorMessage(new Error('PUT /telegram/bot failed: 400 {"message":"Telegram не принял токен","statusCode":400}')))
    .toBe('Telegram не принял токен');
});
```

- [ ] **Step 3: `TelegramBotTab.tsx`.**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './TelegramSettings.module.css';
import type { TelegramBotView } from '@/types/api';
import { apiErrorMessage, clearTelegramBotToken, getTelegramBot, setTelegramBotToken } from '@/lib/api';

export default function TelegramBotTab() {
  const [bot, setBot] = useState<TelegramBotView | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTelegramBot().then(setBot).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function save() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setBot(await setTelegramBotToken(token.trim()));
      setToken('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      setBot(await clearTelegramBotToken());
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.status}>
        {!bot && 'загрузка…'}
        {bot && !bot.configured && 'Бот не подключён — сводки в Telegram не отправляются.'}
        {bot?.configured && (
          <>
            Подключён {bot.username ? <b>@{bot.username}</b> : 'бот (Telegram сейчас не ответил)'} · токен {bot.tokenHint}
            {bot.source === 'env' && ' · из .env'}
          </>
        )}
      </div>

      <ol className={styles.help}>
        <li>Открой в Telegram <b>@BotFather</b>, отправь <code>/newbot</code> и следуй подсказкам.</li>
        <li>Скопируй токен вида <code>123456789:AA…</code> и вставь ниже.</li>
        <li>Потом во вкладке «Чаты» выбери, куда слать сводки.</li>
      </ol>

      <div className={styles.row}>
        <input
          type="password"
          autoComplete="off"
          placeholder="Токен бота"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button type="button" onClick={save} disabled={busy || !token.trim()}>
          {bot?.configured ? 'заменить' : 'подключить'}
        </button>
        {bot?.source === 'db' && (
          <button type="button" onClick={disconnect} disabled={busy}>
            отключить
          </button>
        )}
      </div>
      {bot?.source === 'env' && (
        <div className={styles.hint}>Токен из .env используется, пока здесь не задан свой.</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: `TelegramChatsTab.tsx`.** Состояние: `list: TelegramChatList | null`, `botConfigured: boolean` (из `getTelegramBot()`), форма `title`/`chatId`, `found: TelegramChatInfo[] | null`, `notice: string | null` (результат теста), `error: string | null`. Поведение:
  - Если бот не настроен — вместо всего показать «Сначала подключи бота во вкладке «Telegram-бот»».
  - Если `list.envFallback` — баннер: «Сейчас сводки уходят в чат из .env: `{envFallback}`. Как только добавишь чат здесь, .env перестанет использоваться.»
  - Строка чата: инпут названия (сохранение на blur через `updateTelegramChat`), `chatId` моноширинным шрифтом, чекбоксы «день» / «неделя» (сразу `updateTelegramChat`), кнопки «тест» (→ `testTelegramChat`, `notice = 'Отправлено в «{title}»'` или ошибка) и «удалить» (с `window.confirm('Удалить чат «{title}»? Сводки туда больше не пойдут.')`).
  - Форма добавления: «Название», «ID чата или @канал», кнопка «добавить». После добавления — перечитать список.
  - Кнопка «Найти чаты» → `discoverTelegramChats()`; результат — список `{title} · {type} · {chatId}` с кнопкой «добавить» у каждого (создаёт чат с этим `title`/`chatId`, `daily`/`weekly` = true). Пустой результат → «Бот пока ничего не видел. Добавь его в чат, напиши там сообщение (в канале — сделай бота админом) и нажми ещё раз.»
  - Подсказка внизу (из README): «Группа — id отрицательный (`-123…`), супергруппа и канал — `-100…`, публичный канал можно указать как `@username`. Личный чат с ботом — напиши ему `/start`, он появится в «Найти чаты».»
  - Все ошибки — через `apiErrorMessage`.

  Писать по образцу `TelegramBotTab` (тот же паттерн busy/error, те же классы из `TelegramSettings.module.css`).

- [ ] **Step 5: `TelegramSettings.module.css`** — классы `body`, `status`, `help`, `row`, `hint`, `error`, `banner`, `chatRow`, `chatId` (monospace), `found`. Только `var(--…)` из `globals.css`; отступы и размеры шрифта — как в `SettingsModal.module.css`. `.error` — цвет `var(--pom)`.
- [ ] **Step 6: `SettingsModal.tsx`.** Вкладки в порядке: «Категории», «Шаблоны задач», «Залипание», «Telegram-бот», «Чаты». Если пять вкладок не влезают в ширину панели — `.tabs { flex-wrap: wrap; }` в `SettingsModal.module.css`.
- [ ] **Step 7: Green + проверка в браузере.** `cd frontend && bun run test && bun run build` → PASS. `docker compose up -d --build`, http://localhost:4887 и https://tracker.performance:4888 (если Caddy поднят — иначе пропустить и сказать об этом в отчёте):
  - «Telegram-бот»: вставить мусор → красная ошибка, ничего не сохранилось; при токене из `.env` видно «из .env».
  - «Чаты»: при пустой таблице и заданном `TELEGRAM_CHAT_ID` виден баннер; добавить чат, снять «неделя», перезагрузить модалку — состояние сохранилось; удалить.
  - С реальным токеном (только если владелец дал тестового бота; **не** слать тесты в основной канал владельца без его согласия): «Найти чаты», «тест», закрыть день → сообщение пришло ровно один раз в каждый отмеченный «день» чат; переоткрыть и закрыть снова → повторов нет.
- [ ] **Step 8: Commit.** `graphify update .`; `git add -A frontend graphify-out && git commit -m "feat(frontend): вкладки «Telegram-бот» и «Чаты» в настройках"`

---

### Task 7: Документация и финальная проверка

**Files:** `README.md`, `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/system-overview.md`, `.env.example`

- [ ] **Step 1: README.** Раздел «Сводка дня в Telegram» и соседние: основной способ настройки — Настройки → «Telegram-бот» и «Чаты»; `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — фоллбэк для старых инсталляций (правила фоллбэка из «Решений» B.2 и C.2). Идемпотентность — теперь «один пост на день на чат» (`TelegramPost`), легаси-колонки `Day.telegramMessageId`/`weeklyTelegramMessageId` описать как «старые дни считаются разосланными везде». Абзац про «общий чат вдвоём» переписать: теперь это просто второй чат в списке. Все упоминания YouTube-бюджета → «залипание» с настраиваемым названием; `YOUTUBE_BUDGET_DEFAULT` → `DISTRACTION_BUDGET_DEFAULT`.
- [ ] **Step 2: `.env.example`.** Над `TELEGRAM_*` комментарий: `# Необязательно: бот и чаты настраиваются в интерфейсе. Эти значения — фоллбэк, если в настройках пусто.`
- [ ] **Step 3: CLAUDE.md-файлы.** `frontend/CLAUDE.md`: `YoutubePanel`/`YoutubeWeeklyChart`/`YoutubeDailyHeatmap` → `Distraction*` (включая фразу про `recharts`); упомянуть `DistractionSettingsTab`, `TelegramBotTab`, `TelegramChatsTab`. `backend/CLAUDE.md`: в список модулей добавить `telegram` (клиент / config / delivery, env-фоллбэк). Корневой `CLAUDE.md`: трогать только если там есть устаревшие упоминания.
- [ ] **Step 4: `docs/system-overview.md`.** Обновить модель данных (`distractionMinutes`, `Settings.distractionLabel`, `TelegramChat`, `TelegramPost`), модуль `stats` (новые URL), добавить модуль `telegram`. Мотивационный раздел про YouTube **не переписывать** — это личная история владельца; достаточно пометки «в коде это «залипание» (`distraction*`) с настраиваемым названием, у владельца оно называется YouTube».
- [ ] **Step 5: Финальная проверка (superpowers:verification-before-completion).**
  - `cd backend && bun run test && bun run build`
  - `cd frontend && bun run test && bun run build`
  - `docker compose up -d --build && docker compose ps` — все сервисы healthy/running; `docker compose logs backend | tail -50` — без ошибок миграций.
  - `grep -rniE "youtube" backend/src frontend/components frontend/lib frontend/types frontend/app` → пусто (кроме строки `'YouTube'` в миграции и, возможно, текста-примера в `DistractionSettingsTab`).
  - Данные владельца целы: минуты залипания за прошлые дни совпадают с дампом из подготовки (сравнить 5–10 дат).
- [ ] **Step 6: Commit.** `graphify update .`; `git add -A && git commit -m "docs: залипание и Telegram-настройки в README и обзоре системы"`
- [ ] **Step 7:** Не мёржить в `master` самостоятельно — сообщить владельцу, что ветка готова (superpowers:finishing-a-development-branch), приложить короткий отчёт: что сделано, что проверено руками, что не удалось проверить (например, реальную отправку без тестового бота).

---

## Вне скоупа (не делать в этом плане)

- Удаление легаси-колонок `Day.telegramMessageId` / `weeklyTelegramMessageId`.
- Авторизация/многопользовательность — друг получает **свою** инсталляцию (свой docker compose), а не аккаунт в этой.
- Автотрекинг экранного времени (Screen Time/Qbserve) — минуты по-прежнему заносятся вручную.
- Webhook-режим бота и приём команд от бота — бот только отправляет.
