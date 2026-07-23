# GTD мост B2 — frontend-переделка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести фронтенд на новую модель: «Задачи на сегодня» = срез GTD (`day.today`), быстрый ввод создаёт GTD-пункт на сегодня, вкладка «Задачи» и панель `DailyTask` удаляются, модалка дня показывает GTD-пункты дня, GTD-экран получает «взять/убрать в сегодня».

**Architecture:** Backend (план B1) уже отдаёт `DayView.today: GtdItem[]` и удалил dailies-эндпоинты. Фронт сейчас сломан по типам. Task 1 — атомарный своп (типы + api + `TodayPanel` + `Dashboard` + `DayDetailModal` + удаление `TasksScreen`/`DailiesPanel`), после которого сборка снова зелёная. Task 2 — аддитивные действия «в сегодня» на GTD-экране.

**Tech Stack:** Next.js App Router + React, Bun, Jest. Спека: `docs/superpowers/specs/2026-07-23-gtd-bridge-design.md`.

## Global Constraints

- Рантайм — **Bun** (`bunx jest`, `bun run build`).
- CSS-модули — только дизайн-токены из `app/globals.css` (`--panel`, `--panel-alt`, `--border`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--accent-soft`, `--radius`, `--hair`, `--elev`, `--font-mono`, `--bg`). Хардкод цветов и UI-кит запрещены.
- Компоненты юнит-тестами не покрываются — их гейт `bun run build`; логика `lib/` покрыта в `api.spec.ts`.
- Задачи «сегодня» — это `GtdItem`: `done` = `status==='done'`, галочка тоглит `done↔backlog`; «убрать из сегодня» = `plannedDate=null`.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** ветка `feat/gtd-bridge` с готовым B1 (backend отдаёт `DayView.today`). Команды — из `frontend/`.

---

### Task 1: Атомарный своп фронта на `day.today` (типы + api + TodayPanel + Dashboard + DayDetailModal, удаление TasksScreen/DailiesPanel)

**Files:**
- Modify: `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/lib/api.spec.ts`
- Create: `frontend/components/TodayPanel.tsx`, `frontend/components/TodayPanel.module.css`
- Modify: `frontend/components/Dashboard.tsx`, `frontend/components/DayDetailModal.tsx`
- Delete: `frontend/components/TasksScreen.tsx`, `frontend/components/TasksScreen.module.css`, `frontend/components/DailiesPanel.tsx`, `frontend/components/DailiesPanel.module.css`

**Interfaces:**
- Consumes: `DayView.today: GtdItem[]` (backend B1), `POST /gtd/items/today`, `PATCH /gtd/items/:id` (`plannedDate`/`status`).
- Produces: `planForToday(title, date)`; `DayView.today`; `GtdItem.plannedDate`; `TodayPanel`. Removed: `DailyTaskView`, `CarryCandidate`, `TaskOverviewItem`, `addDaily`, `updateDaily`, `deleteDaily`, `getAllTasks`, `getCarryCandidates`, `carryDailies`, `TasksScreen`, `DailiesPanel`.

- [ ] **Step 1: Обновить типы (`types/api.ts`)**

- В `GtdItem` добавить поле (после `waitingFor`):
```ts
  plannedDate: string | null;
```
- В `DayView` заменить `dailies: DailyTaskView[];` на:
```ts
  today: GtdItem[];
```
- Удалить интерфейсы `DailyTaskView`, `CarryCandidate`, `TaskOverviewItem` целиком.

Примечание: `DayView` теперь ссылается на `GtdItem` — он объявлен ниже в этом же файле, порядок объявления для TS-интерфейсов не важен.

- [ ] **Step 2: Обновить api-клиент (`lib/api.ts`)**

- В блоке `import type { … }` убрать `CarryCandidate`, `DailyTaskView`, `TaskOverviewItem`.
- Удалить функции `addDaily`, `updateDaily`, `deleteDaily`, `getAllTasks`, `getCarryCandidates`, `carryDailies` (строки с этими экспортами).
- В `updateGtdItem` расширить `Pick` полем `plannedDate`:
```ts
export function updateGtdItem(
  id: number,
  patch: Partial<Pick<GtdItem, 'title' | 'notes' | 'status' | 'scheduledDate' | 'waitingFor' | 'plannedDate'>>,
): Promise<GtdItem> {
  return request(`/gtd/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
```
- Добавить (рядом с gtd-функциями):
```ts
export function planForToday(title: string, date: string): Promise<GtdItem> {
  return request(`/gtd/items/today`, { method: 'POST', body: JSON.stringify({ title, date }) });
}
```

- [ ] **Step 3: Обновить тест api (`lib/api.spec.ts`)**

- Удалить тест `it('fetches all tasks from the /tasks endpoint', …)` (он про удалённый `getAllTasks`) и убрать `getAllTasks` из строки импорта, если он там есть.
- Добавить внутрь `describe('api request helper', …)` тест:
```ts
it('creates a today gtd item via POST /gtd/items/today', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }) as unknown as typeof fetch;

  const { planForToday } = await import('./api');
  await planForToday('Сделать презу', '2026-07-23');

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:3001/gtd/items/today',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Сделать презу', date: '2026-07-23' }) }),
  );
});
```
(если в шапке файла уже есть статический импорт из `./api`, можно добавить `planForToday` туда и вызвать напрямую вместо `await import`.)

- [ ] **Step 4: Создать `TodayPanel.tsx`**

Create `frontend/components/TodayPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { GtdItem, TaskTemplate } from '@/types/api';
import { getTaskTemplates } from '@/lib/api';
import styles from './TodayPanel.module.css';

interface TodayPanelProps {
  items: GtdItem[];
  onAdd: (title: string) => void;
  onToggleDone: (item: GtdItem) => void;
  onRemove: (id: number) => void;
}

export default function TodayPanel({ items, onAdd, onToggleDone, onRemove }: TodayPanelProps) {
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
        {items.length === 0 && (
          <li className={styles.empty}>Пусто — возьми что-нибудь из Бэклога (вкладка GTD) или добавь задачу.</li>
        )}
        {items.map((item) => {
          const done = item.status === 'done';
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={`${styles.check} ${done ? styles.checkDone : ''}`}
                onClick={() => onToggleDone(item)}
                aria-label={item.title}
              >
                {done ? '✓' : ''}
              </button>
              <span className={`${styles.text} ${done ? styles.textDone : ''}`} onClick={() => onToggleDone(item)}>
                {item.title}
              </span>
              {item.status === 'calendar' && item.scheduledDate && (
                <span className={styles.cal}>📅 {item.scheduledDate}</span>
              )}
              <span className={styles.del} onClick={() => onRemove(item.id)}>
                ×
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Создать `TodayPanel.module.css`**

Create `frontend/components/TodayPanel.module.css`:

```css
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 18px 20px;
  box-shadow: inset 0 1px 0 var(--hair), var(--elev);
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
  border-color: var(--accent);
}

.addBtn {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 6px;
  padding: 0 14px;
  font-size: 13px;
  cursor: pointer;
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
  border-color: var(--accent);
  color: var(--accent);
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

.cal {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
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

- [ ] **Step 6: Переписать `Dashboard.tsx`**

Заменить весь файл `frontend/components/Dashboard.tsx` на:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, GtdItem, HistoryEntry, Settings } from '@/types/api';
import {
  getDay,
  getHistory,
  getSettings,
  planForToday,
  setCategoryDone,
  updateDay,
  updateGtdItem,
  updatePomodoros,
  updateSettings,
  updateYoutube,
} from '@/lib/api';
import { formatDisplayDate, todayLocal } from '@/lib/date';
import { isEveningWindow, isMorningWindow } from '@/lib/notifications';
import { computeStreak } from '@/lib/streak';
import { computePomodoroStreak, POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import TodayPanel from './TodayPanel';
import YoutubePanel from './YoutubePanel';
import PomodoroPanel from './PomodoroPanel';
import StatsPanel from './StatsPanel';
import SettingsModal from './SettingsModal';
import DayDetailModal from './DayDetailModal';
import GtdScreen from './GtdScreen';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

const TABS = [
  { key: 'home', label: 'Главный' },
  { key: 'gtd', label: 'GTD' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Dashboard() {
  const [date, setDate] = useState(() => todayLocal());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT, date), getSettings()]);
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
    function checkDateRollover() {
      const current = todayLocal();
      if (current !== date) setDate(current);
    }
    const interval = setInterval(checkDateRollover, 60 * 1000);
    document.addEventListener('visibilitychange', checkDateRollover);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', checkDateRollover);
    };
  }, [date]);

  useEffect(() => {
    if (!settings?.notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const check = () => {
      const now = new Date();
      if (isMorningWindow(now) && day && day.today.length === 0) {
        new Notification('Ещё не занёс задачи на сегодня');
      }
      if (isEveningWindow(now) && day && !day.eveningClosed) {
        new Notification('Отметь сферы за сегодня и закрой день');
      }
      if (isEveningWindow(now) && day && day.pomodoros < POMODORO_MIN) {
        new Notification(`Помидорки за день: ${day.pomodoros}/${POMODORO_MIN} — добей минимум`);
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
    setHistory(await getHistory(HISTORY_LIMIT, date));
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
    setDay(await updateDay(date, { eveningClosed: !day.eveningClosed }));
  }

  async function changeRating(rating: number) {
    setDay(await updateDay(date, { rating }));
    refreshHistory();
  }

  async function changeComment(comment: string) {
    setDay(await updateDay(date, { comment }));
  }

  async function addToday(title: string) {
    await planForToday(title, date);
    await refreshDay();
  }

  async function toggleTodayDone(item: GtdItem) {
    await updateGtdItem(item.id, { status: item.status === 'done' ? 'backlog' : 'done' });
    await refreshDay();
  }

  async function removeFromToday(id: number) {
    await updateGtdItem(id, { plannedDate: null });
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

  async function addPomodoro(delta: number) {
    setDay(await updatePomodoros(date, { delta }));
    refreshHistory();
  }

  async function resetPomodoro() {
    setDay(await updatePomodoros(date, { reset: true }));
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

  const todayCompleted = day.categories.filter((c) => c.done).length;
  const streak = computeStreak(history, { date, completed: todayCompleted });
  const pomodoroStreakMin = computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_MIN);
  const pomodoroStreakOpt = computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_OPT);
  const notificationsActive =
    settings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <nav className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className={styles.sysHint}>sys / daily-tracker</span>
      </div>

      {activeTab === 'home' && (
        <>
          <Header
            dateLabel={formatDisplayDate(date)}
            streak={streak}
            pomodoroStreakMin={pomodoroStreakMin}
            pomodoroStreakOpt={pomodoroStreakOpt}
            notificationsEnabled={notificationsActive}
            onEnableNotifications={enableNotifications}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className={styles.grid}>
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
            <TodayPanel
              items={day.today}
              onAdd={addToday}
              onToggleDone={toggleTodayDone}
              onRemove={removeFromToday}
            />
            <YoutubePanel
              minutes={day.youtubeMinutes}
              budget={settings.youtubeBudget}
              onAdd={addYoutubeMinutes}
              onReset={resetYoutube}
              onBudgetChange={changeYoutubeBudget}
            />
            <PomodoroPanel count={day.pomodoros} onAdd={addPomodoro} onReset={resetPomodoro} />
          </div>
          <StatsPanel history={history} onSelectDate={setSelectedDate} />
        </>
      )}

      {activeTab === 'gtd' && <GtdScreen />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onCategoriesChanged={refreshDay} />}
      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} onDataChanged={refreshHistory} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Обновить `DayDetailModal.tsx`**

- Заменить строку импорта из `@/lib/api` на (убрать daily/carry, оставить остальное):
```ts
import { getDay, setCategoryDone, updateDay, updatePomodoros, updateYoutube } from '@/lib/api';
```
- Удалить строку `import DailiesPanel from './DailiesPanel';`.
- Удалить методы `addDailyTask`, `toggleDaily`, `deleteDailyTask`, `carryDailyTasks` целиком.
- В `stage === 'view'`: заменить блок dailies-секции. Было:
```tsx
            <div className={styles.section}>
              {day.dailies.length === 0 && <div className={styles.viewEmpty}>Задач не было</div>}
              {day.dailies.map((t) => (
                <div key={t.id} className={`${styles.viewTask} ${t.done ? styles.viewTaskDone : ''}`}>
                  {t.text}
                </div>
              ))}
            </div>
```
Стало:
```tsx
            <div className={styles.section}>
              {day.today.length === 0 && <div className={styles.viewEmpty}>Задач не было</div>}
              {day.today.map((t) => (
                <div key={t.id} className={`${styles.viewTask} ${t.status === 'done' ? styles.viewTaskDone : ''}`}>
                  {t.title}
                </div>
              ))}
            </div>
```
- В `stage === 'edit'`: удалить блок `<DailiesPanel … />` целиком (правка задач прошлого дня убирается; задачи видны только в `view`).

- [ ] **Step 8: Удалить `TasksScreen` и `DailiesPanel`**

```bash
rm frontend/components/TasksScreen.tsx frontend/components/TasksScreen.module.css \
   frontend/components/DailiesPanel.tsx frontend/components/DailiesPanel.module.css
```

- [ ] **Step 9: Сборка + тесты**

Run (из `frontend/`):
```bash
bunx jest api.spec.ts
bun run build
```
Expected: `api.spec.ts` — PASS (включая новый `planForToday`, без `getAllTasks`); `bun run build` — чисто, никаких ссылок на удалённое (`DailyTaskView`/`DailiesPanel`/`TasksScreen`/`getAllTasks` и т.д.).

Также прогнать весь фронт-сьют — `bunx jest` → зелёный.

- [ ] **Step 10: Коммит**

```bash
git add -A frontend
git commit -m "feat(frontend): Today panel = GTD slice; retire DailyTask UI + Tasks tab"
```

---

### Task 2: GTD-экран — действия «в сегодня» / «убрать из сегодня»

**Files:**
- Modify: `frontend/components/GtdScreen.tsx`, `frontend/components/GtdScreen.module.css`

**Interfaces:**
- Consumes: `updateGtdItem` (`plannedDate`), `todayLocal` из `@/lib/date`, `GtdItem`.
- Produces: у пунктов действие «☀ в сегодня» (ставит `plannedDate=сегодня`) или «убрать» (если `plannedDate=сегодня`).

- [ ] **Step 1: Добавить действие в `GtdScreen.tsx`**

- Добавить импорт:
```tsx
import { todayLocal } from '@/lib/date';
```
- Внутри компонента (рядом с `move`/`remove`) добавить:
```tsx
async function planToday(id: number) {
  await updateGtdItem(id, { plannedDate: todayLocal() });
  await reload();
  if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
}

async function unplan(id: number) {
  await updateGtdItem(id, { plannedDate: null });
  await reload();
  if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
}
```
- В блоке `<span className={styles.actions}>` (для НЕ-inbox базового списка) добавить кнопку «в сегодня»/«убрать», перед кнопкой «Удалить». Показывать её только для статусов, которые имеет смысл планировать (`backlog`, `someday`, `calendar`):
```tsx
              {(item.status === 'backlog' || item.status === 'someday' || item.status === 'calendar') && (
                item.plannedDate === todayLocal() ? (
                  <button type="button" onClick={() => unplan(item.id)} title="Убрать из сегодня">
                    ☀×
                  </button>
                ) : (
                  <button type="button" onClick={() => planToday(item.id)} title="В сегодня">
                    ☀
                  </button>
                )
              )}
```
(`item.plannedDate` — новое поле `GtdItem`, добавлено в Task 1.)

- [ ] **Step 2: Сборка**

Run (из `frontend/`): `bun run build`
Expected: чисто.

- [ ] **Step 3: Ручная проверка (после пересборки стека контроллером)**

Открыть http://localhost:4887. Проверить:
- «Главный» → панель «Задачи на сегодня» показывает GTD-срез; добавление создаёт пункт (виден и в GTD-Бэклоге с `plannedDate`); галочка → зачёркнут, снятие → назад; × убирает из сегодня (остаётся в Бэклоге).
- «GTD» → у пункта Бэклога кнопка «☀ в сегодня» → появляется на «Главном»; «☀×» убирает.
- Календарный пункт на сегодня виден на «Главном» с 📅.
- Таб «Задачи» отсутствует; таб-бар `Главный` · `GTD`.
- Клик по дню в статистике → модалка показывает задачи дня (GTD-пункты) в просмотре.

- [ ] **Step 4: Коммит**

```bash
git add frontend/components/GtdScreen.tsx frontend/components/GtdScreen.module.css
git commit -m "feat(frontend): GTD screen — take into / remove from today (plannedDate)"
```

---

## Self-Review

**Spec coverage:**
- `day.today` на Главном вместо `DailyTask`, быстрый ввод = GTD-пункт на сегодня, галочка `done↔backlog`, × = убрать из сегодня → Task 1 (`TodayPanel`+`Dashboard`). ✅
- Удаление панели `DailyTask`/переноса и вкладки «Задачи» (`TasksScreen`) + мёртвых типов/api → Task 1. ✅
- `plannedDate` в `GtdItem`/`updateGtdItem`, `planForToday` → Task 1. ✅
- Модалка дня показывает GTD-пункты дня (read-only) → Task 1 Step 7. ✅
- «Взять/убрать в сегодня» на GTD-экране → Task 2. ✅
- Календарные-на-сегодня видны на Главном (📅) → Task 1 (`TodayPanel` рендер по `day.today`, который бэкенд наполняет календарными). ✅
- Вне объёма (сферы/YouTube/помидорки/стрики, шаблоны-менеджмент, Этап C) — не трогается. ✅

**Placeholder scan:** полный код/команды в каждом шаге; «было/стало» правки в Steps 2/7 приводят точные целевые блоки.

**Type consistency:** `DayView.today: GtdItem[]` (Task 1 типы) потребляется в `Dashboard`/`DayDetailModal`/`TodayPanel` как `GtdItem[]`. `GtdItem.plannedDate: string|null` добавлен и используется в `updateGtdItem` Pick, `TodayPanel` (нет), `GtdScreen` (Task 2). `planForToday(title,date)` совпадает в api и вызове `addToday`. Удаляемые символы (`DailyTaskView`/`CarryCandidate`/`TaskOverviewItem`/`addDaily`/`updateDaily`/`deleteDaily`/`getAllTasks`/`getCarryCandidates`/`carryDailies`/`DailiesPanel`/`TasksScreen`) вычищены из всех потребителей в Task 1.
