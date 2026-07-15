# Day Rating + Comment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user rate today (1–10, slider) and leave a short comment, integrated into the existing "Сферы дня" panel next to the close-day button, viewable/editable for past days via the existing `DayDetailModal`, and visible as a 30-day trend line in the Statistics panel.

**Architecture:** `Day` gets two new nullable columns (`rating`, `comment`). The existing single-purpose `PATCH /days/:date` (previously only `eveningClosed`) is generalized to a partial update accepting any combination of `eveningClosed`/`rating`/`comment` — matching the partial-update pattern `CategoriesService.update` already uses. `HistoryEntry` (from `GET /history`, already fetched once by `Dashboard` for 84 days) gains a `rating` field, so the new 30-day trend chart needs no new endpoint. On the frontend, `SpheresPanel` gains 4 new props and renders a new `DayRatingBlock` between the category rows and the close-day button — since `SpheresPanel` is already reused verbatim inside `DayDetailModal`'s edit mode, past-day rating/comment editing falls out of that reuse for free.

**Tech Stack:** Same as the rest of the project — NestJS + Prisma (backend), Next.js + TypeScript + CSS Modules + recharts (frontend), Bun, Jest.

See `docs/superpowers/specs/2026-07-15-day-rating-design.md` for the approved design.

## Global Constraints

- `rating` is nullable `Int` (1–10 inclusive), `comment` is nullable `String` (max 200 chars) — both optional, a day can be closed without either.
- `PATCH /days/:date` becomes a genuine partial update: every field on `UpdateDayDto` is optional, and the service passes only the provided keys through to `prisma.day.update({ data })`. The existing "close the day" behavior (PATCH with only `eveningClosed`) must keep working unchanged.
- `frontend/lib/api.ts`'s single-purpose `setEveningClosed(date, eveningClosed)` is replaced by a general `updateDay(date, data: { eveningClosed?; rating?; comment? })`, matching the shape `updateYoutube(date, { delta?; reset? })` already uses. Both of its call sites (`Dashboard.tsx`, `DayDetailModal.tsx`) move to the new function.
- `SpheresPanel`'s new props (`rating`, `comment`, `onRatingChange`, `onCommentChange`) must be simple pass-through to a new `DayRatingBlock` child component — `SpheresPanel` itself holds no new state.
- The rating slider commits (fires `onRatingChange`) only on release (`onMouseUp`/`onTouchEnd`), not on every intermediate drag value — live visual feedback during drag is local component state inside `DayRatingBlock`. The comment input commits on `onBlur`, matching the existing category-rename pattern in `SettingsModal`.
- The 30-day rating chart reuses `Dashboard`'s already-fetched `history` (`GET /history?limit=84`) — no new API call, no new backend endpoint.
- Package manager & runtime: Bun.

---

### Task 1: Backend — `rating`/`comment` on `Day`, generalized `PATCH /days/:date`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: new Prisma migration (via `prisma migrate dev`)
- Modify: `backend/src/days/dto/update-day.dto.ts`
- Modify: `backend/src/days/days.service.ts`
- Modify: `backend/src/days/days.service.spec.ts`
- Modify: `backend/src/days/days.controller.ts`

**Interfaces:**
- Consumes: nothing new — same `PrismaService`/`CategoriesService` dependencies `DaysService` already has.
- Produces: `DaysService.updateDay(dateStr: string, data: { eveningClosed?: boolean; rating?: number; comment?: string }): Promise<DayView>` (replaces `setEveningClosed`); `DayView` gains `rating: number | null` and `comment: string | null`; `HistoryEntry` gains `rating: number | null` only (no `comment` — the chart doesn't need text). This is what `frontend/types/api.ts` (Task 2) mirrors.

- [ ] **Step 1: Modify `backend/prisma/schema.prisma`** — add two fields to the `Day` model

```prisma
model Day {
  id             Int      @id @default(autoincrement())
  date           DateTime @unique @db.Date
  youtubeMinutes Int      @default(0)
  eveningClosed  Boolean  @default(false)
  rating         Int?
  comment        String?
  categories     DayCategoryStatus[]
  dailies        DailyTask[]
  createdAt      DateTime @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd backend && bunx prisma migrate dev --name add_day_rating_comment`
Expected: creates `backend/prisma/migrations/<timestamp>_add_day_rating_comment/migration.sql` with `ALTER TABLE "Day" ADD COLUMN "rating" INTEGER, ADD COLUMN "comment" TEXT;`, applies it cleanly against the local dev database (already running via `docker compose up -d postgres`).

- [ ] **Step 3: Write the failing tests for `updateDay` — append to `backend/src/days/days.service.spec.ts`** (new `describe` block, after the existing `DaysService.getHistory` block)

```ts
describe('DaysService.updateDay', () => {
  let service: DaysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      day: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new DaysService(prisma, {} as any);
  });

  it('forwards only the provided fields to the Prisma update, not a merged full-day object', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay('2026-07-14', { rating: 8 });

    expect(prisma.day.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { rating: 8 } });
  });

  it('supports updating multiple fields in one call', async () => {
    jest.spyOn(service, 'getDay').mockResolvedValue({} as any);

    await service.updateDay('2026-07-14', { eveningClosed: true, comment: 'Хороший день' });

    expect(prisma.day.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { eveningClosed: true, comment: 'Хороший день' },
    });
  });
});
```

Also add two tests to the existing `describe('DaysService.getHistory', ...)` block (after its last existing test):

```ts
  it('exposes the day row\'s rating', async () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    prisma.day.findMany.mockResolvedValue([{ date: today, youtubeMinutes: 0, rating: 7, categories: [] }]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.rating).toBe(7);
  });

  it('defaults rating to null when there is no history record for the day', async () => {
    prisma.day.findMany.mockResolvedValue([]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.settings.findUnique.mockResolvedValue({ youtubeBudget: 60 });

    const [entry] = await service.getHistory(1);

    expect(entry.rating).toBeNull();
  });
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `cd backend && bunx jest days.service.spec.ts`
Expected: FAIL — `service.updateDay is not a function`, and the two new `getHistory` assertions fail (`rating` doesn't exist on the returned entry yet).

- [ ] **Step 5: Modify `backend/src/days/dto/update-day.dto.ts`** (full new content)

```ts
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateDayDto {
  @IsOptional()
  @IsBoolean()
  eveningClosed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  comment?: string;
}
```

- [ ] **Step 6: Modify `backend/src/days/days.service.ts`** (full new content)

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { addDays, formatDate, parseDateParam, todayDate } from '../common/date.util';

export interface DayCategoryView {
  key: string;
  label: string;
  done: boolean;
}

export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  categories: DayCategoryView[];
  dailies: { id: number; text: string; done: boolean; order: number }[];
}

export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
  rating: number | null;
}

export interface UpdateDayData {
  eveningClosed?: boolean;
  rating?: number;
  comment?: string;
}

@Injectable()
export class DaysService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  async getOrCreateDayId(dateStr: string): Promise<number> {
    const date = parseDateParam(dateStr);
    const existing = await this.prisma.day.findUnique({ where: { date } });
    if (existing) return existing.id;
    const created = await this.prisma.day.create({ data: { date } });
    return created.id;
  }

  async getDay(dateStr: string): Promise<DayView> {
    const date = parseDateParam(dateStr);
    let day = await this.prisma.day.findUnique({
      where: { date },
      include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
    });
    if (!day) {
      day = await this.prisma.day.create({
        data: { date },
        include: { categories: true, dailies: { orderBy: { order: 'asc' } } },
      });
    }

    const activeCategories = await this.categoriesService.findActive();
    const statusByCategoryId = new Map(day.categories.map((s) => [s.categoryId, s]));

    return {
      date: formatDate(day.date),
      youtubeMinutes: day.youtubeMinutes,
      eveningClosed: day.eveningClosed,
      rating: day.rating,
      comment: day.comment,
      categories: activeCategories.map((c) => ({
        key: c.key,
        label: c.label,
        done: statusByCategoryId.get(c.id)?.done ?? false,
      })),
      dailies: day.dailies.map((t) => ({ id: t.id, text: t.text, done: t.done, order: t.order })),
    };
  }

  async setCategoryStatus(dateStr: string, key: string, done: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const category = await this.prisma.category.findUnique({ where: { key } });
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    await this.prisma.dayCategoryStatus.upsert({
      where: { dayId_categoryId: { dayId, categoryId: category.id } },
      update: { done },
      create: { dayId, categoryId: category.id, done },
    });
    return this.getDay(dateStr);
  }

  async updateYoutube(dateStr: string, delta?: number, reset?: boolean): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    const day = await this.prisma.day.findUniqueOrThrow({ where: { id: dayId } });
    const nextMinutes = reset ? 0 : Math.max(0, day.youtubeMinutes + (delta ?? 0));
    await this.prisma.day.update({ where: { id: dayId }, data: { youtubeMinutes: nextMinutes } });
    return this.getDay(dateStr);
  }

  async updateDay(dateStr: string, data: UpdateDayData): Promise<DayView> {
    const dayId = await this.getOrCreateDayId(dateStr);
    await this.prisma.day.update({ where: { id: dayId }, data });
    return this.getDay(dateStr);
  }

  async getHistory(limit: number): Promise<HistoryEntry[]> {
    const end = todayDate();
    const start = addDays(end, -(limit - 1));

    const [days, categories, settings] = await Promise.all([
      this.prisma.day.findMany({
        where: { date: { gte: start, lte: end } },
        include: { categories: true },
      }),
      this.prisma.category.findMany(),
      this.prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

    const budget = settings?.youtubeBudget ?? 60;
    const dayByDate = new Map(days.map((d) => [formatDate(d.date), d]));

    const result: HistoryEntry[] = [];
    for (let i = 0; i < limit; i++) {
      const date = formatDate(addDays(start, i));
      const day = dayByDate.get(date);
      const statusByCategoryId = new Map((day?.categories ?? []).map((s) => [s.categoryId, s]));
      const activeSet = categories.filter((c) => !c.archived || statusByCategoryId.has(c.id));
      const completed = activeSet.filter((c) => statusByCategoryId.get(c.id)?.done).length;
      const youtubeMinutes = day?.youtubeMinutes ?? 0;
      result.push({
        date,
        completed,
        total: activeSet.length,
        ytOver: youtubeMinutes > budget,
        rating: day?.rating ?? null,
      });
    }
    return result;
  }
}
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `cd backend && bunx jest days.service.spec.ts`
Expected: PASS — 8 tests (4 existing `getHistory` + 2 new `getHistory` + 2 new `updateDay`).

- [ ] **Step 8: Modify `backend/src/days/days.controller.ts`** — one line change

```ts
  @Patch('days/:date')
  updateDay(@Param('date') date: string, @Body() dto: UpdateDayDto) {
    return this.daysService.updateDay(date, dto);
  }
```

(Replaces the old `return this.daysService.setEveningClosed(date, dto.eveningClosed);` — every other line of the file is unchanged.)

- [ ] **Step 9: Run the full backend test suite**

Run: `cd backend && bun run test`
Expected: PASS — 28/28 (24 previous + 4 new in `days.service.spec.ts`).

- [ ] **Step 10: Verify with curl against a running backend**

```bash
docker compose up -d postgres backend
TODAY=$(date -u +%F)

curl -s -X PATCH http://localhost:3001/days/$TODAY -H 'Content-Type: application/json' -d '{"rating":8,"comment":"Продуктивный день"}'
# Expected: 200, response includes rating:8, comment:"Продуктивный день", eveningClosed unchanged

curl -s -X PATCH http://localhost:3001/days/$TODAY -H 'Content-Type: application/json' -d '{"eveningClosed":true}'
# Expected: 200, eveningClosed:true, rating/comment from the previous call still present (not wiped out)

curl -s http://localhost:3001/days/$TODAY
# Expected: rating:8, comment:"Продуктивный день", eveningClosed:true

curl -s "http://localhost:3001/history?limit=1" | python3 -m json.tool
# Expected: single entry with rating:8

curl -s -X PATCH http://localhost:3001/days/$TODAY -H 'Content-Type: application/json' -d '{"rating":8,"comment":null}'
# Expected clearing comment: 400 (comment must be a string per @IsString, not nullable at the DTO level — this is fine, the frontend never needs to explicitly clear a comment back to null in this feature's scope; confirm this returns a validation error rather than crashing)
```

Then revert the test data: `curl -s -X PATCH http://localhost:3001/days/$TODAY -H 'Content-Type: application/json' -d '{"rating":null}'` will also 400 for the same reason — instead just leave the test rating/comment in place if this is a dev database, or note that `rating`/`comment` have no "clear" endpoint in this plan's scope (matches the design doc's "not in scope" list — no clear/reset action was requested).

- [ ] **Step 11: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/days
git commit -m "feat(backend): add day rating + comment, generalize PATCH /days/:date to partial update"
```

---

### Task 2: Frontend — types, API client, `DayRatingBlock`, `SpheresPanel` wiring, `Dashboard`/`DayDetailModal` integration, 30-day chart

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/components/SpheresPanel.tsx`
- Modify: `frontend/components/SpheresPanel.module.css`
- Create: `frontend/components/DayRatingBlock.tsx`
- Create: `frontend/components/DayRatingBlock.module.css`
- Modify: `frontend/components/Dashboard.tsx`
- Modify: `frontend/components/DayDetailModal.tsx`
- Modify: `frontend/components/DayDetailModal.module.css`
- Create: `frontend/components/RatingChart.tsx`
- Create: `frontend/components/RatingChart.module.css`
- Modify: `frontend/components/StatsPanel.tsx`

**Interfaces:**
- Consumes: Task 1's backend changes (`rating`/`comment` on `DayView`, `rating` on `HistoryEntry`, generalized `PATCH /days/:date`).
- Produces: nothing consumed further — this is the last task of this plan.

- [ ] **Step 1: Modify `frontend/types/api.ts`** — two targeted edits

Change:
```ts
export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  categories: CategoryView[];
  dailies: DailyTaskView[];
}
```
to:
```ts
export interface DayView {
  date: string;
  youtubeMinutes: number;
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  categories: CategoryView[];
  dailies: DailyTaskView[];
}
```

Change:
```ts
export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
}
```
to:
```ts
export interface HistoryEntry {
  date: string;
  completed: number;
  total: number;
  ytOver: boolean;
  rating: number | null;
}
```

- [ ] **Step 2: Modify `frontend/lib/api.ts`** — replace `setEveningClosed` with `updateDay`

Change:
```ts
export function setEveningClosed(date: string, eveningClosed: boolean): Promise<DayView> {
  return request(`/days/${date}`, { method: 'PATCH', body: JSON.stringify({ eveningClosed }) });
}
```
to:
```ts
export function updateDay(
  date: string,
  data: { eveningClosed?: boolean; rating?: number; comment?: string },
): Promise<DayView> {
  return request(`/days/${date}`, { method: 'PATCH', body: JSON.stringify(data) });
}
```

- [ ] **Step 3: Create `frontend/components/DayRatingBlock.module.css`**

```css
.wrap {
  padding: 12px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin: 4px 0 14px;
}

.heading {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.sliderRow {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-alt);
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--accent-glow);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--accent-glow);
}

.value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  width: 44px;
  text-align: right;
  flex-shrink: 0;
}

.valueEmpty {
  color: var(--text-dim);
  font-weight: 400;
}

.comment {
  width: 100%;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
}

.comment:focus {
  outline: none;
  border-color: var(--accent2);
}
```

- [ ] **Step 4: Create `frontend/components/DayRatingBlock.tsx`**

```tsx
'use client';

import { useState } from 'react';
import styles from './DayRatingBlock.module.css';

interface DayRatingBlockProps {
  rating: number | null;
  comment: string | null;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
}

export default function DayRatingBlock({ rating, comment, onRatingChange, onCommentChange }: DayRatingBlockProps) {
  const [liveRating, setLiveRating] = useState(rating ?? 5);
  const [commentDraft, setCommentDraft] = useState(comment ?? '');

  function commitRating() {
    onRatingChange(liveRating);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>Оценка дня</div>
      <div className={styles.sliderRow}>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={liveRating}
          className={styles.slider}
          onChange={(e) => setLiveRating(Number(e.target.value))}
          onMouseUp={commitRating}
          onTouchEnd={commitRating}
        />
        <span className={`${styles.value} ${rating === null ? styles.valueEmpty : ''}`}>
          {rating === null ? '—' : liveRating}
          <span>/10</span>
        </span>
      </div>
      <input
        type="text"
        className={styles.comment}
        placeholder="Комментарий к дню…"
        maxLength={200}
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
        onBlur={() => onCommentChange(commentDraft)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Modify `frontend/components/SpheresPanel.tsx`** (full new content)

```tsx
import styles from './SpheresPanel.module.css';
import type { CategoryView } from '@/types/api';
import DayRatingBlock from './DayRatingBlock';

interface SpheresPanelProps {
  categories: CategoryView[];
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  onToggle: (key: string) => void;
  onToggleEveningClosed: () => void;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
}

export default function SpheresPanel({
  categories,
  eveningClosed,
  rating,
  comment,
  onToggle,
  onToggleEveningClosed,
  onRatingChange,
  onCommentChange,
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
      <DayRatingBlock
        rating={rating}
        comment={comment}
        onRatingChange={onRatingChange}
        onCommentChange={onCommentChange}
      />
      <button type="button" className={styles.closeBtn} onClick={onToggleEveningClosed}>
        {eveningClosed ? 'День закрыт ✓ (отменить)' : 'Отметить день закрытым'}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Modify `frontend/components/Dashboard.tsx`** — targeted edits (not a full-file replacement; every other line stays as-is)

Change the import line:
```ts
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
```
to:
```ts
import {
  addDaily as apiAddDaily,
  deleteDaily as apiDeleteDaily,
  getDay,
  getHistory,
  getSettings,
  setCategoryDone,
  updateDaily as apiUpdateDaily,
  updateDay,
  updateSettings,
  updateYoutube,
} from '@/lib/api';
```

Change:
```ts
  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await setEveningClosed(date, !day.eveningClosed));
  }
```
to:
```ts
  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await updateDay(date, { eveningClosed: !day.eveningClosed }));
  }

  async function changeRating(rating: number) {
    setDay(await updateDay(date, { rating }));
    refreshHistory();
  }

  async function changeComment(comment: string) {
    setDay(await updateDay(date, { comment }));
  }
```

Change:
```tsx
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
        />
```
to:
```tsx
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          rating={day.rating}
          comment={day.comment}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
          onRatingChange={changeRating}
          onCommentChange={changeComment}
        />
```

- [ ] **Step 7: Modify `frontend/components/DayDetailModal.module.css`** — append two new rules for the view-mode rating/comment lines (reuses the existing `.viewLine` class for layout, so only these two are new if any styling gap exists — actually `.viewLine` already covers font-size/color/font-family identically to what's needed, so **no CSS changes are required in this file**; skip this step's file edit and just reuse `.viewLine` in Step 8 below)

(No changes to this file — `.viewLine` already provides the right styling for the two new read-only lines added in Step 8.)

- [ ] **Step 8: Modify `frontend/components/DayDetailModal.tsx`** (full new content)

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './DayDetailModal.module.css';
import type { DayView } from '@/types/api';
import { addDaily, deleteDaily, getDay, setCategoryDone, updateDaily, updateDay, updateYoutube } from '@/lib/api';
import { formatDisplayDate } from '@/lib/date';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';

type Stage = 'loading' | 'view' | 'confirm' | 'edit';

interface DayDetailModalProps {
  date: string;
  onClose: () => void;
  onDataChanged: () => void;
}

export default function DayDetailModal({ date, onClose, onDataChanged }: DayDetailModalProps) {
  const [day, setDay] = useState<DayView | null>(null);
  const [stage, setStage] = useState<Stage>('loading');

  useEffect(() => {
    getDay(date).then((d) => {
      setDay(d);
      setStage('view');
    });
  }, [date]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function refresh() {
    setDay(await getDay(date));
    onDataChanged();
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    await setCategoryDone(date, key, !current.done);
    await refresh();
  }

  async function toggleEveningClosed() {
    if (!day) return;
    await updateDay(date, { eveningClosed: !day.eveningClosed });
    await refresh();
  }

  async function changeRating(rating: number) {
    await updateDay(date, { rating });
    await refresh();
  }

  async function changeComment(comment: string) {
    await updateDay(date, { comment });
    await refresh();
  }

  async function addDailyTask(text: string) {
    await addDaily(date, text);
    await refresh();
  }

  async function toggleDaily(id: number) {
    if (!day) return;
    const current = day.dailies.find((t) => t.id === id);
    if (!current) return;
    await updateDaily(id, { done: !current.done });
    await refresh();
  }

  async function deleteDailyTask(id: number) {
    await deleteDaily(id);
    await refresh();
  }

  async function addYoutubeMinutes(delta: number) {
    await updateYoutube(date, { delta });
    await refresh();
  }

  async function resetYoutube() {
    await updateYoutube(date, { reset: true });
    await refresh();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.dateLabel}>{formatDisplayDate(date)}</span>
          <div className={styles.headerActions}>
            {stage === 'view' && (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => setStage('confirm')}
                aria-label="Редактировать"
              >
                ✎
              </button>
            )}
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>

        {stage === 'loading' && <div className={styles.loading}>загрузка…</div>}

        {stage === 'view' && day && (
          <div className={styles.body}>
            <div className={styles.section}>
              {day.categories.map((c) => (
                <div key={c.key} className={styles.viewRow}>
                  <span className={`${styles.viewMark} ${c.done ? styles.viewMarkDone : ''}`}>
                    {c.done ? '✓' : ''}
                  </span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.section}>
              <div className={styles.viewLine}>YouTube: {day.youtubeMinutes} мин</div>
              <div className={styles.viewLine}>День закрыт: {day.eveningClosed ? 'да' : 'нет'}</div>
              <div className={styles.viewLine}>Оценка: {day.rating === null ? '—' : `${day.rating}/10`}</div>
              {day.comment && <div className={styles.viewLine}>Комментарий: {day.comment}</div>}
            </div>
            <div className={styles.section}>
              {day.dailies.length === 0 && <div className={styles.viewEmpty}>Задач не было</div>}
              {day.dailies.map((t) => (
                <div key={t.id} className={`${styles.viewTask} ${t.done ? styles.viewTaskDone : ''}`}>
                  {t.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 'confirm' && (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>
              Редактировать данные за {formatDisplayDate(date)}? Это повлияет на серию и статистику.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={() => setStage('view')}>
                Отмена
              </button>
              <button type="button" className={styles.confirmEdit} onClick={() => setStage('edit')}>
                Редактировать
              </button>
            </div>
          </div>
        )}

        {stage === 'edit' && day && (
          <div className={styles.body}>
            <SpheresPanel
              categories={day.categories}
              eveningClosed={day.eveningClosed}
              rating={day.rating}
              comment={day.comment}
              onToggle={toggleCategory}
              onToggleEveningClosed={toggleEveningClosed}
              onRatingChange={changeRating}
              onCommentChange={changeComment}
            />
            <DailiesPanel
              dailies={day.dailies}
              onAdd={addDailyTask}
              onToggle={toggleDaily}
              onDelete={deleteDailyTask}
            />
            <div className={styles.ytEditor}>
              <div className={styles.ytEditorHeading}>YouTube</div>
              <div className={styles.ytEditorTop}>
                <span className={styles.ytEditorMinutes}>{day.youtubeMinutes} мин</span>
                <span className={styles.ytEditorReset} onClick={resetYoutube}>
                  сбросить
                </span>
              </div>
              <div className={styles.ytEditorButtons}>
                <button type="button" onClick={() => addYoutubeMinutes(10)}>
                  +10
                </button>
                <button type="button" onClick={() => addYoutubeMinutes(25)}>
                  +25
                </button>
                <button type="button" onClick={() => addYoutubeMinutes(50)}>
                  +50
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `frontend/components/RatingChart.module.css`**

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

- [ ] **Step 10: Create `frontend/components/RatingChart.tsx`**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import styles from './RatingChart.module.css';
import type { HistoryEntry } from '@/types/api';

interface RatingChartProps {
  history: HistoryEntry[];
}

const DAYS = 30;

export default function RatingChart({ history }: RatingChartProps) {
  const data = history.slice(-DAYS);
  if (data.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Оценка дня · {DAYS} дней</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            domain={[1, 10]}
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--accent)' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`connectNulls={false}` makes days with no rating (`null`) show as a gap in the line rather than a misleading straight interpolation across unrated days.

- [ ] **Step 11: Modify `frontend/components/StatsPanel.tsx`** (full new content)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import StreakHeatmap from './StreakHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';
import YoutubeDailyHeatmap from './YoutubeDailyHeatmap';
import RatingChart from './RatingChart';

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
      <RatingChart history={history} />
    </div>
  );
}
```

- [ ] **Step 12: Verify the production build succeeds**

Run: `cd frontend && bun run build`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 13: Run the full frontend test suite**

Run: `cd frontend && bun run test`
Expected: PASS — 42/42 (unchanged from before this task; no new `lib/` logic was added, `DayRatingBlock`/`RatingChart` are presentational and not unit-tested, matching how `YoutubePanel`/`YoutubeWeeklyChart` were handled).

- [ ] **Step 14: Rebuild and redeploy the full Docker stack**

```bash
cd /Users/1mpuser/Desktop/tracker
docker compose up -d --build
docker compose ps
```

Expected: `postgres` healthy, `backend` and `frontend` running.

- [ ] **Step 15: Verify end-to-end in an actual browser, without corrupting real historical data**

At `http://localhost:4887` (or `http://tracker.test:4887`):

1. Confirm a new "Оценка дня" block appears inside the "Сферы дня" card, between the category toggles and the "Отметить день закрытым" button: a slider (default position ~5 if never rated) with a value readout, and a comment input below it.
2. Drag the slider and release — confirm the number updates and persists across a page reload.
3. Type a short comment and click/tab away (blur) — confirm it persists across a page reload.
4. Scroll to the Statistics panel — confirm a new "Оценка дня · 30 дней" line chart appears after the YouTube daily heatmap, showing today's point (and a gap for any unrated days, not a flat/zero line).
5. Open a past day via the category heatmap (read-only view) — confirm it now shows "Оценка: N/10" (or "—") and, if set, "Комментарий: …" as plain text alongside the existing YouTube/eveningClosed lines. Click the pencil → confirm → confirm the edit view now includes the same slider+comment block, editable for that past date. Do not actually change a past day's real rating/comment unless you intend to keep the change — if you test-toggle it, revert it back to its original value afterward.
6. Check the browser console for errors throughout.

If a headless-browser tool is available, drive this automatically and screenshot the rating block and the new chart; otherwise perform it manually and report what you observed.

- [ ] **Step 16: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/types/api.ts frontend/lib/api.ts frontend/components/SpheresPanel.tsx frontend/components/SpheresPanel.module.css frontend/components/DayRatingBlock.tsx frontend/components/DayRatingBlock.module.css frontend/components/Dashboard.tsx frontend/components/DayDetailModal.tsx frontend/components/RatingChart.tsx frontend/components/RatingChart.module.css frontend/components/StatsPanel.tsx
git commit -m "feat(frontend): add day rating slider + comment, reused in past-day editing, plus 30-day trend chart"
```

---

## Definition of Done

- Today's "Сферы дня" panel shows a 1–10 rating slider + comment field between the category toggles and the close-day button; both persist immediately (slider on release, comment on blur).
- Past days are viewable (read-only rating/comment text) and editable (same slider/comment block, via `SpheresPanel` reuse) through the existing `DayDetailModal`.
- The Statistics panel shows a 30-day rating trend line that gaps over unrated days instead of interpolating through them.
- `PATCH /days/:date` accepts any subset of `eveningClosed`/`rating`/`comment` without clobbering the fields not included in a given request.
- Backend test suite: 28/28. Frontend test suite: 42/42. Both `bun run build`s clean.
- Full stack rebuilds and runs via `docker compose up -d --build`; verified end-to-end in a real browser without corrupting real historical data.
