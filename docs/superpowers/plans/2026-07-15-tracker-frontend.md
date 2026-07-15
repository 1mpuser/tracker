# Tracker Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js (App Router) frontend for the personal daily tracker described in `claude_code_prompt.md`, consuming the already-complete backend (`docs/superpowers/plans/2026-07-15-tracker-backend.md`) at `http://localhost:3001`, and wire it into the existing `docker-compose.yml` as a third service.

**Architecture:** A single client-rendered screen (`app/page.tsx` → `components/Dashboard.tsx`, `'use client'`) that fetches everything from the browser via `NEXT_PUBLIC_API_URL` (no server-side data fetching — the spec requires browser-side calls, not through the Docker network). Presentational components (Header, SpheresPanel, DailiesPanel, YoutubePanel, StatsPanel + 4 visualizations, SettingsModal + 2 tabs) each own one section of the screen; `Dashboard` owns the top-level state for "today" (day/history/settings) and passes handlers down as props. Pure, order-sensitive logic (UTC date handling, streak calculation, transliteration, heatmap color bucketing, notification time windows) lives in `lib/*.ts`, unit-tested with Jest — mirroring the backend plan's TDD calibration (test real logic, verify UI wiring by building + running the app).

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, plain CSS Modules (no UI-kit library), `recharts` (only for the YouTube-weekly bar chart), Bun as package manager/runtime, Jest for unit tests, Docker Compose (adds a `frontend` service to the existing file).

This is **Plan 2 of 2**. Plan 1 (backend) is complete — all endpoints below already exist and are verified working.

## Global Constraints

- Stack: Next.js App Router, plain CSS Modules only — no MUI/Chakra/Tailwind/etc. `recharts` is the sole exception, used only for the YouTube-weekly chart.
- One screen at `/`. No routing to separate pages. The settings UI is a modal, not a route. The stats visualizations are a panel on the same screen, not a separate tab/route.
- API calls happen **from the browser** via `NEXT_PUBLIC_API_URL` (Next.js inlines `NEXT_PUBLIC_*` vars at **build time** — the Docker build must receive it as a build `ARG`, not only a runtime env var).
- **All "today" date logic must be UTC**, matching the backend's `todayDate()` (`backend/src/common/date.util.ts`). This was flagged in the backend's final review: the backend computes "today" in UTC for its `@db.Date` columns; if the frontend used the browser's local calendar date instead, a user in a non-UTC timezone would see a different "today" than the backend near local midnight. `lib/date.ts`'s `todayUTC()` is the single source of truth for which date string (`YYYY-MM-DD`) every API call uses.
- **Notification time windows, by contrast, use local wall-clock time** (`Date.getHours()`/`getMinutes()`, not UTC) — this is intentional and different from the date convention above: the spec explicitly requires "по локальному времени браузера" for the 09:00–21:30 / 21:30–24:00 windows, since that's about when the user is actually at their computer. Do not "fix" this to UTC.
- Package manager & runtime: **Bun** (`bun install` / `bun run` / `bunx`), matching the backend plan. Both local dev and the Docker image use Bun. No ESLint is installed (not required by spec, keeps scope minimal); `next.config.js` sets `eslint.ignoreDuringBuilds: true` so a missing ESLint config never breaks `next build`.
- Both local dev (`bun run dev`) and the Docker container's host-published port resolve to **`http://localhost:4887`** — the backend's CORS is locked to exactly this origin (`backend/src/main.ts`, already deployed). Local dev therefore runs `next dev -p 4887` (not the Next.js default 3000) so requests to the backend aren't rejected by CORS during development. Inside Docker, the container's internal Next.js port stays the default `3000`; `docker-compose.yml` publishes it to the host as `4887:3000` (the same "internal port stays default, host port remapped" pattern already used for Postgres in Plan 1).
- Design tokens (from `claude_code_prompt.md`, section "Дизайн-система") are fixed — copy them verbatim into `app/globals.css`, do not substitute another palette:
  ```css
  --bg: #14161b; --panel: #1b1e25; --panel-alt: #20242c; --border: #2b2f38;
  --text: #e8e6de; --text-muted: #888d98; --text-dim: #5b5f6a;
  --accent: #e0a458; --accent2: #4fa8c9; --danger: #d9645a; --radius: 10px;
  ```
- Endpoint contracts this frontend consumes (exact, from the backend plan — all already implemented and verified):
  - `GET /days/:date` → `{ date, youtubeMinutes, eveningClosed, categories: [{key,label,done}], dailies: [{id,text,done,order}] }`
  - `PATCH /days/:date/categories/:key` `{ done }`
  - `POST /days/:date/dailies` `{ text }`, `PATCH /dailies/:id` `{ done?, text? }`, `DELETE /dailies/:id`
  - `PATCH /days/:date/youtube` `{ delta?, reset? }`
  - `PATCH /days/:date` `{ eveningClosed }`
  - `GET /history?limit=` → `{ date, completed, total, ytOver }[]`
  - `GET /categories`, `POST /categories` `{ key, label }`, `PATCH /categories/:key` `{ label?, order?, archived? }`
  - `GET /task-templates`, `POST /task-templates` `{ text }`, `PATCH /task-templates/:id` `{ text?, order? }`, `DELETE /task-templates/:id`
  - `GET /stats/categories?days=` → `{ key, label, doneCount, totalDays, pct }[]`
  - `GET /stats/youtube?weeks=` → `{ weekStart, avgMinutes, budget }[]`
  - `GET /stats/youtube-daily?days=` → `{ date, minutes, budget, pct }[]`
  - `GET /settings`, `PATCH /settings` `{ youtubeBudget?, notificationsEnabled? }`
- The header's streak count and the 12-week heatmap both read from the **same** `GET /history?limit=84` call (fetched once by `Dashboard`) — do not add a second, separate `/history?limit=21` call; the spec's flat 21-day strip was superseded by the 84-day heatmap.

---

### Task 1: Scaffold Next.js project + Bun + design tokens

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.js`
- Create: `frontend/jest.config.js`
- Create: `frontend/next-env.d.ts`
- Create: `frontend/.gitignore`
- Create: `frontend/.dockerignore`
- Create: `frontend/public/.gitkeep`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a bootable Next.js app on port 4887 (dev) rendering a placeholder; `app/page.tsx` is the extension point Task 7 replaces; `jest.config.js` is the test-running setup every later `lib/*.spec.ts` task relies on; design tokens in `app/globals.css` are consumed by every component's CSS Module via `var(--token)`.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "tracker-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 4887",
    "build": "next build",
    "start": "next start -p 4887",
    "test": "jest"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `frontend/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 4: Create `frontend/jest.config.js`**

Next.js's own `tsconfig.json` (`noEmit`, `jsx: "preserve"`, `moduleResolution: "bundler"`) is for the Next.js bundler, not for standalone `ts-jest` compilation — trying to reuse it directly in Jest causes transform errors. This config overrides the compiler options ts-jest actually needs, independent of `tsconfig.json`:

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          noEmit: false,
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
};
```

- [ ] **Step 5: Create `frontend/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 6: Create `frontend/.gitignore`**

```
node_modules/
.next/
out/
.env
```

- [ ] **Step 7: Create `frontend/.dockerignore`**

```
node_modules
.next
.env
```

- [ ] **Step 8: Create `frontend/public/.gitkeep`**

Empty file — ensures the `public/` directory exists so the Dockerfile's later `COPY --from=builder /app/public ./public` (Task 19) doesn't fail on a missing directory.

- [ ] **Step 9: Create `frontend/app/globals.css`**

```css
:root {
  --bg: #14161b;
  --panel: #1b1e25;
  --panel-alt: #20242c;
  --border: #2b2f38;
  --text: #e8e6de;
  --text-muted: #888d98;
  --text-dim: #5b5f6a;
  --accent: #e0a458;
  --accent-soft: rgba(224, 164, 88, 0.14);
  --accent-glow: rgba(224, 164, 88, 0.35);
  --accent2: #4fa8c9;
  --accent2-soft: rgba(79, 168, 201, 0.14);
  --danger: #d9645a;
  --danger-soft: rgba(217, 100, 90, 0.16);
  --radius: 10px;
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  min-height: 100vh;
}

button,
input {
  font-family: inherit;
  color: inherit;
}
```

- [ ] **Step 10: Create `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Панель дня',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Create `frontend/app/page.tsx`** (placeholder — Task 7 replaces this)

```tsx
export default function Home() {
  return <div style={{ padding: 24 }}>Панель дня — загрузка…</div>;
}
```

- [ ] **Step 12: Install dependencies and verify the dev server boots**

```bash
cd frontend && bun install
bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'Панель дня'
```

Expected: prints `Панель дня` (found in the placeholder HTML).
Stop the dev server (`kill %1` or Ctrl+C in its terminal) before continuing.

- [ ] **Step 13: Verify the production build succeeds**

Run: `cd frontend && bun run build`
Expected: completes with "✓ Compiled successfully", no type errors.

- [ ] **Step 14: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/package.json frontend/tsconfig.json frontend/next.config.js frontend/jest.config.js frontend/next-env.d.ts frontend/.gitignore frontend/.dockerignore frontend/public frontend/app frontend/bun.lock
git commit -m "feat(frontend): bootstrap Next.js App Router skeleton with design tokens"
```

---

### Task 2: Shared types + API client

**Files:**
- Create: `frontend/types/api.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/api.spec.ts`

**Interfaces:**
- Consumes: nothing beyond Task 1's project skeleton.
- Produces: TypeScript interfaces (`DayView`, `CategoryView`, `DailyTaskView`, `HistoryEntry`, `Category`, `TaskTemplate`, `Settings`, `CategoryStat`, `YoutubeWeekStat`, `YoutubeDayStat`) in `@/types/api`, and typed fetch functions in `@/lib/api` (`getDay`, `setCategoryDone`, `addDaily`, `updateDaily`, `deleteDaily`, `updateYoutube`, `setEveningClosed`, `getHistory`, `getCategories`, `createCategory`, `updateCategory`, `getTaskTemplates`, `createTaskTemplate`, `updateTaskTemplate`, `deleteTaskTemplate`, `getSettings`, `updateSettings`, `getCategoryStats`, `getYoutubeWeeklyStats`, `getYoutubeDailyStats`) — every later task imports from these two files instead of calling `fetch` directly.

- [ ] **Step 1: Create `frontend/types/api.ts`**

```ts
export interface CategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DailyTaskView {
  id: number;
  text: string;
  done: boolean;
  order: number;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  categories: CategoryView[];
  dailies: DailyTaskView[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
}

export interface Category {
  id: number;
  key: string;
  label: string;
  order: number;
  archived: boolean;
}

export interface TaskTemplate {
  id: number;
  text: string;
  order: number;
}

export interface Settings {
  id: number;
  youtubeBudget: number;
  notificationsEnabled: boolean;
}

export interface CategoryStat {
  key: string;
  label: string;
  doneCount: number;
  totalDays: number;
  pct: number;
}

export interface YoutubeWeekStat {
  weekStart: string;
  avgMinutes: number;
  budget: number;
}

export interface YoutubeDayStat {
  date: string;
  minutes: number;
  budget: number;
  pct: number;
}
```

- [ ] **Step 2: Write the failing unit test — `frontend/lib/api.spec.ts`**

```ts
import { getDay } from './api';

describe('api request helper', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds the request URL from NEXT_PUBLIC_API_URL and parses JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-07-15' }),
    }) as unknown as typeof fetch;

    const result = await getDay('2026-07-15');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-07-15',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(result).toEqual({ date: '2026-07-15' });
  });

  it('throws a descriptive error on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    }) as unknown as typeof fetch;

    await expect(getDay('2026-02-30')).rejects.toThrow('404');
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd frontend && bunx jest api.spec.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 4: Create `frontend/lib/api.ts`**

```ts
import type {
  Category,
  CategoryStat,
  DailyTaskView,
  DayView,
  HistoryEntry,
  Settings,
  TaskTemplate,
  YoutubeDayStat,
  YoutubeWeekStat,
} from '@/types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getDay(date: string): Promise<DayView> {
  return request(`/days/${date}`);
}

export function setCategoryDone(date: string, key: string, done: boolean): Promise<DayView> {
  return request(`/days/${date}/categories/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  });
}

export function addDaily(date: string, text: string): Promise<DailyTaskView> {
  return request(`/days/${date}/dailies`, { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateDaily(id: number, data: { done?: boolean; text?: string }): Promise<DailyTaskView> {
  return request(`/dailies/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteDaily(id: number): Promise<{ id: number }> {
  return request(`/dailies/${id}`, { method: 'DELETE' });
}

export function updateYoutube(date: string, data: { delta?: number; reset?: boolean }): Promise<DayView> {
  return request(`/days/${date}/youtube`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function setEveningClosed(date: string, eveningClosed: boolean): Promise<DayView> {
  return request(`/days/${date}`, { method: 'PATCH', body: JSON.stringify({ eveningClosed }) });
}

export function getHistory(limit: number): Promise<HistoryEntry[]> {
  return request(`/history?limit=${limit}`);
}

export function getCategories(): Promise<Category[]> {
  return request('/categories');
}

export function createCategory(key: string, label: string): Promise<Category> {
  return request('/categories', { method: 'POST', body: JSON.stringify({ key, label }) });
}

export function updateCategory(
  key: string,
  data: { label?: string; order?: number; archived?: boolean },
): Promise<Category> {
  return request(`/categories/${key}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function getTaskTemplates(): Promise<TaskTemplate[]> {
  return request('/task-templates');
}

export function createTaskTemplate(text: string): Promise<TaskTemplate> {
  return request('/task-templates', { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateTaskTemplate(id: number, data: { text?: string; order?: number }): Promise<TaskTemplate> {
  return request(`/task-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export function deleteTaskTemplate(id: number): Promise<{ id: number }> {
  return request(`/task-templates/${id}`, { method: 'DELETE' });
}

export function getSettings(): Promise<Settings> {
  return request('/settings');
}

export function updateSettings(data: { youtubeBudget?: number; notificationsEnabled?: boolean }): Promise<Settings> {
  return request('/settings', { method: 'PATCH', body: JSON.stringify(data) });
}

export function getCategoryStats(days: number): Promise<CategoryStat[]> {
  return request(`/stats/categories?days=${days}`);
}

export function getYoutubeWeeklyStats(weeks: number): Promise<YoutubeWeekStat[]> {
  return request(`/stats/youtube?weeks=${weeks}`);
}

export function getYoutubeDailyStats(days: number): Promise<YoutubeDayStat[]> {
  return request(`/stats/youtube-daily?days=${days}`);
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd frontend && bunx jest api.spec.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/types frontend/lib/api.ts frontend/lib/api.spec.ts
git commit -m "feat(frontend): add shared API types and typed fetch client"
```

---

### Task 3: `lib/date.ts` — UTC date helpers

**Files:**
- Create: `frontend/lib/date.ts`
- Create: `frontend/lib/date.spec.ts`

**Interfaces:**
- Consumes: nothing beyond Task 1.
- Produces: `parseUTC(dateStr: string): Date`, `formatUTC(date: Date): string`, `addDaysUTC(date: Date, days: number): Date`, `todayUTC(): string`, `formatDisplayDate(dateStr: string): string` — `todayUTC()` is consumed by `Dashboard` (Task 7) as the single source of "today"; `formatDisplayDate` by the Header (Task 8); `addDaysUTC`/`parseUTC` by `lib/streak.ts` (Task 4) and `lib/heatmap.ts` (Task 6).

- [ ] **Step 1: Write the failing unit test — `frontend/lib/date.spec.ts`**

```ts
import { addDaysUTC, formatDisplayDate, formatUTC, parseUTC, todayUTC } from './date';

describe('date utils', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    expect(parseUTC('2026-07-15').toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('formats a UTC date back to YYYY-MM-DD', () => {
    expect(formatUTC(new Date('2026-07-15T00:00:00.000Z'))).toBe('2026-07-15');
  });

  it('adds days across a month boundary without drifting', () => {
    expect(formatUTC(addDaysUTC(new Date('2026-07-31T00:00:00.000Z'), 1))).toBe('2026-08-01');
  });

  it('todayUTC reads the UTC calendar date, not the local one', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T22:00:00.000Z'));
    expect(todayUTC()).toBe('2026-07-15');
    jest.useRealTimers();
  });

  it('formats a Russian display date (weekday, day, month)', () => {
    expect(formatDisplayDate('2026-07-15')).toBe('среда, 15 июля');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest date.spec.ts`
Expected: FAIL — `Cannot find module './date'`.

- [ ] **Step 3: Create `frontend/lib/date.ts`**

```ts
export function parseUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function formatUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function todayUTC(): string {
  const now = new Date();
  return formatUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

export function formatDisplayDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseUTC(dateStr));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest date.spec.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/date.ts frontend/lib/date.spec.ts
git commit -m "feat(frontend): add UTC-safe date utilities"
```

---

### Task 4: `lib/streak.ts` — streak calculation

**Files:**
- Create: `frontend/lib/streak.ts`
- Create: `frontend/lib/streak.spec.ts`

**Interfaces:**
- Consumes: `HistoryEntry` from `@/types/api` (Task 2), `addDaysUTC`/`formatUTC`/`parseUTC` from `@/lib/date` (Task 3).
- Produces: `computeStreak(history: HistoryEntry[], today: { date: string; completed: number; total: number }): number` — consumed by `Dashboard` (Task 7) to render the header streak count without needing to refetch `/history` after every toggle (today's live completion state is passed in directly and overrides whatever `/history` returned for today's date).

- [ ] **Step 1: Write the failing unit test — `frontend/lib/streak.spec.ts`**

```ts
import { computeStreak } from './streak';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, completed: number, total: number): HistoryEntry {
  return { date, completed, total, ytOver: false };
}

describe('computeStreak', () => {
  it('counts consecutive fully-complete days ending yesterday when today is not yet complete', () => {
    const history = [entry('2026-07-12', 5, 5), entry('2026-07-13', 5, 5), entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2, total: 5 })).toBe(3);
  });

  it('adds today to the streak only when today is itself fully complete', () => {
    const history = [entry('2026-07-13', 5, 5), entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(3);
  });

  it('breaks the streak at the first incomplete day looking backward', () => {
    const history = [
      entry('2026-07-11', 5, 5),
      entry('2026-07-12', 3, 5),
      entry('2026-07-13', 5, 5),
      entry('2026-07-14', 5, 5),
    ];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(3);
  });

  it('treats a day with no history record as broken, not complete', () => {
    const history = [entry('2026-07-14', 5, 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(2);
  });

  it('does not count a degenerate 0-total day (all categories archived) as complete', () => {
    const history = [entry('2026-07-14', 0, 0)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 0, total: 0 })).toBe(0);
  });

  it('uses the live today param over a stale history record for the same date', () => {
    // /history was fetched before the user's most recent toggle today, so it still
    // shows an incomplete day — the caller passes the fresher live state instead.
    const history = [
      entry('2026-07-13', 5, 5),
      entry('2026-07-14', 5, 5),
      entry('2026-07-15', 2, 5), // stale: history hasn't caught up with today's toggles yet
    ];
    expect(computeStreak(history, { date: '2026-07-15', completed: 5, total: 5 })).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest streak.spec.ts`
Expected: FAIL — `Cannot find module './streak'`.

- [ ] **Step 3: Create `frontend/lib/streak.ts`**

```ts
import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export interface TodayCompletion {
  date: string;
  completed: number;
  total: number;
}

export function computeStreak(history: HistoryEntry[], today: TodayCompletion): number {
  // Deliberately excludes today.date: the backward loop below starts at yesterday
  // and never revisits it, and the final check below reads `today` directly — so
  // today's completion always comes from the live `today` param, never from a
  // (possibly stale) matching entry inside `history`.
  const map = new Map(history.filter((h) => h.date !== today.date).map((h) => [h.date, h]));

  let streak = 0;
  let cursor = addDaysUTC(parseUTC(today.date), -1);
  while (true) {
    const rec = map.get(formatUTC(cursor));
    if (rec && rec.total > 0 && rec.completed === rec.total) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    } else {
      break;
    }
  }

  if (today.total > 0 && today.completed === today.total) {
    streak++;
  }

  return streak;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest streak.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/streak.ts frontend/lib/streak.spec.ts
git commit -m "feat(frontend): add streak calculation from history"
```

---

### Task 5: `lib/transliterate.ts` — category key generator

**Files:**
- Create: `frontend/lib/transliterate.ts`
- Create: `frontend/lib/transliterate.spec.ts`

**Interfaces:**
- Consumes: nothing beyond Task 1.
- Produces: `transliterate(label: string): string` — consumed by `SettingsModal`'s "add category" form (Task 16) to generate the `key` sent to `POST /categories`. Output must satisfy the backend's `CreateCategoryDto` (`@Matches(/^[a-z0-9_-]+$/)`, `@MaxLength(40)`).

- [ ] **Step 1: Write the failing unit test — `frontend/lib/transliterate.spec.ts`**

```ts
import { transliterate } from './transliterate';

describe('transliterate', () => {
  it('converts Cyrillic letters to a lowercase Latin slug', () => {
    expect(transliterate('Чтение')).toBe('chtenie');
  });

  it('replaces spaces and punctuation with single hyphens', () => {
    expect(transliterate('Общение / свидания')).toBe('obschenie-svidaniya');
  });

  it('trims leading and trailing hyphens', () => {
    expect(transliterate('  Спорт!  ')).toBe('sport');
  });

  it('passes through already-Latin input, lowercased', () => {
    expect(transliterate('Reading')).toBe('reading');
  });

  it('truncates to 40 characters to satisfy the backend DTO limit', () => {
    const longLabel = 'а'.repeat(50);
    expect(transliterate(longLabel).length).toBeLessThanOrEqual(40);
  });

  it('falls back to a timestamp-based key when the label has no transliterable characters', () => {
    // CJK/emoji/pure punctuation collapse to nothing — an empty string would fail
    // the backend's @Matches(/^[a-z0-9_-]+$/), which requires at least one character.
    expect(transliterate('你好')).toMatch(/^category-[a-z0-9]+$/);
    expect(transliterate('!!!')).toMatch(/^category-[a-z0-9]+$/);
    expect(transliterate('')).toMatch(/^category-[a-z0-9]+$/);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest transliterate.spec.ts`
Expected: FAIL — `Cannot find module './transliterate'`.

- [ ] **Step 3: Create `frontend/lib/transliterate.ts`**

```ts
const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterate(label: string): string {
  const slug = label
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT_MAP[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '');
  // Slicing before the final trim (not after) also means a hyphen exposed exactly
  // at the 40-char cut boundary gets trimmed too, instead of leaving a trailing "-".
  return slug || `category-${Date.now().toString(36)}`;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest transliterate.spec.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/transliterate.ts frontend/lib/transliterate.spec.ts
git commit -m "feat(frontend): add label-to-key transliteration for new categories"
```

---

### Task 6: `lib/heatmap.ts` — heatmap color bucketing + week alignment

**Files:**
- Create: `frontend/lib/heatmap.ts`
- Create: `frontend/lib/heatmap.spec.ts`

**Interfaces:**
- Consumes: `parseUTC` from `@/lib/date` (Task 3).
- Produces: `categoryHeatmapColor(completed: number, total: number): string`, `youtubeHeatmapColor(minutes: number, budget: number): string`, `mondayOffset(dateStr: string): number` (0=Monday..6=Sunday) — consumed by `CategoryHeatmap` (Task 12) and `YoutubeDailyHeatmap` (Task 15).

- [ ] **Step 1: Write the failing unit test — `frontend/lib/heatmap.spec.ts`**

```ts
import { categoryHeatmapColor, mondayOffset, youtubeHeatmapColor } from './heatmap';

describe('categoryHeatmapColor', () => {
  it('returns the empty panel color for a day with no active categories', () => {
    expect(categoryHeatmapColor(0, 0)).toBe('var(--panel-alt)');
  });
  it('returns the empty panel color when nothing is done yet', () => {
    expect(categoryHeatmapColor(0, 5)).toBe('var(--panel-alt)');
  });
  it('returns solid accent at 100%', () => {
    expect(categoryHeatmapColor(5, 5)).toBe('var(--accent)');
  });
  it('returns a mid-opacity step at 60%', () => {
    expect(categoryHeatmapColor(3, 5)).toBe('rgba(224, 164, 88, 0.5)');
  });
});

describe('youtubeHeatmapColor', () => {
  it('returns the empty panel color when no minutes were logged', () => {
    expect(youtubeHeatmapColor(0, 60)).toBe('var(--panel-alt)');
  });
  it('returns the cool accent2 tone well under budget', () => {
    expect(youtubeHeatmapColor(10, 60)).toBe('var(--accent2-soft)');
  });
  it('returns solid accent between 70% and 100% of budget', () => {
    expect(youtubeHeatmapColor(45, 60)).toBe('var(--accent)');
  });
  it('returns a danger tone just over budget', () => {
    expect(youtubeHeatmapColor(70, 60)).toBe('rgba(217, 100, 90, 0.55)');
  });
  it('returns solid danger far over budget', () => {
    expect(youtubeHeatmapColor(100, 60)).toBe('var(--danger)');
  });
});

describe('mondayOffset', () => {
  it('returns 0 for a Monday', () => {
    expect(mondayOffset('2026-07-13')).toBe(0);
  });
  it('returns 2 for a Wednesday', () => {
    expect(mondayOffset('2026-07-15')).toBe(2);
  });
  it('returns 6 for a Sunday', () => {
    expect(mondayOffset('2026-07-19')).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest heatmap.spec.ts`
Expected: FAIL — `Cannot find module './heatmap'`.

- [ ] **Step 3: Create `frontend/lib/heatmap.ts`**

```ts
import { parseUTC } from './date';

export function categoryHeatmapColor(completed: number, total: number): string {
  if (total <= 0) return 'var(--panel-alt)';
  const ratio = completed / total;
  if (ratio >= 1) return 'var(--accent)';
  if (ratio >= 0.8) return 'rgba(224, 164, 88, 0.72)';
  if (ratio >= 0.6) return 'rgba(224, 164, 88, 0.5)';
  if (ratio >= 0.4) return 'rgba(224, 164, 88, 0.3)';
  if (ratio > 0) return 'var(--accent-soft)';
  return 'var(--panel-alt)';
}

export function youtubeHeatmapColor(minutes: number, budget: number): string {
  if (minutes <= 0) return 'var(--panel-alt)';
  const pct = budget > 0 ? (minutes / budget) * 100 : 0;
  if (pct > 150) return 'var(--danger)';
  if (pct > 100) return 'rgba(217, 100, 90, 0.55)';
  if (pct >= 70) return 'var(--accent)';
  if (pct >= 40) return 'rgba(79, 168, 201, 0.55)';
  return 'var(--accent2-soft)';
}

export function mondayOffset(dateStr: string): number {
  const day = parseUTC(dateStr).getUTCDay();
  return day === 0 ? 6 : day - 1;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest heatmap.spec.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/heatmap.ts frontend/lib/heatmap.spec.ts
git commit -m "feat(frontend): add heatmap color bucketing and Monday-alignment helper"
```

---

### Task 7: Dashboard data-fetching shell

**Files:**
- Create: `frontend/components/Dashboard.tsx`
- Create: `frontend/components/Dashboard.module.css`
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `getDay`/`getHistory`/`getSettings` from `@/lib/api` (Task 2), `todayUTC`/`formatDisplayDate` from `@/lib/date` (Task 3), `computeStreak` from `@/lib/streak` (Task 4).
- Produces: `Dashboard` — a `'use client'` component that owns `date` (fixed at mount via `todayUTC()`), `day: DayView | null`, `history: HistoryEntry[]`, `settings: Settings | null`, `loading`/`error` state. This is the growing shell every subsequent UI task (8–11, 16, 18) adds handlers and rendering to — always shown as the **full, current file content** in each task, not a diff.

- [ ] **Step 1: Create `frontend/components/Dashboard.module.css`**

```css
.wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 28px 20px 60px;
}

.sysline {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 18px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.loading {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 40px 0;
  text-align: center;
}
```

- [ ] **Step 2: Create `frontend/components/Dashboard.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import { getDay, getHistory, getSettings } from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <div>Дата: {formatDisplayDate(date)}</div>
      <div>Серия: {streak}</div>
      <div>
        Сфер выполнено: {day.categories.filter((c) => c.done).length} / {day.categories.length}
      </div>
      <div>Задач на сегодня: {day.dailies.length}</div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/app/page.tsx`**

```tsx
import Dashboard from '@/components/Dashboard';

export default function Home() {
  return <Dashboard />;
}
```

- [ ] **Step 4: Verify against the live backend**

Requires the backend running (`docker compose up -d postgres backend` from the repo root, or `bun run start:dev` in `backend/` per its own README).

`Dashboard` fetches everything client-side inside `useEffect`, which never runs during server-side rendering — `curl` can only ever see the pre-hydration loading shell, not the loaded content. Verify structurally (build + curl for the loading shell), then confirm the real behavior in an actual browser.

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка` (the pre-hydration loading state — this is genuinely all curl can see here, not a bug). Then open `http://localhost:4887` in an actual browser and confirm: after the "загрузка…" flash, the page shows today's date (in Russian), a streak number, sphere/task/YouTube counts matching the seeded backend data.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/Dashboard.tsx frontend/components/Dashboard.module.css frontend/app/page.tsx
git commit -m "feat(frontend): add Dashboard data-fetching shell for today's day"
```

---

### Task 8: Header component

**Files:**
- Create: `frontend/components/Header.tsx`
- Create: `frontend/components/Header.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `streak`/`formatDisplayDate` already computed in `Dashboard` (Task 7).
- Produces: `Header` rendering date/streak/gear button/notifications button. Adds `settingsOpen` state to `Dashboard` (consumed by `SettingsModal` in Task 16) and a `notificationsEnabled`/`onEnableNotifications` stub (real logic wired in Task 18) — both forward-declared here since the Header is where these controls visually live, even though their backing behavior lands in later tasks.

- [ ] **Step 1: Create `frontend/components/Header.module.css`**

```css
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 18px;
  margin-bottom: 22px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.date {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
  text-transform: capitalize;
}

.actions {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.iconBtn {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11.5px;
  cursor: pointer;
}

.iconBtn:hover {
  border-color: var(--accent2);
  color: var(--accent2);
}

.streakbox {
  text-align: right;
}

.streakNum {
  font-family: var(--font-mono);
  font-size: 38px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}

.streakLbl {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-top: 4px;
}

.gearBtn {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  width: 34px;
  height: 34px;
  font-size: 16px;
  cursor: pointer;
}

.gearBtn:hover {
  border-color: var(--accent2);
  color: var(--accent2);
}
```

- [ ] **Step 2: Create `frontend/components/Header.tsx`**

```tsx
import styles from './Header.module.css';

interface HeaderProps {
  dateLabel: string;
  streak: number;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  dateLabel,
  streak,
  notificationsEnabled,
  onEnableNotifications,
  onOpenSettings,
}: HeaderProps) {
  return (
    <div className={styles.topbar}>
      <div>
        <h1 className={styles.title}>Панель дня</h1>
        <div className={styles.date}>{dateLabel}</div>
      </div>
      <div className={styles.actions}>
        {!notificationsEnabled && (
          <button type="button" className={styles.iconBtn} onClick={onEnableNotifications}>
            Включить уведомления
          </button>
        )}
        <div className={styles.streakbox}>
          <div className={styles.streakNum}>{streak}</div>
          <div className={styles.streakLbl}>дней подряд, все сферы</div>
        </div>
        <button type="button" className={styles.gearBtn} onClick={onOpenSettings} aria-label="Настройки">
          ⚙
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/Dashboard.tsx`** (full new content)

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import { getDay, getHistory, getSettings } from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  function enableNotifications() {
    // Real Notification.requestPermission() + Settings persistence lands in Task 18.
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div>
        Сфер выполнено: {day.categories.filter((c) => c.done).length} / {day.categories.length}
      </div>
      <div>Задач на сегодня: {day.dailies.length}</div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
      {settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

`curl` still only sees the pre-hydration loading shell (see Task 7's note) — verify structurally, then confirm the rest visually.

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser, the header should show the title, capitalized Russian date, streak number+label on the right, and a gear button; clicking the gear shows the "Настройки скоро…" placeholder line.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/Header.tsx frontend/components/Header.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add Header (date, streak, settings/notifications buttons)"
```

---

### Task 9: SpheresPanel component

**Files:**
- Create: `frontend/components/SpheresPanel.tsx`
- Create: `frontend/components/SpheresPanel.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `setCategoryDone`/`setEveningClosed` from `@/lib/api` (Task 2).
- Produces: `SpheresPanel` (category toggles + "день закрыт" button, per spec placed "рядом со сферами"). Adds `toggleCategory(key)` and `toggleEveningClosed()` handlers to `Dashboard`.

- [ ] **Step 1: Create `frontend/components/SpheresPanel.module.css`**

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

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}

.row:last-child {
  border-bottom: none;
}

.label {
  font-size: 14px;
}

.switch {
  width: 42px;
  height: 24px;
  border-radius: 12px;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background 0.18s, box-shadow 0.18s;
}

.switch.on {
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px var(--accent-glow) inset;
  border-color: var(--accent-glow);
}

.thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: transform 0.18s, background 0.18s;
  display: block;
}

.switch.on .thumb {
  transform: translateX(18px);
  background: var(--accent);
}

.closeBtn {
  margin-top: 14px;
  width: 100%;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12.5px;
  cursor: pointer;
}

.closeBtn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 2: Create `frontend/components/SpheresPanel.tsx`**

```tsx
import styles from './SpheresPanel.module.css';
import type { CategoryView } from '@/types/api';

interface SpheresPanelProps {
  categories: CategoryView[];
  eveningClosed: boolean;
  onToggle: (key: string) => void;
  onToggleEveningClosed: () => void;
}

export default function SpheresPanel({
  categories,
  eveningClosed,
  onToggle,
  onToggleEveningClosed,
}: SpheresPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Сферы дня</h2>
      <div>
        {categories.map((c) => (
          <div key={c.key} className={styles.row}>
            <span className={styles.label}>{c.label}</span>
            <button
              type="button"
              className={`${styles.switch} ${c.done ? styles.on : ''}`}
              onClick={() => onToggle(c.key)}
              aria-pressed={c.done}
              aria-label={c.label}
            >
              <span className={styles.thumb} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={styles.closeBtn} onClick={onToggleEveningClosed}>
        {eveningClosed ? 'День закрыт ✓ (отменить)' : 'Отметить день закрытым'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/Dashboard.tsx`** (full new content)

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import { getDay, getHistory, getSettings, setCategoryDone, setEveningClosed } from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  function enableNotifications() {
    // Real Notification.requestPermission() + Settings persistence lands in Task 18.
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    setDay(await setCategoryDone(date, key, !current.done));
    refreshHistory();
  }

  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await setEveningClosed(date, !day.eveningClosed));
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={styles.grid}>
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
        />
      </div>
      <div>Задач на сегодня: {day.dailies.length}</div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
      {settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка` (see Task 7's note on why curl can't see past the loading shell). Then in an actual browser: toggling a sphere switch should visibly flip (amber glow, thumb slides right) and persist across a page reload (confirms the `PATCH` round-trip); clicking "Отметить день закрытым" should toggle its own label.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/SpheresPanel.tsx frontend/components/SpheresPanel.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add SpheresPanel (category toggles + evening-closed button)"
```

---

### Task 10: DailiesPanel component

**Files:**
- Create: `frontend/components/DailiesPanel.tsx`
- Create: `frontend/components/DailiesPanel.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `addDaily`/`updateDaily`/`deleteDaily`/`getTaskTemplates` from `@/lib/api` (Task 2).
- Produces: `DailiesPanel` (task list + add form + "из шаблонов" dropdown that lazily fetches `task-templates` on first open). Adds `addDailyTask(text)`, `toggleDaily(id)`, `deleteDailyTask(id)` handlers to `Dashboard`.

- [ ] **Step 1: Create `frontend/components/DailiesPanel.module.css`**

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

.addRow {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  position: relative;
}

.input {
  flex: 1;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 8px 10px;
  font-size: 13px;
}

.input:focus {
  outline: none;
  border-color: var(--accent2);
}

.addBtn {
  background: var(--accent2-soft);
  border: 1px solid var(--accent2);
  color: var(--accent2);
  border-radius: 6px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;
}

.addBtn:hover {
  background: rgba(79, 168, 201, 0.24);
}

.templatesWrap {
  position: relative;
}

.templatesBtn {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 0 10px;
  font-size: 11.5px;
  cursor: pointer;
  height: 100%;
  white-space: nowrap;
}

.templatesBtn:hover {
  border-color: var(--accent2);
  color: var(--accent2);
}

.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  z-index: 10;
  padding: 4px;
}

.dropdownItem {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font-size: 12.5px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.dropdownItem:hover {
  background: var(--panel-alt);
}

.dropdownEmpty {
  color: var(--text-dim);
  font-size: 12px;
  padding: 6px 8px;
  font-style: italic;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}

.item:last-child {
  border-bottom: none;
}

.check {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1px solid var(--text-dim);
  background: none;
  flex-shrink: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--bg);
  padding: 0;
}

.checkDone {
  background: var(--accent);
  border-color: var(--accent);
}

.text {
  flex: 1;
  font-size: 13.5px;
  cursor: pointer;
}

.textDone {
  color: var(--text-dim);
  text-decoration: line-through;
}

.del {
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  visibility: hidden;
}

.item:hover .del {
  visibility: visible;
}

.empty {
  color: var(--text-dim);
  font-size: 12.5px;
  font-style: italic;
}
```

- [ ] **Step 2: Create `frontend/components/DailiesPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import styles from './DailiesPanel.module.css';
import type { DailyTaskView, TaskTemplate } from '@/types/api';
import { getTaskTemplates } from '@/lib/api';

interface DailiesPanelProps {
  dailies: DailyTaskView[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function DailiesPanel({ dailies, onAdd, onToggle, onDelete }: DailiesPanelProps) {
  const [text, setText] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  }

  async function openTemplates() {
    if (templatesOpen) {
      setTemplatesOpen(false);
      return;
    }
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      setTemplates(await getTaskTemplates());
    } finally {
      setTemplatesLoading(false);
    }
  }

  function pickTemplate(t: TaskTemplate) {
    onAdd(t.text);
    setTemplatesOpen(false);
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Задачи на сегодня</h2>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Добавить задачу…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button type="button" className={styles.addBtn} onClick={submit}>
          +
        </button>
        <div className={styles.templatesWrap}>
          <button type="button" className={styles.templatesBtn} onClick={openTemplates}>
            из шаблонов
          </button>
          {templatesOpen && (
            <div className={styles.dropdown}>
              {templatesLoading && <div className={styles.dropdownEmpty}>загрузка…</div>}
              {!templatesLoading && templates.length === 0 && (
                <div className={styles.dropdownEmpty}>Шаблонов пока нет</div>
              )}
              {!templatesLoading &&
                templates.map((t) => (
                  <button key={t.id} type="button" className={styles.dropdownItem} onClick={() => pickTemplate(t)}>
                    {t.text}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <ul className={styles.list}>
        {dailies.length === 0 && <li className={styles.empty}>Пока пусто — добавь пару задач на день.</li>}
        {dailies.map((d) => (
          <li key={d.id} className={styles.item}>
            <button
              type="button"
              className={`${styles.check} ${d.done ? styles.checkDone : ''}`}
              onClick={() => onToggle(d.id)}
              aria-label={d.text}
            >
              {d.done ? '✓' : ''}
            </button>
            <span className={`${styles.text} ${d.done ? styles.textDone : ''}`} onClick={() => onToggle(d.id)}>
              {d.text}
            </span>
            <span className={styles.del} onClick={() => onDelete(d.id)}>
              ×
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/Dashboard.tsx`** (full new content)

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import {
  addDaily as apiAddDaily,
  deleteDaily as apiDeleteDaily,
  getDay,
  getHistory,
  getSettings,
  setCategoryDone,
  setEveningClosed,
  updateDaily as apiUpdateDaily,
} from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  function enableNotifications() {
    // Real Notification.requestPermission() + Settings persistence lands in Task 18.
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    setDay(await setCategoryDone(date, key, !current.done));
    refreshHistory();
  }

  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await setEveningClosed(date, !day.eveningClosed));
  }

  async function addDailyTask(text: string) {
    await apiAddDaily(date, text);
    await refreshDay();
  }

  async function toggleDaily(id: number) {
    if (!day) return;
    const current = day.dailies.find((t) => t.id === id);
    if (!current) return;
    await apiUpdateDaily(id, { done: !current.done });
    await refreshDay();
  }

  async function deleteDailyTask(id: number) {
    await apiDeleteDaily(id);
    await refreshDay();
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={styles.grid}>
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
        />
        <DailiesPanel
          dailies={day.dailies}
          onAdd={addDailyTask}
          onToggle={toggleDaily}
          onDelete={deleteDailyTask}
        />
      </div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
      {settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: type a task and press Enter (or click +) — it appears in the list; click its checkbox to strike it through; click the × (visible on hover) to delete it; click "из шаблонов" — should show "Шаблонов пока нет" (none created yet) without erroring.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/DailiesPanel.tsx frontend/components/DailiesPanel.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add DailiesPanel (add/toggle/delete + templates dropdown)"
```

---

### Task 11: YoutubePanel component

**Files:**
- Create: `frontend/components/YoutubePanel.tsx`
- Create: `frontend/components/YoutubePanel.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `updateYoutube` from `@/lib/api` (Task 2), `updateSettings` from `@/lib/api` for the inline budget edit.
- Produces: `YoutubePanel` (minutes/budget, progress bar, +10/+25/+50, reset, Qbserve/Screen Time note). Adds `addYoutubeMinutes(delta)`, `resetYoutube()`, `changeYoutubeBudget(value)` handlers to `Dashboard`. This completes the core "today" screen (spec sections 1–4).

- [ ] **Step 1: Create `frontend/components/YoutubePanel.module.css`**

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

.of,
.unit {
  color: var(--text-dim);
  font-weight: 400;
  font-size: 15px;
}

.budgetInput {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-muted);
  background: none;
  border: none;
  border-bottom: 1px dashed var(--text-dim);
  width: 42px;
  text-align: right;
  padding: 0;
}

.budgetInput:focus {
  outline: none;
  border-color: var(--accent2);
}

.reset {
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bar {
  height: 8px;
  background: var(--panel-alt);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--border);
}

.barFill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.25s, background 0.25s;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.buttons button {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  font-family: var(--font-mono);
  cursor: pointer;
}

.buttons button:hover {
  border-color: var(--accent2);
  color: var(--accent2);
}

.note {
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.5;
}
```

- [ ] **Step 2: Create `frontend/components/YoutubePanel.tsx`**

```tsx
import styles from './YoutubePanel.module.css';

interface YoutubePanelProps {
  minutes: number;
  budget: number;
  onAdd: (delta: number) => void;
  onReset: () => void;
  onBudgetChange: (value: number) => void;
}

export default function YoutubePanel({ minutes, budget, onAdd, onReset, onBudgetChange }: YoutubePanelProps) {
  const pct = budget > 0 ? Math.min(100, (minutes / budget) * 100) : 0;
  let barColor = 'var(--accent2)';
  if (minutes > budget) barColor = 'var(--danger)';
  else if (pct > 70) barColor = 'var(--accent)';

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>YouTube</h2>
      <div className={styles.top}>
        <div className={styles.count}>
          {minutes}
          <span className={styles.of}> / </span>
          <input
            className={styles.budgetInput}
            type="number"
            min={0}
            value={budget}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onBudgetChange(Number.isNaN(v) ? 0 : Math.max(0, v));
            }}
          />
          <span className={styles.unit}> мин</span>
        </div>
        <span className={styles.reset} onClick={onReset}>
          сбросить
        </span>
      </div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className={styles.buttons}>
        <button type="button" onClick={() => onAdd(10)}>
          +10
        </button>
        <button type="button" onClick={() => onAdd(25)}>
          +25
        </button>
        <button type="button" onClick={() => onAdd(50)}>
          +50
        </button>
      </div>
      <div className={styles.note}>
        Здесь только то, что ты сам занёс вручную. Точные логи — в Qbserve (автотрекер активности на Mac) и в Screen
        Time (Настройки → Экранное время).
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/Dashboard.tsx`** (full new content)

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import {
  addDaily as apiAddDaily,
  deleteDaily as apiDeleteDaily,
  getDay,
  getHistory,
  getSettings,
  setCategoryDone,
  setEveningClosed,
  updateDaily as apiUpdateDaily,
  updateSettings,
  updateYoutube,
} from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';
import YoutubePanel from './YoutubePanel';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  function enableNotifications() {
    // Real Notification.requestPermission() + Settings persistence lands in Task 18.
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    setDay(await setCategoryDone(date, key, !current.done));
    refreshHistory();
  }

  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await setEveningClosed(date, !day.eveningClosed));
  }

  async function addDailyTask(text: string) {
    await apiAddDaily(date, text);
    await refreshDay();
  }

  async function toggleDaily(id: number) {
    if (!day) return;
    const current = day.dailies.find((t) => t.id === id);
    if (!current) return;
    await apiUpdateDaily(id, { done: !current.done });
    await refreshDay();
  }

  async function deleteDailyTask(id: number) {
    await apiDeleteDaily(id);
    await refreshDay();
  }

  async function addYoutubeMinutes(delta: number) {
    setDay(await updateYoutube(date, { delta }));
    refreshHistory();
  }

  async function resetYoutube() {
    setDay(await updateYoutube(date, { reset: true }));
    refreshHistory();
  }

  async function changeYoutubeBudget(value: number) {
    setSettings(await updateSettings({ youtubeBudget: value }));
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={styles.grid}>
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
        />
        <DailiesPanel dailies={day.dailies} onAdd={addDailyTask} onToggle={toggleDaily} onDelete={deleteDailyTask} />
        <YoutubePanel
          minutes={day.youtubeMinutes}
          budget={settings.youtubeBudget}
          onAdd={addYoutubeMinutes}
          onReset={resetYoutube}
          onBudgetChange={changeYoutubeBudget}
        />
      </div>
      {settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: the Qbserve/Screen Time micro-label should be visible under the YouTube buttons; clicking +10/+25/+50 should visibly grow the bar and update the count; the bar should turn amber past 70% of budget and red once over; editing the budget number should persist (survives reload); "сбросить" zeroes the count.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/YoutubePanel.tsx frontend/components/YoutubePanel.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add YoutubePanel (minutes/budget, progress bar, Qbserve note)"
```

---

### Task 12: StatsPanel + CategoryHeatmap (12-week grid)

**Files:**
- Create: `frontend/components/StatsPanel.tsx`
- Create: `frontend/components/StatsPanel.module.css`
- Create: `frontend/components/CategoryHeatmap.tsx`
- Create: `frontend/components/CategoryHeatmap.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `HistoryEntry[]` (the same 84-day array `Dashboard` already fetched in Task 7 — **no new API call**), `categoryHeatmapColor`/`mondayOffset` from `@/lib/heatmap` (Task 6).
- Produces: `StatsPanel` (the growing wrapper Tasks 13–15 extend) rendering `CategoryHeatmap` — a GitHub-contributions-style week×weekday grid, front-padded with blank cells (via `mondayOffset`) so every row consistently represents the same weekday across all 12 columns.

- [ ] **Step 1: Create `frontend/components/CategoryHeatmap.module.css`**

```css
.grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 13px);
  gap: 3px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.cell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  border: 1px solid var(--border);
  position: relative;
}

.blank {
  width: 13px;
  height: 13px;
}

.ytOver {
  position: absolute;
  bottom: 1px;
  left: 1px;
  right: 1px;
  height: 2px;
  border-radius: 1px;
  background: var(--danger);
}

.legend {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 6px;
}
```

- [ ] **Step 2: Create `frontend/components/CategoryHeatmap.tsx`**

```tsx
import styles from './CategoryHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { categoryHeatmapColor, mondayOffset } from '@/lib/heatmap';

interface CategoryHeatmapProps {
  history: HistoryEntry[];
}

export default function CategoryHeatmap({ history }: CategoryHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];

  return (
    <div>
      <div className={styles.grid}>
        {cells.map((entry, i) =>
          entry ? (
            <div
              key={entry.date}
              className={styles.cell}
              style={{ background: categoryHeatmapColor(entry.completed, entry.total) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${
                entry.ytOver ? ', YouTube — перебор' : ''
              }`}
            >
              {entry.ytOver && <span className={styles.ytOver} />}
            </div>
          ) : (
            <div key={`blank-${i}`} className={styles.blank} />
          ),
        )}
      </div>
      <div className={styles.legend}>закрашено = доля закрытых сфер · красная черта = перебор по YouTube</div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/components/StatsPanel.module.css`**

```css
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 18px 20px;
  margin-top: 16px;
}

.heading {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 14px;
  font-weight: 600;
}
```

- [ ] **Step 4: Create `frontend/components/StatsPanel.tsx`**

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';

interface StatsPanelProps {
  history: HistoryEntry[];
}

export default function StatsPanel({ history }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} />
    </div>
  );
}
```

- [ ] **Step 5: Modify `frontend/components/Dashboard.tsx`**

Add the import `import StatsPanel from './StatsPanel';` alongside the other component imports, and render `<StatsPanel history={history} />` immediately after the closing `</div>` of `styles.grid` (i.e., as a sibling below the Spheres/Dailies/YouTube grid, still above the `{settingsOpen && ...}` placeholder line). Every other line of the file is unchanged from Task 11.

- [ ] **Step 6: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: a grid of small squares should appear below the main panels, mostly empty/dim (fresh seed data), with hover tooltips showing `YYYY-MM-DD: completed/total сфер`.
Stop the dev server before continuing.

- [ ] **Step 7: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/StatsPanel.tsx frontend/components/StatsPanel.module.css frontend/components/CategoryHeatmap.tsx frontend/components/CategoryHeatmap.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add StatsPanel with 12-week category heatmap"
```

---

### Task 13: CategoryBars (30-day breakdown)

**Files:**
- Create: `frontend/components/CategoryBars.tsx`
- Create: `frontend/components/CategoryBars.module.css`
- Modify: `frontend/components/StatsPanel.tsx`

**Interfaces:**
- Consumes: `getCategoryStats` from `@/lib/api` (Task 2).
- Produces: `CategoryBars` — fetches `/stats/categories?days=30` independently on mount (not blocking the main dashboard), renders one horizontal bar per non-archived category.

- [ ] **Step 1: Create `frontend/components/CategoryBars.module.css`**

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

.row {
  display: grid;
  grid-template-columns: 120px 1fr 40px;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.label {
  font-size: 13px;
  color: var(--text);
}

.barTrack {
  height: 8px;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.barFill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}

.pct {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}
```

- [ ] **Step 2: Create `frontend/components/CategoryBars.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './CategoryBars.module.css';
import type { CategoryStat } from '@/types/api';
import { getCategoryStats } from '@/lib/api';

const DAYS = 30;

export default function CategoryBars() {
  const [stats, setStats] = useState<CategoryStat[] | null>(null);

  useEffect(() => {
    getCategoryStats(DAYS).then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Разбивка по категориям · {DAYS} дней</div>
      {stats.map((s) => (
        <div key={s.key} className={styles.row}>
          <span className={styles.label}>{s.label}</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${s.pct}%` }} />
          </div>
          <span className={styles.pct}>{s.pct}%</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/StatsPanel.tsx`** (full new content)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import CategoryBars from './CategoryBars';

interface StatsPanelProps {
  history: HistoryEntry[];
}

export default function StatsPanel({ history }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} />
      <CategoryBars />
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: 5 rows appear (one per seeded category) with a percentage bar each.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/CategoryBars.tsx frontend/components/CategoryBars.module.css frontend/components/StatsPanel.tsx
git commit -m "feat(frontend): add CategoryBars (30-day per-category breakdown)"
```

---

### Task 14: YoutubeWeeklyChart (recharts)

**Files:**
- Create: `frontend/components/YoutubeWeeklyChart.tsx`
- Create: `frontend/components/YoutubeWeeklyChart.module.css`
- Modify: `frontend/components/StatsPanel.tsx`

**Interfaces:**
- Consumes: `getYoutubeWeeklyStats` from `@/lib/api` (Task 2), `recharts` (Task 1 dependency — this is the **only** place it's used, per Global Constraints).
- Produces: `YoutubeWeeklyChart` — bar chart, one column per week, height = avg minutes/day, dashed reference line at the current budget.

- [ ] **Step 1: Create `frontend/components/YoutubeWeeklyChart.module.css`**

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
```

- [ ] **Step 2: Create `frontend/components/YoutubeWeeklyChart.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import styles from './YoutubeWeeklyChart.module.css';
import type { YoutubeWeekStat } from '@/types/api';
import { getYoutubeWeeklyStats } from '@/lib/api';

const WEEKS = 8;

export default function YoutubeWeeklyChart() {
  const [stats, setStats] = useState<YoutubeWeekStat[] | null>(null);

  useEffect(() => {
    getYoutubeWeeklyStats(WEEKS).then(setStats);
  }, []);

  if (!stats || stats.length === 0) return null;
  const budget = stats[0].budget;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>YouTube по неделям</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={stats} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={budget} stroke="var(--danger)" strokeDasharray="4 4" />
          <Bar dataKey="avgMinutes" fill="var(--accent2)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/StatsPanel.tsx`** (full new content)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';

interface StatsPanelProps {
  history: HistoryEntry[];
}

export default function StatsPanel({ history }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} />
      <CategoryBars />
      <YoutubeWeeklyChart />
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: a bar chart with up to 8 columns and a dashed reference line at the budget height should render below the category bars.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/YoutubeWeeklyChart.tsx frontend/components/YoutubeWeeklyChart.module.css frontend/components/StatsPanel.tsx
git commit -m "feat(frontend): add YoutubeWeeklyChart (recharts bar chart with budget line)"
```

---

### Task 15: YoutubeDailyHeatmap (30-day heatmap + average progress bar)

**Files:**
- Create: `frontend/components/YoutubeDailyHeatmap.tsx`
- Create: `frontend/components/YoutubeDailyHeatmap.module.css`
- Modify: `frontend/components/StatsPanel.tsx`

**Interfaces:**
- Consumes: `getYoutubeDailyStats` from `@/lib/api` (Task 2), `youtubeHeatmapColor` from `@/lib/heatmap` (Task 6).
- Produces: `YoutubeDailyHeatmap` — 30-cell grid (no Monday-alignment required per spec, unlike the 12-week category heatmap) plus a progress bar showing average minutes/day vs. budget over the same 30 days. This completes the full "Статистика" panel (all 4 visualizations from the spec).

- [ ] **Step 1: Create `frontend/components/YoutubeDailyHeatmap.module.css`**

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

.bar {
  height: 8px;
  background: var(--panel-alt);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
  border: 1px solid var(--border);
}

.barFill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.25s, background 0.25s;
}

.avgLabel {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.cell {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  border: 1px solid var(--border);
}
```

- [ ] **Step 2: Create `frontend/components/YoutubeDailyHeatmap.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './YoutubeDailyHeatmap.module.css';
import type { YoutubeDayStat } from '@/types/api';
import { getYoutubeDailyStats } from '@/lib/api';
import { youtubeHeatmapColor } from '@/lib/heatmap';

const DAYS = 30;

export default function YoutubeDailyHeatmap() {
  const [stats, setStats] = useState<YoutubeDayStat[] | null>(null);

  useEffect(() => {
    getYoutubeDailyStats(DAYS).then(setStats);
  }, []);

  if (!stats || stats.length === 0) return null;

  const budget = stats[0].budget;
  const avg = stats.reduce((sum, s) => sum + s.minutes, 0) / stats.length;
  const barPct = budget > 0 ? Math.min(100, (avg / budget) * 100) : 0;
  let barColor = 'var(--accent2)';
  if (avg > budget) barColor = 'var(--danger)';
  else if (barPct > 70) barColor = 'var(--accent)';

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>YouTube-хитмеп · {DAYS} дней</div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${barPct}%`, background: barColor }} />
      </div>
      <div className={styles.avgLabel}>
        {Math.round(avg * 10) / 10} / {budget} мин/день · {DAYS} дней
      </div>
      <div className={styles.grid}>
        {stats.map((s) => (
          <div
            key={s.date}
            className={styles.cell}
            style={{ background: youtubeHeatmapColor(s.minutes, s.budget) }}
            title={`${s.date}: ${s.minutes} мин (${s.pct}% от бюджета)`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/StatsPanel.tsx`** (full new content)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';
import YoutubeDailyHeatmap from './YoutubeDailyHeatmap';

interface StatsPanelProps {
  history: HistoryEntry[];
}

export default function StatsPanel({ history }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} />
      <CategoryBars />
      <YoutubeWeeklyChart />
      <YoutubeDailyHeatmap />
    </div>
  );
}
```

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: a progress bar + label (`X / Y мин/день · 30 дней`) followed by a 30-cell grid should render at the bottom of the Statistics panel.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/YoutubeDailyHeatmap.tsx frontend/components/YoutubeDailyHeatmap.module.css frontend/components/StatsPanel.tsx
git commit -m "feat(frontend): add YoutubeDailyHeatmap (30-day heatmap + avg-vs-budget bar)"
```

---

### Task 16: SettingsModal shell + CategoriesTab

**Files:**
- Create: `frontend/components/SettingsModal.tsx`
- Create: `frontend/components/SettingsModal.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `getCategories`/`createCategory`/`updateCategory` from `@/lib/api` (Task 2), `transliterate` from `@/lib/transliterate` (Task 5).
- Produces: `SettingsModal` — overlay + centered panel, closes on outside-click/×/Escape, two tabs (Categories fully implemented here; Templates gets a placeholder body until Task 17). `onClose: () => void` and `onCategoriesChanged: () => void` props — the latter is called after every category mutation so `Dashboard` can refetch `/days/:date` and pick up renamed/archived labels in `SpheresPanel`.

- [ ] **Step 1: Create `frontend/components/SettingsModal.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 18px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tab {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
}

.tabActive {
  border-color: var(--accent2);
  color: var(--accent2);
  background: var(--accent2-soft);
}

.closeBtn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.closeBtn:hover {
  color: var(--text);
}

.tabBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.catRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.catInput {
  flex: 1;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}

.catInput:focus {
  outline: none;
  border-color: var(--accent2);
}

.catActions {
  display: flex;
  gap: 4px;
}

.catActions button {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

.catActions button:hover:not(:disabled) {
  border-color: var(--accent2);
  color: var(--accent2);
}

.catActions button:disabled {
  opacity: 0.3;
  cursor: default;
}

.addRow {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.addRow input {
  flex: 1;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}

.addRow input:focus {
  outline: none;
  border-color: var(--accent2);
}

.addRow button {
  background: var(--accent2-soft);
  border: 1px solid var(--accent2);
  color: var(--accent2);
  border-radius: 6px;
  padding: 0 12px;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
```

- [ ] **Step 2: Create `frontend/components/SettingsModal.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './SettingsModal.module.css';
import type { Category } from '@/types/api';
import { createCategory, getCategories, updateCategory } from '@/lib/api';
import { transliterate } from '@/lib/transliterate';

type Tab = 'categories' | 'templates';

interface SettingsModalProps {
  onClose: () => void;
  onCategoriesChanged: () => void;
}

export default function SettingsModal({ onClose, onCategoriesChanged }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function refreshCategories() {
    setCategories(await getCategories());
    onCategoriesChanged();
  }

  async function renameCategory(key: string, label: string) {
    await updateCategory(key, { label });
    await refreshCategories();
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const target = categories[index + direction];
    const current = categories[index];
    if (!target || !current) return;
    await Promise.all([
      updateCategory(current.key, { order: target.order }),
      updateCategory(target.key, { order: current.order }),
    ]);
    await refreshCategories();
  }

  async function archiveCategory(key: string) {
    await updateCategory(key, { archived: true });
    await refreshCategories();
  }

  async function addCategory() {
    const label = newLabel.trim();
    if (!label) return;
    const key = transliterate(label);
    if (!key) return;
    await createCategory(key, label);
    setNewLabel('');
    await refreshCategories();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'categories' ? styles.tabActive : ''}`}
              onClick={() => setTab('categories')}
            >
              Категории
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'templates' ? styles.tabActive : ''}`}
              onClick={() => setTab('templates')}
            >
              Шаблоны задач
            </button>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {tab === 'categories' && (
          <div className={styles.tabBody}>
            {categories.map((c, i) => (
              <div key={c.key} className={styles.catRow}>
                <input
                  className={styles.catInput}
                  value={c.label}
                  onChange={(e) =>
                    setCategories((prev) => prev.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))
                  }
                  onBlur={(e) => renameCategory(c.key, e.target.value)}
                />
                <div className={styles.catActions}>
                  <button type="button" onClick={() => moveCategory(i, -1)} disabled={i === 0} aria-label="Вверх">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(i, 1)}
                    disabled={i === categories.length - 1}
                    aria-label="Вниз"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => archiveCategory(c.key)}>
                    архивировать
                  </button>
                </div>
              </div>
            ))}
            <div className={styles.addRow}>
              <input
                placeholder="Новая категория…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCategory();
                }}
              />
              <button type="button" onClick={addCategory}>
                добавить
              </button>
            </div>
          </div>
        )}

        {tab === 'templates' && <div className={styles.tabBody}>Шаблоны скоро — вкладка появится в Task 17.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/Dashboard.tsx`**

Add the import `import SettingsModal from './SettingsModal';`, and replace the line:

```tsx
{settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
```

with:

```tsx
{settingsOpen && (
  <SettingsModal onClose={() => setSettingsOpen(false)} onCategoriesChanged={refreshDay} />
)}
```

Every other line of the file is unchanged from Task 12 (the last task to modify `Dashboard.tsx` — Tasks 13–15 only touched `StatsPanel.tsx`).

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка` (the modal itself only renders once opened via client state, so it — like the rest of the loaded page — never appears in curl's pre-hydration view; that's expected, not a bug). Then in an actual browser: click the gear icon — the overlay + panel should appear with 5 categories listed; rename one (blur to save, refresh page to confirm persistence); reorder with ↑/↓; archive one and confirm it disappears from both the modal list and the main screen's Spheres panel (via `onCategoriesChanged` → `refreshDay`); add a new category and confirm its `key` is a sane transliteration; close via ×, outside-click, and Escape — all three should work.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/SettingsModal.tsx frontend/components/SettingsModal.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add SettingsModal shell with Categories tab (rename/reorder/archive/add)"
```

---

### Task 17: TaskTemplatesTab

**Files:**
- Create: `frontend/components/TaskTemplatesTab.tsx`
- Create: `frontend/components/TaskTemplatesTab.module.css`
- Modify: `frontend/components/SettingsModal.tsx`

**Interfaces:**
- Consumes: `getTaskTemplates`/`createTaskTemplate`/`deleteTaskTemplate` from `@/lib/api` (Task 2).
- Produces: `TaskTemplatesTab` — list + delete + add form, no reordering (spec only requires "текст + удалить" for this tab, unlike Categories). Completes the Settings modal (both tabs from the spec).

- [ ] **Step 1: Create `frontend/components/TaskTemplatesTab.module.css`**

```css
.tabBody {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.text {
  font-size: 13px;
}

.del {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.del:hover {
  color: var(--danger);
}

.empty {
  color: var(--text-dim);
  font-size: 12.5px;
  font-style: italic;
  padding: 6px 0;
}

.addRow {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.addRow input {
  flex: 1;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
}

.addRow input:focus {
  outline: none;
  border-color: var(--accent2);
}

.addRow button {
  background: var(--accent2-soft);
  border: 1px solid var(--accent2);
  color: var(--accent2);
  border-radius: 6px;
  padding: 0 12px;
  font-size: 12.5px;
  cursor: pointer;
}
```

- [ ] **Step 2: Create `frontend/components/TaskTemplatesTab.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './TaskTemplatesTab.module.css';
import type { TaskTemplate } from '@/types/api';
import { createTaskTemplate, deleteTaskTemplate, getTaskTemplates } from '@/lib/api';

export default function TaskTemplatesTab() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    getTaskTemplates().then(setTemplates);
  }, []);

  async function refresh() {
    setTemplates(await getTaskTemplates());
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    await createTaskTemplate(trimmed);
    setText('');
    await refresh();
  }

  async function remove(id: number) {
    await deleteTaskTemplate(id);
    await refresh();
  }

  return (
    <div className={styles.tabBody}>
      {templates.map((t) => (
        <div key={t.id} className={styles.row}>
          <span className={styles.text}>{t.text}</span>
          <button type="button" className={styles.del} onClick={() => remove(t.id)}>
            удалить
          </button>
        </div>
      ))}
      {templates.length === 0 && <div className={styles.empty}>Шаблонов пока нет</div>}
      <div className={styles.addRow}>
        <input
          placeholder="Новый шаблон…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button type="button" onClick={add}>
          добавить
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modify `frontend/components/SettingsModal.tsx`**

Add the import `import TaskTemplatesTab from './TaskTemplatesTab';`, and replace:

```tsx
{tab === 'templates' && <div className={styles.tabBody}>Шаблоны скоро — вкладка появится в Task 17.</div>}
```

with:

```tsx
{tab === 'templates' && <TaskTemplatesTab />}
```

Every other line is unchanged from Task 16.

- [ ] **Step 4: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: open settings → "Шаблоны задач" tab → add a template, confirm it appears in DailiesPanel's "из шаблонов" dropdown (Task 10) on the main screen and that clicking it adds the text to today's dailies; delete the template and confirm it disappears from the dropdown too.
Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/TaskTemplatesTab.tsx frontend/components/TaskTemplatesTab.module.css frontend/components/SettingsModal.tsx
git commit -m "feat(frontend): add TaskTemplatesTab (list/add/delete reusable tasks)"
```

---

### Task 18: Notifications (Web Notification API)

**Files:**
- Create: `frontend/lib/notifications.ts`
- Create: `frontend/lib/notifications.spec.ts`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `updateSettings` from `@/lib/api` (Task 2), `day`/`settings` state already in `Dashboard`.
- Produces: `isMorningWindow(now: Date): boolean`, `isEveningWindow(now: Date): boolean` (pure, **local wall-clock time** — deliberately not UTC, per Global Constraints). Wires the real `enableNotifications` handler (replacing Task 8's stub) and a `useEffect` running the two 10-minute interval checks described in the spec.

- [ ] **Step 1: Write the failing unit test — `frontend/lib/notifications.spec.ts`**

```ts
import { isEveningWindow, isMorningWindow } from './notifications';

describe('isMorningWindow', () => {
  it('is true at exactly 09:00', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 9, 0))).toBe(true);
  });
  it('is true just before 21:30', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 21, 29))).toBe(true);
  });
  it('is false at 21:30', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 21, 30))).toBe(false);
  });
  it('is false before 09:00', () => {
    expect(isMorningWindow(new Date(2026, 6, 15, 8, 59))).toBe(false);
  });
});

describe('isEveningWindow', () => {
  it('is true at exactly 21:30', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 21, 30))).toBe(true);
  });
  it('is true just before midnight', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 23, 59))).toBe(true);
  });
  it('is false before 21:30', () => {
    expect(isEveningWindow(new Date(2026, 6, 15, 21, 29))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest notifications.spec.ts`
Expected: FAIL — `Cannot find module './notifications'`.

- [ ] **Step 3: Create `frontend/lib/notifications.ts`**

```ts
// Deliberately LOCAL wall-clock time (not UTC) — the spec requires these windows
// to track when the user is actually at their computer, unlike the UTC "today"
// date convention used everywhere else in this app (see lib/date.ts).

export function isMorningWindow(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 && minutes < 21 * 60 + 30;
}

export function isEveningWindow(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 21 * 60 + 30 && minutes < 24 * 60;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest notifications.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Modify `frontend/components/Dashboard.tsx`**

Add the import `import { isEveningWindow, isMorningWindow } from '@/lib/notifications';`.

Replace the stub:

```tsx
function enableNotifications() {
  // Real Notification.requestPermission() + Settings persistence lands in Task 18.
}
```

with:

```tsx
async function enableNotifications() {
  if (typeof Notification === 'undefined') return;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    setSettings(await updateSettings({ notificationsEnabled: true }));
  }
}
```

And add this `useEffect` alongside the existing ones (after the `loadCore` effect):

```tsx
useEffect(() => {
  if (!settings?.notificationsEnabled) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const check = () => {
    const now = new Date();
    if (isMorningWindow(now) && day && day.dailies.length === 0) {
      new Notification('Ещё не занёс задачи на сегодня');
    }
    if (isEveningWindow(now) && day && !day.eveningClosed) {
      new Notification('Отметь сферы за сегодня и закрой день');
    }
  };

  check();
  const interval = setInterval(check, 10 * 60 * 1000);
  return () => clearInterval(interval);
}, [settings?.notificationsEnabled, day]);
```

Every other line of the file is unchanged from Task 16 (the last task to modify `Dashboard.tsx` — Task 17 only touched `SettingsModal.tsx`).

- [ ] **Step 6: Verify against the live backend**

```bash
cd frontend && bun run build
# Expected: "✓ Compiled successfully", no type errors

cd frontend && bun run dev &
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
```

Expected: prints `загрузка`. Then in an actual browser: the header should show "Включить уведомления" (shown because `notificationsEnabled` defaults to `false`); click it — the browser's native permission prompt should appear (grant it); the button should disappear from the header once granted and persisted (confirm via reload — `settings.notificationsEnabled` should now be `true` from the backend). Fully exercising the 10-minute interval firing a real notification isn't practical to verify synchronously; the interval logic itself is exercised by `isMorningWindow`/`isEveningWindow`'s unit tests, and the build above already confirms the wiring type-checks.
Stop the dev server before continuing.

- [ ] **Step 7: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/notifications.ts frontend/lib/notifications.spec.ts frontend/components/Dashboard.tsx
git commit -m "feat(frontend): add Web Notification API wiring (morning/evening reminder windows)"
```

---

### Task 19: Dockerize frontend, finish Docker Compose, finish README, full 3-service verification

**Files:**
- Create: `frontend/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–18 (full working frontend), the existing `docker-compose.yml` (`postgres` + `backend` services from Plan 1).
- Produces: `docker compose up -d --build` brings up all three services; `http://localhost:4887` serves the fully working app end-to-end against the containerized backend. This is the last task of the entire project (both plans).

- [ ] **Step 1: Create `frontend/Dockerfile`**

```dockerfile
FROM oven/bun:1-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["bun", "server.js"]
```

`NEXT_PUBLIC_API_URL` must be a build `ARG` (not just a runtime `ENV`) because Next.js inlines `NEXT_PUBLIC_*` variables into the client JS bundle at `next build` time — setting it only at container-start time would have no effect on already-built pages. `output: 'standalone'` (Task 1's `next.config.js`) produces a self-contained `server.js` that needs only `node_modules`' runtime deps it bundled itself, `.next/static`, and `public/` — no full `node_modules` copy required, unlike the backend's Dockerfile.

- [ ] **Step 2: Modify `docker-compose.yml`** — add the `frontend` service (leave `postgres` and `backend` exactly as Plan 1 left them)

```yaml
  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    restart: unless-stopped
    ports:
      - "4887:3000"
    depends_on:
      - backend
```

Insert this as a third top-level entry under `services:`, alongside the existing `postgres:` and `backend:` blocks (do not reorder or modify those two).

- [ ] **Step 3: Bring the full stack up clean**

```bash
cd /Users/1mpuser/Desktop/tracker
docker compose down
docker compose up -d --build
```

Expected: all three services build/start; `docker compose ps` shows `postgres` healthy, `backend` and `frontend` running.

- [ ] **Step 4: Verify the containerized stack end-to-end**

```bash
docker compose logs frontend | tail -20
# Expected: "Ready" / no errors

curl -s http://localhost:4887 | grep -o 'загрузка'
# Expected: prints the pre-hydration loading text — the page is entirely client-fetched
# (see Task 7's note), so this is the most curl can confirm; it means the container
# served a working HTML shell, not that the app is broken.

curl -s http://localhost:3001/health
# Expected: {"status":"ok"}

docker compose restart frontend backend
sleep 3
curl -s http://localhost:4887 | grep -o 'загрузка'
# Expected: still prints it after restart
```

Then, **in an actual browser** at `http://localhost:4887` (this is a UI feature — verify it visually, not just via curl, per the project's standard practice): confirm the full golden path — toggle a sphere, add/complete/delete a daily task, add YouTube minutes and watch the bar change color past 70%/over budget, open Settings and rename/reorder/archive a category and add a new one, add/use/delete a task template, confirm the stats panel shows all 4 visualizations with real (if sparse) data, and confirm notifications can be enabled without a console error.

- [ ] **Step 5: Modify `README.md`** — append a frontend section (keep the existing backend-only content from Plan 1 intact above it)

Replace the line:

```markdown
Frontend: http://localhost:4887 (added in a later phase)
```

with:

```markdown
Frontend: http://localhost:4887
```

And append this section at the end of the file:

```markdown

## Local frontend development (without full Docker rebuild each time)

```bash
docker compose up -d postgres backend
cd frontend
cp .env.example .env.local   # then edit: NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev
```

Opens on http://localhost:4887 (not the Next.js default 3000 — the backend's CORS is locked to 4887).

## Frontend tests

```bash
cd frontend && bun run test
```
```

Also create `frontend/.env.example` referenced above:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 6: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/Dockerfile frontend/.env.example docker-compose.yml README.md
git commit -m "feat(frontend): dockerize frontend service, wire into compose, finish README"
```

---

## Definition of Done for this plan

- `docker compose up -d --build` starts all three services (`postgres`, `backend`, `frontend`) from a clean checkout.
- `http://localhost:4887` shows today's day: spheres toggle, dailies add/toggle/delete + templates dropdown, YouTube minutes/budget/bar/buttons all work and persist in Postgres, surviving `docker compose restart`.
- The gear icon opens a working Settings modal: category rename/reorder/archive/add, task-template add/delete, closing via ×/outside-click/Escape.
- The Statistics panel shows all 4 visualizations (12-week heatmap, 30-day category bars, 8-week YouTube chart, 30-day YouTube heatmap + average bar) pulling from real endpoints.
- Notifications can be enabled via the header button and persist `notificationsEnabled` in `Settings`.
- `cd frontend && bun run test` passes (date, streak, transliterate, heatmap, notifications, api unit tests).
- `cd frontend && bun run build` succeeds with no type errors.
