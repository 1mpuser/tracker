# Threshold-Based Streak (≥2 Spheres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header streak's "all spheres done" requirement with a more achievable "≥2 spheres done" threshold, add a live glow on the streak number the moment today crosses that threshold, and add a binary 12-week mini-heatmap to the Statistics panel showing which days met it.

**Architecture:** Pure logic change in `lib/streak.ts` (new `STREAK_THRESHOLD` constant, comparison changed from equality-to-total to `>= threshold`) plus a new small color function in `lib/heatmap.ts`. One new presentational component, `StreakHeatmap`, structurally a sibling of `CategoryHeatmap` reusing the same `history` data (no new API call) and the same `DayDetailModal` click-to-inspect wiring already in place.

**Tech Stack:** Same as the rest of the frontend — Next.js App Router, TypeScript, plain CSS Modules, Bun, Jest for the two touched `lib/` files.

See `docs/superpowers/specs/2026-07-15-threshold-streak-design.md` for the approved design.

## Global Constraints

- `STREAK_THRESHOLD = 2`, fixed in code (not a `Settings` field, not user-configurable).
- This **replaces** the existing "all spheres" streak logic — there is no second counter, no old label left behind.
- No backend changes — `HistoryEntry.completed` (already returned by `GET /history`) is all this needs.
- The streak-number glow (`streakBoosted`) reflects whether *today* has already met the threshold live (recomputed on every render from `day.categories`), independent of `history`.
- `StreakHeatmap` reuses `Dashboard`'s existing `history` state and the existing `onSelectDate` → `DayDetailModal` wiring from the day-detail-edit feature — no new fetch, no new modal.
- Package manager & runtime: Bun.

---

### Task 1: Threshold streak logic, glow, and binary heatmap

**Files:**
- Modify: `frontend/lib/streak.ts`
- Modify: `frontend/lib/streak.spec.ts`
- Modify: `frontend/lib/heatmap.ts`
- Modify: `frontend/lib/heatmap.spec.ts`
- Modify: `frontend/components/Header.tsx`
- Modify: `frontend/components/Header.module.css`
- Modify: `frontend/components/Dashboard.tsx`
- Modify: `frontend/components/StatsPanel.tsx`
- Create: `frontend/components/StreakHeatmap.tsx`
- Create: `frontend/components/StreakHeatmap.module.css`

- [ ] **Step 1: Rewrite the failing test for `computeStreak`'s new threshold semantics — `frontend/lib/streak.spec.ts`**

```ts
import { computeStreak, STREAK_THRESHOLD } from './streak';
import type { HistoryEntry } from '@/types/api';

function entry(date: string, completed: number): HistoryEntry {
  return { date, completed, total: 6, ytOver: false };
}

describe('computeStreak', () => {
  it('exports a threshold of 2', () => {
    expect(STREAK_THRESHOLD).toBe(2);
  });

  it('counts consecutive days meeting the threshold, ending yesterday, when today has not met it yet', () => {
    const history = [entry('2026-07-12', 2), entry('2026-07-13', 3), entry('2026-07-14', 2)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 1 })).toBe(3);
  });

  it('adds today to the streak only when today itself meets the threshold', () => {
    const history = [entry('2026-07-13', 2), entry('2026-07-14', 4)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });

  it('breaks the streak at the first day below the threshold looking backward', () => {
    const history = [entry('2026-07-11', 2), entry('2026-07-12', 1), entry('2026-07-13', 2), entry('2026-07-14', 3)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });

  it('treats a day with no history record as broken, not met', () => {
    const history = [entry('2026-07-14', 5)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(2);
  });

  it('does not count a day as meeting the threshold just because it was 100% complete with fewer than 2 categories', () => {
    const history = [{ date: '2026-07-14', completed: 1, total: 1, ytOver: false }];
    expect(computeStreak(history, { date: '2026-07-15', completed: 0 })).toBe(0);
  });

  it('uses the live today param over a stale history record for the same date', () => {
    const history = [entry('2026-07-13', 3), entry('2026-07-14', 2), entry('2026-07-15', 1)];
    expect(computeStreak(history, { date: '2026-07-15', completed: 2 })).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && bunx jest streak.spec.ts`
Expected: FAIL — `STREAK_THRESHOLD` is not exported yet, and/or assertions fail against the old all-or-nothing implementation.

- [ ] **Step 3: Rewrite `frontend/lib/streak.ts`**

```ts
import type { HistoryEntry } from '@/types/api';
import { addDaysUTC, formatUTC, parseUTC } from './date';

export const STREAK_THRESHOLD = 2;

export interface TodayCompletion {
  date: string;
  completed: number;
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
    if (rec && rec.completed >= STREAK_THRESHOLD) {
      streak++;
      cursor = addDaysUTC(cursor, -1);
    } else {
      break;
    }
  }

  if (today.completed >= STREAK_THRESHOLD) {
    streak++;
  }

  return streak;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && bunx jest streak.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Add the failing test for the new heatmap color function — append to `frontend/lib/heatmap.spec.ts`**

```ts
describe('thresholdHeatmapColor', () => {
  it('returns the empty panel color below the threshold', () => {
    expect(thresholdHeatmapColor(1, 2)).toBe('var(--panel-alt)');
  });
  it('returns solid accent at the threshold', () => {
    expect(thresholdHeatmapColor(2, 2)).toBe('var(--accent)');
  });
  it('returns solid accent above the threshold', () => {
    expect(thresholdHeatmapColor(5, 2)).toBe('var(--accent)');
  });
});
```

Also update the top import line to include the new function:

```ts
import { categoryHeatmapColor, mondayOffset, thresholdHeatmapColor, youtubeHeatmapColor } from './heatmap';
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd frontend && bunx jest heatmap.spec.ts`
Expected: FAIL — `Cannot find name 'thresholdHeatmapColor'` (or similar — not exported yet).

- [ ] **Step 7: Add `thresholdHeatmapColor` to `frontend/lib/heatmap.ts`** (append at the end of the file, after `mondayOffset`)

```ts
export function thresholdHeatmapColor(completed: number, threshold: number): string {
  return completed >= threshold ? 'var(--accent)' : 'var(--panel-alt)';
}
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `cd frontend && bunx jest heatmap.spec.ts`
Expected: PASS — 13 tests (10 existing + 3 new).

- [ ] **Step 9: Modify `frontend/components/Header.tsx`** (full new content)

```tsx
import styles from './Header.module.css';

interface HeaderProps {
  dateLabel: string;
  streak: number;
  streakBoosted: boolean;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  dateLabel,
  streak,
  streakBoosted,
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
          <div className={`${styles.streakNum} ${streakBoosted ? styles.streakBoosted : ''}`}>{streak}</div>
          <div className={styles.streakLbl}>дней подряд, 2+ сферы</div>
        </div>
        <button type="button" className={styles.gearBtn} onClick={onOpenSettings} aria-label="Настройки">
          ⚙
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Modify `frontend/components/Header.module.css`** — add `transition` to `.streakNum` and a new `.streakBoosted` rule

```css
.streakNum {
  font-family: var(--font-mono);
  font-size: 38px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
  transition: text-shadow 0.25s;
}

.streakBoosted {
  text-shadow: 0 0 12px var(--accent-glow);
}
```

(This replaces the existing `.streakNum` rule — same properties plus the new `transition` line — and adds `.streakBoosted` as a new rule immediately after it. Every other rule in the file is unchanged.)

- [ ] **Step 11: Create `frontend/components/StreakHeatmap.module.css`**

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
}

.clickable {
  cursor: pointer;
}

.clickable:hover {
  outline: 1px solid var(--accent2);
  outline-offset: 1px;
}

.blank {
  width: 13px;
  height: 13px;
}

.legend {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 6px;
}
```

- [ ] **Step 12: Create `frontend/components/StreakHeatmap.tsx`**

```tsx
import styles from './StreakHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { mondayOffset, thresholdHeatmapColor } from '@/lib/heatmap';
import { todayUTC } from '@/lib/date';
import { STREAK_THRESHOLD } from '@/lib/streak';

interface StreakHeatmapProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function StreakHeatmap({ history, onSelectDate }: StreakHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];
  const today = todayUTC();
  const metCount = history.filter((h) => h.completed >= STREAK_THRESHOLD).length;
  const pct = Math.round((metCount / history.length) * 100);

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Дни с {STREAK_THRESHOLD}+ сферами</div>
      <div className={styles.grid}>
        {cells.map((entry, i) => {
          if (!entry) return <div key={`blank-${i}`} className={styles.blank} />;
          const isToday = entry.date === today;
          const met = entry.completed >= STREAK_THRESHOLD;
          return (
            <div
              key={entry.date}
              className={`${styles.cell} ${isToday ? '' : styles.clickable}`}
              style={{ background: thresholdHeatmapColor(entry.completed, STREAK_THRESHOLD) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${met ? ' — засчитан в серию' : ''}`}
              onClick={isToday ? undefined : () => onSelectDate(entry.date)}
            />
          );
        })}
      </div>
      <div className={styles.legend}>
        {metCount} из {history.length} дней с {STREAK_THRESHOLD}+ сферами ({pct}%)
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Modify `frontend/components/StatsPanel.tsx`** (full new content — adds `StreakHeatmap` right after `CategoryHeatmap`)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import StreakHeatmap from './StreakHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';
import YoutubeDailyHeatmap from './YoutubeDailyHeatmap';

interface StatsPanelProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function StatsPanel({ history, onSelectDate }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} onSelectDate={onSelectDate} />
      <StreakHeatmap history={history} onSelectDate={onSelectDate} />
      <CategoryBars />
      <YoutubeWeeklyChart />
      <YoutubeDailyHeatmap />
    </div>
  );
}
```

- [ ] **Step 14: Modify `frontend/components/Dashboard.tsx`** — three targeted edits (not a full-file replacement this time; every other line stays as-is)

Change the import line:
```tsx
import { computeStreak } from '@/lib/streak';
```
to:
```tsx
import { computeStreak, STREAK_THRESHOLD } from '@/lib/streak';
```

Change:
```tsx
  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });
```
to:
```tsx
  const todayCompleted = day.categories.filter((c) => c.done).length;
  const streak = computeStreak(history, { date, completed: todayCompleted });
  const streakBoosted = todayCompleted >= STREAK_THRESHOLD;
```

Change:
```tsx
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
```
to:
```tsx
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        streakBoosted={streakBoosted}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
```

- [ ] **Step 15: Verify the production build succeeds**

Run: `cd frontend && bun run build`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 16: Run the full test suite**

Run: `cd frontend && bun run test`
Expected: PASS — 45/45 (38 previous + 7 rewritten streak tests replacing the old 6, + 3 new heatmap tests; net delta from 38 is +7: 6→7 in streak.spec.ts is +1, heatmap 10→13 is +3, so 38 - 6 + 7 - 10 + 13 = 42... recompute precisely at verification time from actual test runner output rather than trusting this arithmetic).

- [ ] **Step 17: Rebuild and redeploy the full Docker stack**

```bash
cd /Users/1mpuser/Desktop/tracker
docker compose up -d --build
docker compose ps
```

Expected: `postgres` healthy, `backend` and `frontend` running.

- [ ] **Step 18: Verify end-to-end in an actual browser, without mutating real historical data**

At `http://localhost:4887`:

1. Confirm the header now reads "дней подряд, 2+ сферы" instead of "все сферы".
2. Confirm a new binary mini-heatmap ("Дни с 2+ сферами") appears in the Statistics panel, directly under the existing 12-week category heatmap, with a legend line like "N из 84 дней с 2+ сферами (P%)".
3. On today's row (only — do not click into edit mode on any past day, and do not toggle real historical data): toggle categories on and off. Confirm the streak number in the header gets a soft amber glow the moment a 2nd category is marked done today, and loses the glow if you drop back below 2. Leave today's categories in the exact state you found them when done (toggle back whatever you toggled).
4. Confirm the new mini-heatmap's cells are clickable for past days (cursor + hover outline, consistent with the category heatmap) and not clickable for today.
5. Check the browser console for errors throughout.

If a headless-browser tool is available, drive this automatically and screenshot the header (showing the new label and, ideally, the glow state) and the new mini-heatmap; otherwise perform it manually and report what you observed.

- [ ] **Step 19: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/lib/streak.ts frontend/lib/streak.spec.ts frontend/lib/heatmap.ts frontend/lib/heatmap.spec.ts frontend/components/Header.tsx frontend/components/Header.module.css frontend/components/Dashboard.tsx frontend/components/StatsPanel.tsx frontend/components/StreakHeatmap.tsx frontend/components/StreakHeatmap.module.css
git commit -m "feat(frontend): streak counts >=2 spheres/day instead of all spheres, with glow and binary heatmap"
```

---

## Definition of Done

- Header streak counts consecutive days with ≥2 completed spheres, not all spheres; label updated accordingly.
- Streak number glows live the instant today crosses the 2-sphere threshold.
- A new binary 12-week heatmap in the Statistics panel shows which days met the threshold, with a percentage legend; its past-day cells open the existing `DayDetailModal`.
- `bun run build` passes; full test suite passes (exact count confirmed at verification time).
- Full stack rebuilds and runs cleanly via `docker compose up -d --build`; verified end-to-end in a real browser without mutating real historical data.
