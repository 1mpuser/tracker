# CLAUDE.md (backend)

Guidance specific to `backend/`. See the repo root `CLAUDE.md` for what this project is, full-stack commands, CORS, and Docker notes.

## Commands

```bash
docker compose up -d postgres              # just the DB, for local dev
cp ../.env.example .env                    # then edit DATABASE_URL to use localhost:5434
bun install
bunx prisma migrate dev                    # apply/create migrations
bunx prisma db seed                        # re-seed categories + settings
bun run start:dev                          # dev server on :3001
bun run build                              # nest build -> dist/
bun run test                                # jest, all specs
bunx jest categories.service.spec.ts       # single test file
```

Migrations inside the running container: `docker compose exec backend bunx prisma migrate deploy`.

## Architecture — NestJS modules-by-feature

`backend/src/<feature>/` — each of `categories`, `dailies`, `days`, `settings`, `stats`, `task-templates`, `telegram` has its own `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, and a `*.service.spec.ts` that mocks `PrismaService` directly (no `@nestjs/testing` TestingModule — plain `new XService(mockPrisma)`). `PrismaModule` (`backend/src/prisma/`) is `@Global()`, so no feature module needs to import it explicitly.

### Telegram module (three services)

- `telegram.service.ts` — dumb HTTP client for the Bot API. Never reads `process.env`; token and chatId are passed to every call. Methods return `TelegramSendResult`/typed errors, never throw; the token is redacted from log messages.
- `telegram-config.service.ts` — the only place that knows about `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env fallback. Effective token = DB (`Settings.telegramBotToken`) → env → null. Chats come from the `TelegramChat` table; if the table is empty, `TELEGRAM_CHAT_ID` acts as a single virtual recipient (`envFallback` in `listChats()`). Exposes `/telegram/bot` and `/telegram/chats` endpoints.
- `telegram-delivery.service.ts` — fan-out of day/week summaries to all configured chats with per-chat idempotency via the `TelegramPost` table (`@@unique([dayId, chatId, kind])`, claimed with `messageId: 0`, released on failure). Legacy single-chat sends are detected through `Day.telegramMessageId`/`weeklyTelegramMessageId` and treated as "already sent everywhere".

`backend/src/common/date.util.ts` is the single source of truth for date handling — the `Day.date` column is `@db.Date`, and every date-taking function goes through UTC-safe helpers (`todayDate()`, `addDays()`, `formatDate()`, `parseDateParam()`). `parseDateParam` round-trips the parsed date back through `formatDate` and compares against the input specifically to catch JS's silent calendar rollover (e.g. `2026-02-30` → `2026-03-02`) — don't "simplify" that check away.

**Every `:date`-taking endpoint accepts an arbitrary date, not just today.** This was true from the very first backend implementation and is what makes `DayDetailModal` (frontend, view/edit past days) possible with zero backend changes.

**Archiving semantics**: a `Category` can be archived (soft-delete). `GET /days/:date` and the main-screen `SpheresPanel` only ever show non-archived categories. `GET /history` is different and more careful: a historical day's `total`/`completed` still count an archived category if that day has a tracked `DayCategoryStatus` row for it, so archiving a category never retroactively corrupts past stats — but it *does* mean you can't re-toggle that category from the UI for a day where it was already tracked. This asymmetry is intentional, not a bug.

### `backend/tsconfig.json` has `strictPropertyInitialization: false`

Deliberate — lets DTO classes declare fields like `key: string;` without a `!` assertion. Don't "fix" this by adding `!` everywhere or re-enabling the flag.
