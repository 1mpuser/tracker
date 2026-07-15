# Day Detail View/Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user click a past day's cell in the 12-week category heatmap to view that day's data, and — after an explicit confirmation step behind a pencil icon — edit it (categories, YouTube minutes, evening-closed flag, dailies), so a day's tracked state can be corrected to match reality after the fact.

**Architecture:** One new client component, `DayDetailModal`, driven by a 4-stage state machine (`loading` → `view` → `confirm` → `edit`). It reuses the already-built `SpheresPanel` and `DailiesPanel` unmodified for the edit surface (both are pure prop/callback components — this modal just points their callbacks at the selected date instead of today), plus a small inline YouTube-minutes editor (no budget field — budget is a global `Settings` value, not per-day). `CategoryHeatmap` gains an `onSelectDate` callback prop, threaded through `StatsPanel` from `Dashboard`, which owns a new `selectedDate` state slot.

**Tech Stack:** Same as the rest of the frontend — Next.js App Router, TypeScript, plain CSS Modules, Bun.

This plan builds on the completed backend (Plan 1) and frontend (Plan 2) — see `docs/superpowers/specs/2026-07-15-day-detail-edit-design.md` for the approved design.

## Global Constraints

- **No backend changes.** Every endpoint this feature needs (`GET /days/:date`, `PATCH /days/:date/categories/:key`, `PATCH /days/:date`, `PATCH /days/:date/youtube`, `POST/PATCH/DELETE /days/:date/dailies`) already accepts an arbitrary date — this was true from Plan 1 and simply never exercised by the frontend for anything but today.
- Clicking the **today** cell in the heatmap is a no-op — today stays editable only via the main screen's existing `SpheresPanel`/`DailiesPanel`/`YoutubePanel`.
- Clicking a **blank padding cell** (the `mondayOffset` filler cells before the first real day) is a no-op — those cells have no associated date.
- The `YoutubeDailyHeatmap` (30-day YouTube grid) stays non-interactive — this feature only wires the 12-week `CategoryHeatmap`.
- Editing is gated behind an explicit two-step confirmation: pencil icon → inline confirmation text (not a native `confirm()`, not a second modal) → only then does the interactive edit surface mount. Confirmation copy (approved): "Редактировать данные за {дата}? Это повлияет на серию и статистику." with buttons "Отмена" / "Редактировать".
- The YouTube budget (`Settings.youtubeBudget`) is never editable from this modal — only from the main screen's `YoutubePanel`.
- `SpheresPanel` and `DailiesPanel` must be reused with **zero interface changes** — pass different callbacks (bound to the selected date instead of today), do not add new props to them.
- Inherited, pre-existing limitation (not introduced by this feature, do not attempt to fix): `GET /days/:date` only returns currently non-archived categories (via the backend's `CategoriesService.findActive()`), same as the main screen. If a category was archived after a historical day passed, that day's modal won't show/let you edit it, even though `GET /history`'s heatmap-coloring logic still correctly counts it in that day's `completed`/`total`. This is the same behavior the main "today" screen already has for archived categories.
- Package manager & runtime: Bun.

---

### Task 1: `CategoryHeatmap` click wiring + `DayDetailModal` (all 4 stages) + `StatsPanel`/`Dashboard` wiring

**Files:**
- Modify: `frontend/components/CategoryHeatmap.tsx`
- Modify: `frontend/components/CategoryHeatmap.module.css`
- Modify: `frontend/components/StatsPanel.tsx`
- Create: `frontend/components/DayDetailModal.tsx`
- Create: `frontend/components/DayDetailModal.module.css`
- Modify: `frontend/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `getDay`, `setCategoryDone`, `setEveningClosed`, `addDaily`, `updateDaily`, `deleteDaily`, `updateYoutube` from `@/lib/api` (all pre-existing, unmodified); `formatDisplayDate`, `todayUTC` from `@/lib/date`; `SpheresPanel`, `DailiesPanel` (both pre-existing, unmodified props).
- Produces: `DayDetailModal` component with props `{ date: string; onClose: () => void; onDataChanged: () => void }` — this is the terminal component of this plan, nothing downstream consumes it beyond `Dashboard`.

This is a single, cohesive task — the four modal stages (loading/view/confirm/edit) are one state machine, not independently useful/reviewable pieces, so they ship together rather than across multiple tasks (unlike `SettingsModal`'s two genuinely-independent tabs in the prior plan).

- [ ] **Step 1: Modify `frontend/components/CategoryHeatmap.tsx`** (full new content)

```tsx
import styles from './CategoryHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { categoryHeatmapColor, mondayOffset } from '@/lib/heatmap';
import { todayUTC } from '@/lib/date';

interface CategoryHeatmapProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function CategoryHeatmap({ history, onSelectDate }: CategoryHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];
  const today = todayUTC();

  return (
    <div>
      <div className={styles.grid}>
        {cells.map((entry, i) => {
          if (!entry) return <div key={`blank-${i}`} className={styles.blank} />;
          const isToday = entry.date === today;
          return (
            <div
              key={entry.date}
              className={`${styles.cell} ${isToday ? '' : styles.clickable}`}
              style={{ background: categoryHeatmapColor(entry.completed, entry.total) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${
                entry.ytOver ? ', YouTube — перебор' : ''
              }`}
              onClick={isToday ? undefined : () => onSelectDate(entry.date)}
            >
              {entry.ytOver && <span className={styles.ytOver} />}
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>закрашено = доля закрытых сфер · красная черта = перебор по YouTube</div>
    </div>
  );
}
```

- [ ] **Step 2: Modify `frontend/components/CategoryHeatmap.module.css`** (full new content)

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

- [ ] **Step 3: Modify `frontend/components/StatsPanel.tsx`** (full new content — thread `onSelectDate` through to `CategoryHeatmap`, no other change)

```tsx
import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
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
      <CategoryBars />
      <YoutubeWeeklyChart />
      <YoutubeDailyHeatmap />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/components/DayDetailModal.module.css`**

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
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 18px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.dateLabel {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text);
  text-transform: capitalize;
}

.headerActions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editBtn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 13px;
  cursor: pointer;
}

.editBtn:hover {
  border-color: var(--accent2);
  color: var(--accent2);
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

.loading {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 30px 0;
  text-align: center;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.viewRow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  padding: 4px 0;
}

.viewMark {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--bg);
  flex-shrink: 0;
}

.viewMarkDone {
  background: var(--accent);
  border-color: var(--accent);
}

.viewLine {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.viewTask {
  font-size: 13.5px;
  padding: 3px 0;
}

.viewTaskDone {
  color: var(--text-dim);
  text-decoration: line-through;
}

.viewEmpty {
  color: var(--text-dim);
  font-size: 12.5px;
  font-style: italic;
}

.confirm {
  padding: 10px 0 4px;
}

.confirmText {
  font-size: 13.5px;
  color: var(--text);
  line-height: 1.5;
  margin: 0 0 16px;
}

.confirmActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirmCancel {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 12.5px;
  cursor: pointer;
}

.confirmCancel:hover {
  border-color: var(--text-dim);
  color: var(--text);
}

.confirmEdit {
  background: var(--danger-soft);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 12.5px;
  cursor: pointer;
}

.confirmEdit:hover {
  background: rgba(217, 100, 90, 0.28);
}

.ytEditor {
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.ytEditorHeading {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 10px;
  font-weight: 600;
}

.ytEditorTop {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.ytEditorMinutes {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}

.ytEditorReset {
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ytEditorButtons {
  display: flex;
  gap: 8px;
}

.ytEditorButtons button {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  font-family: var(--font-mono);
  cursor: pointer;
}

.ytEditorButtons button:hover {
  border-color: var(--accent2);
  color: var(--accent2);
}
```

- [ ] **Step 5: Create `frontend/components/DayDetailModal.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import styles from './DayDetailModal.module.css';
import type { DayView } from '@/types/api';
import {
  addDaily,
  deleteDaily,
  getDay,
  setCategoryDone,
  setEveningClosed,
  updateDaily,
  updateYoutube,
} from '@/lib/api';
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
    await setEveningClosed(date, !day.eveningClosed);
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
              onToggle={toggleCategory}
              onToggleEveningClosed={toggleEveningClosed}
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

- [ ] **Step 6: Modify `frontend/components/Dashboard.tsx`** (full new content — adds `selectedDate` state, `DayDetailModal` import/render, `onSelectDate` prop to `StatsPanel`; every other line unchanged from the current file)

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
import { isEveningWindow, isMorningWindow } from '@/lib/notifications';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';
import YoutubePanel from './YoutubePanel';
import StatsPanel from './StatsPanel';
import SettingsModal from './SettingsModal';
import DayDetailModal from './DayDetailModal';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setSettings(await updateSettings({ notificationsEnabled: true }));
    }
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
      <StatsPanel history={history} onSelectDate={setSelectedDate} />
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onCategoriesChanged={refreshDay} />
      )}
      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} onDataChanged={refreshHistory} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify the production build succeeds**

Run: `cd frontend && bun run build`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 8: Run the full test suite (regression check — this task adds no new pure logic, so no new tests, but confirm nothing broke)**

Run: `cd frontend && bun run test`
Expected: PASS — 38/38 (same count as before this task; no test files added or removed).

- [ ] **Step 9: Rebuild and redeploy the full Docker stack**

```bash
cd /Users/1mpuser/Desktop/tracker
docker compose up -d --build
docker compose ps
```

Expected: `postgres` healthy, `backend` and `frontend` running.

- [ ] **Step 10: Verify end-to-end in an actual browser**

This is a UI feature — verify it visually, not just via curl (curl only ever shows the pre-hydration loading shell for this client-fetched app, same as every other frontend task). At `http://localhost:4887`:

1. Confirm the 12-week heatmap's non-today cells show a pointer cursor and a cyan outline on hover; today's cell does not.
2. Click a past cell with some completed categories (or, if all cells are empty/fresh, click any past cell). Confirm the modal opens showing: the date, a read-only list of categories with ✓/blank marks, "YouTube: N мин", "День закрыт: да/нет", and the dailies list (plain text, strikethrough for done ones) — with NO interactive controls in this state.
3. Confirm a pencil icon is visible next to the × in the header. Click it — confirm the view content is replaced by the confirmation text and "Отмена"/"Редактировать" buttons.
4. Click "Отмена" — confirm it returns to the read-only view (not closes the modal).
5. Click the pencil again, then "Редактировать" — confirm the modal now shows the real interactive `SpheresPanel` (clickable switches) and `DailiesPanel` (add/toggle/delete, including the "из шаблонов" dropdown), plus the YouTube minutes block with `+10/+25/+50`/"сбросить".
6. Toggle a category switch — confirm it visually flips immediately, and toggle it back to leave the day's data as you found it.
7. Confirm the heatmap cell you opened changes color (or stays the same, if you toggled the same category back) live, without the modal closing, matching the current completion ratio.
8. Close the modal via Escape, then via the × button, then via clicking the dark overlay outside the panel — confirm all three close it.
9. Click the today cell — confirm nothing happens (no modal opens).

If a headless-browser tool (e.g. Playwright/Chromium) is available in this environment, drive this checklist automatically and take at least one screenshot of the read-only view and one of the edit view; otherwise perform it manually and report what you observed. Check the browser console for errors at each step — a page can render its shell while a fetch silently fails.

- [ ] **Step 11: Commit**

```bash
cd /Users/1mpuser/Desktop/tracker
git add frontend/components/CategoryHeatmap.tsx frontend/components/CategoryHeatmap.module.css frontend/components/StatsPanel.tsx frontend/components/DayDetailModal.tsx frontend/components/DayDetailModal.module.css frontend/components/Dashboard.tsx
git commit -m "feat(frontend): view and edit past days from the category heatmap"
```

---

## Definition of Done

- Clicking a non-today cell in the 12-week category heatmap opens a modal showing that day's data read-only.
- A pencil icon, gated behind an inline confirmation, unlocks editing of that day's categories, evening-closed flag, YouTube minutes, and dailies — reusing `SpheresPanel`/`DailiesPanel` unmodified.
- Edits persist (verified via the backend, which already supported arbitrary dates) and the heatmap cell recolors live without closing the modal.
- Today's cell and blank padding cells remain non-interactive.
- `bun run build` and `bun run test` (38/38) both pass.
- Full stack rebuilds and runs cleanly via `docker compose up -d --build`; verified end-to-end in a real browser.
