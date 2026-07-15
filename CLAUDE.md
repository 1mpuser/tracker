# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, single-user, self-hosted daily habit tracker. No auth. Four Docker Compose services: `postgres`, `backend` (NestJS + Prisma), `frontend` (Next.js App Router), `caddy` (TLS-terminating reverse proxy). Runs only on localhost.

- Frontend: http://localhost:4887 (direct, no TLS)
- Frontend over HTTPS: https://tracker.performance:4888 (via Caddy — see "HTTPS / tracker.performance" below; this is the only origin where Safari favicons and the Notification API both work correctly)
- Backend API: http://localhost:3001
- Postgres: localhost:5434 (mapped from container's internal 5432 — 5432 was already taken by an unrelated container on the dev machine; this has no effect on container-to-container networking, which still uses 5432)

Design docs live in `docs/superpowers/specs/` (approved feature designs) and `docs/superpowers/plans/` (implementation plans, task-by-task). `claude_code_prompt.md` is the original product spec the first two plans were built from — later features evolved past it organically and it was not kept in sync; don't treat it as current truth.

## Commands

Package manager & runtime is **Bun** everywhere (`bun install` / `bun run` / `bunx`) — not npm/yarn/pnpm.

### Full stack

```bash
docker compose up -d --build   # rebuild + run all 3 services
docker compose ps               # check health
docker compose logs backend     # or frontend/postgres
```

### Backend (`backend/`)

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

### Frontend (`frontend/`)

```bash
docker compose up -d postgres backend      # backend deps, for local dev
cp .env.example .env.local                 # NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev                                 # dev server on :4887 (NOT Next's default :3000 — backend CORS is locked to specific origins, see below)
bun run build
bun run test
bunx jest streak.spec.ts                   # single test file
```

## Architecture

### Backend — NestJS modules-by-feature

`backend/src/<feature>/` — each of `categories`, `dailies`, `days`, `settings`, `stats`, `task-templates` has its own `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, and a `*.service.spec.ts` that mocks `PrismaService` directly (no `@nestjs/testing` TestingModule — plain `new XService(mockPrisma)`). `PrismaModule` (`backend/src/prisma/`) is `@Global()`, so no feature module needs to import it explicitly.

`backend/src/common/date.util.ts` is the single source of truth for date handling — the `Day.date` column is `@db.Date`, and every date-taking function goes through UTC-safe helpers (`todayDate()`, `addDays()`, `formatDate()`, `parseDateParam()`). `parseDateParam` round-trips the parsed date back through `formatDate` and compares against the input specifically to catch JS's silent calendar rollover (e.g. `2026-02-30` → `2026-03-02`) — don't "simplify" that check away.

**Every `:date`-taking endpoint accepts an arbitrary date, not just today.** This was true from the very first backend implementation and is what makes `DayDetailModal` (frontend, view/edit past days) possible with zero backend changes.

**Archiving semantics**: a `Category` can be archived (soft-delete). `GET /days/:date` and the main-screen `SpheresPanel` only ever show non-archived categories. `GET /history` is different and more careful: a historical day's `total`/`completed` still count an archived category if that day has a tracked `DayCategoryStatus` row for it, so archiving a category never retroactively corrupts past stats — but it *does* mean you can't re-toggle that category from the UI for a day where it was already tracked. This asymmetry is intentional, not a bug.

### Frontend — single client-fetched screen

`frontend/app/page.tsx` renders one component, `Dashboard.tsx`, which is `'use client'` and owns essentially all top-level state (today's `day`, 84-day `history`, `settings`, modal-open flags). Every other component is either:
- a pure prop/callback component with no `'use client'` and no hooks (`Header`, `SpheresPanel`, `YoutubePanel`, `StatsPanel`, `CategoryHeatmap`, `StreakHeatmap`), or
- a small self-contained `'use client'` component that owns its own fetch-on-mount for stats endpoints Dashboard doesn't already have (`CategoryBars`, `YoutubeWeeklyChart`, `YoutubeDailyHeatmap`, `TaskTemplatesTab`).

**Nothing is server-rendered with real data** — `Dashboard` fetches everything inside `useEffect`, so curl/SSR only ever sees the pre-hydration "загрузка…" shell. This is expected, not a bug; verify UI behavior in an actual browser.

`frontend/lib/*.ts` holds all pure, TDD-tested logic, imported by components: `api.ts` (typed fetch client, one function per backend endpoint), `date.ts` (UTC helpers mirroring the backend's convention — `todayUTC()` is the single source of "what day is it" for every API call), `streak.ts` (`STREAK_THRESHOLD = 2`; a day counts toward the header streak if `completed >= 2` categories, not all of them — this replaced an earlier "all categories" rule that became unrealistic as the category count grew), `heatmap.ts` (color-bucketing functions for the three heatmap-style visualizations), `transliterate.ts` (Cyrillic label → category key slug, with a `category-<timestamp>` fallback for labels that transliterate to nothing), `notifications.ts` (**deliberately local wall-clock time**, not UTC — reminder windows should track when the user is actually at their computer, unlike every other date function in this codebase).

`SpheresPanel` and `DailiesPanel` are reused verbatim (identical props, no branching) inside both the main screen and `DayDetailModal` — the modal just points their callbacks at a selected past date instead of today. Don't add a `disabled`/`readOnly` prop to them for the modal's read-only view state; that view is rendered as separate plain markup instead, to keep these two components' interfaces stable.

Design tokens are fixed CSS custom properties in `app/globals.css` (`--bg`, `--panel`, `--accent`, `--accent-glow`, etc.) — every component's CSS Module reads from these, no hardcoded colors, no UI-kit library. `recharts` is the sole exception to "no library," used only in `YoutubeWeeklyChart`.

### CORS / origins

`backend/src/main.ts` allows exactly two origins: `http://localhost:4887` and `https://tracker.performance:4888`. If you add another way to reach the frontend, it needs an entry in this CORS origin list or every API call will silently fail client-side.

### HTTPS / tracker.performance

Plain `http://localhost:4887` has two browser-level limitations that can't be fixed in application code: Safari doesn't reliably fetch favicons for the literal hostname `localhost` (confirmed by A/B testing `localhost` vs `127.0.0.1`, a known WebKit quirk), and the Notification API is silently inert on any HTTP origin other than `localhost`/loopback-IP — `window.isSecureContext` is `false` there per the W3C secure-contexts spec, even for a `/etc/hosts` entry that resolves to `127.0.0.1`.

The fix is a real HTTPS origin on a dedicated hostname: `caddy/Caddyfile` terminates TLS for `tracker.performance:443` using a [mkcert](https://github.com/FiloSottile/mkcert)-issued, locally-trusted certificate (`caddy/certs/`, gitignored — private key must never be committed) and reverse-proxies to the `frontend` container. The `caddy` service in `docker-compose.yml` publishes this on host port **4888**. Requires a one-time `mkcert -install` and a `127.0.0.1 tracker.performance` entry in `/etc/hosts` on the dev machine (see README's "HTTPS via tracker.performance" section for exact commands) — neither is part of the repo.

### Docker

Both `backend/Dockerfile` and `frontend/Dockerfile` are Bun-based multi-stage builds (`oven/bun:1-alpine`), not Node. The backend needs `apk add openssl` in both stages for Prisma's query engine to work on Alpine (missing `openssl` CLI breaks engine detection even though `libssl3` is present). The frontend uses Next's `output: 'standalone'`, so its runtime stage only needs `.next/standalone` + `.next/static` + `public/`, not a full `node_modules` copy. `NEXT_PUBLIC_API_URL` is a build `ARG` (not just a runtime `ENV`) because Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle at `next build` time.

### `backend/tsconfig.json` has `strictPropertyInitialization: false`

Deliberate — lets DTO classes declare fields like `key: string;` without a `!` assertion. Don't "fix" this by adding `!` everywhere or re-enabling the flag.
