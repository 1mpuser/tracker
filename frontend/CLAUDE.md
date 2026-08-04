# CLAUDE.md (frontend)

Guidance specific to `frontend/`. See the repo root `CLAUDE.md` for what this project is, full-stack commands, CORS, and Docker notes.

## Commands

```bash
docker compose up -d postgres backend      # backend deps, for local dev
cp .env.example .env.local                 # NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev                                 # dev server on :4887 (NOT Next's default :3000 — backend CORS is locked to specific origins, see below)
bun run build
bun run test
bunx jest streak.spec.ts                   # single test file
```

## Architecture — single client-fetched screen

`frontend/app/page.tsx` renders one component, `Dashboard.tsx`, which is `'use client'` and owns essentially all top-level state (today's `day`, 84-day `history`, `settings`, modal-open flags). Every other component is either:
- a pure prop/callback component with no `'use client'` and no hooks (`Header`, `SpheresPanel`, `YoutubePanel`, `StatsPanel`, `CategoryHeatmap`, `StreakHeatmap`), or
- a small self-contained `'use client'` component that owns its own fetch-on-mount for stats endpoints Dashboard doesn't already have (`CategoryBars`, `YoutubeWeeklyChart`, `YoutubeDailyHeatmap`, `TaskTemplatesTab`).

**Nothing is server-rendered with real data** — `Dashboard` fetches everything inside `useEffect`, so curl/SSR only ever sees the pre-hydration "загрузка…" shell. This is expected, not a bug; verify UI behavior in an actual browser.

`frontend/lib/*.ts` holds all pure, TDD-tested logic, imported by components: `api.ts` (typed fetch client, one function per backend endpoint), `date.ts` (mostly UTC helpers for manipulating an already-known date string — `parseUTC`/`formatUTC`/`addDaysUTC` — but `todayLocal()` is the deliberate exception and is the single source of "what day is it" for the whole app: it reads the local wall-clock calendar date, not UTC, so the panel matches the user's own midnight rather than UTC midnight), `streak.ts` (`STREAK_THRESHOLD = 2`; a day counts toward the header streak if `completed >= 2` categories, not all of them — this replaced an earlier "all categories" rule that became unrealistic as the category count grew), `heatmap.ts` (color-bucketing functions for the three heatmap-style visualizations), `transliterate.ts` (Cyrillic label → category key slug, with a `category-<timestamp>` fallback for labels that transliterate to nothing), `notifications.ts` (local wall-clock time, same reasoning as `todayLocal()`).

`Dashboard.tsx`'s `date` state isn't a one-time snapshot — a `useEffect` re-checks `todayLocal()` every 60s and on `visibilitychange`, so the panel advances to the new day on its own if the tab is left open across midnight, no manual reload needed. `GET /history` accepts an optional `?end=` anchor for exactly this reason: it must agree with whatever the frontend currently considers "today" (local), not fall back to the backend's own UTC "today" — otherwise the heatmaps' rightmost column would drift out of sync with the panel for the first few hours of each local day.

`SpheresPanel` and `DailiesPanel` are reused verbatim (identical props, no branching) inside both the main screen and `DayDetailModal` — the modal just points their callbacks at a selected past date instead of today. Don't add a `disabled`/`readOnly` prop to them for the modal's read-only view state; that view is rendered as separate plain markup instead, to keep these two components' interfaces stable.

Design tokens are fixed CSS custom properties in `app/globals.css` (`--bg`, `--panel`, `--accent`, `--accent-glow`, etc.) — every component's CSS Module reads from these, no hardcoded colors, no UI-kit library. `recharts` is the sole exception to "no library," used only in `YoutubeWeeklyChart`.
