'use client';

import { useEffect, useState } from 'react';
import type { Category, RoutineHistoryWeek, RoutinesWeek } from '@/types/api';
import { addRoutineLog, archiveRoutine, createRoutine, getCategories, getRoutines, getRoutinesHistory, removeRoutineLog, updateRoutine } from '@/lib/api';
import { isDoneOn, routineRatioColor, weekDays } from '@/lib/routines';
import { todayLocal } from '@/lib/date';
import styles from './RoutinesScreen.module.css';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function RoutinesScreen() {
  const [week, setWeek] = useState<RoutinesWeek | null>(null);
  const [history, setHistory] = useState<RoutineHistoryWeek[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState(3);
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const today = todayLocal();

  useEffect(() => {
    getRoutines().then(setWeek);
    getCategories().then(setCategories);
    getRoutinesHistory().then(setHistory);
  }, []);

  async function toggle(routineId: number, date: string, done: boolean) {
    if (busy !== null) return;
    setBusy(routineId);
    try {
      setWeek(done ? await removeRoutineLog(routineId, date) : await addRoutineLog(routineId, date));
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    setWeek(await getRoutines());
    setHistory(await getRoutinesHistory());
  }

  async function add() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setAddError(null);
    const goal = Math.min(7, Math.max(1, Math.round(newGoal) || 1));
    try {
      await createRoutine(trimmed, goal, newCategoryId);
      setNewTitle('');
      setNewGoal(3);
      setNewCategoryId(null);
      await reload();
    } catch {
      setAddError('Не удалось добавить рутину');
    }
  }

  async function patch(id: number, p: { title?: string; weeklyGoal?: number; categoryId?: number | null }) {
    await updateRoutine(id, p);
    await reload();
  }

  async function archive(id: number) {
    await archiveRoutine(id);
    await reload();
  }

  if (!week) return <div className={styles.empty}>загрузка…</div>;

  const days = weekDays(week.weekStart);

  return (
    <div className={styles.screen}>
      {week.routines.length === 0 && (
        <div className={styles.empty}>Рутин пока нет — заведи первую ниже.</div>
      )}

      {week.routines.map((r) => {
        const doneToday = isDoneOn(r, today);
        return (
          <div key={r.id} className={styles.row}>
            <div className={styles.title}>{r.title}</div>

            <div className={styles.dots}>
              {days.map((d, i) => {
                const filled = isDoneOn(r, d);
                const future = d > today;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.dot} ${filled ? styles.dotFilled : ''}`}
                    disabled={future || busy !== null}
                    title={`${DAY_LABELS[i]} ${d}`}
                    aria-label={`${r.title}, ${DAY_LABELS[i]}`}
                    onClick={() => toggle(r.id, d, filled)}
                  />
                );
              })}
            </div>

            <div className={`${styles.count} ${r.done >= r.weeklyGoal ? styles.countDone : ''}`}>
              {r.done}/{r.weeklyGoal}
            </div>

            <button
              type="button"
              className={styles.markBtn}
              disabled={busy !== null}
              onClick={() => toggle(r.id, today, doneToday)}
            >
              {doneToday ? '✓ отмечено' : '+ отметить сегодня'}
            </button>
          </div>
        );
      })}

      {history.length > 0 && week.routines.length > 0 && (
        <div className={styles.history}>
          <div className={styles.historyTitle}>Последние {history.length} недель</div>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.historyRow}>
              <div className={styles.historyName}>{r.title}</div>
              <div className={styles.dots}>
                {history.map((w) => {
                  const item = w.items.find((i) => i.routineId === r.id);
                  const done = item?.done ?? 0;
                  const goal = item?.weeklyGoal ?? r.weeklyGoal;
                  return (
                    <span
                      key={w.weekStart}
                      className={styles.weekCell}
                      style={{ background: routineRatioColor(done, goal) }}
                      title={`неделя с ${w.weekStart}: ${done}/${goal}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={styles.settingsToggle} onClick={() => setSettingsOpen(!settingsOpen)}>
        {settingsOpen ? 'Свернуть настройку' : 'Настроить рутины'}
      </button>

      {settingsOpen && (
        <div className={styles.settings}>
          {week.routines.map((r) => (
            <div key={r.id} className={styles.settingsRow}>
              <input
                className={styles.settingsInput}
                defaultValue={r.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== r.title) patch(r.id, { title: v });
                }}
              />
              <label className={styles.settingsLabel}>
                норма
                <input
                  type="number"
                  min={1}
                  max={7}
                  className={styles.settingsNumber}
                  defaultValue={r.weeklyGoal}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 7 && v !== r.weeklyGoal) patch(r.id, { weeklyGoal: v });
                  }}
                />
              </label>
              <select
                className={styles.settingsSelect}
                value={r.categoryId ?? ''}
                onChange={(e) => patch(r.id, { categoryId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">без сферы</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <button type="button" className={styles.archiveBtn} onClick={() => archive(r.id)}>
                в архив
              </button>
            </div>
          ))}

          <div className={styles.settingsRow}>
            <input
              className={styles.settingsInput}
              placeholder="Новая рутина…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <label className={styles.settingsLabel}>
              норма
              <input
                type="number"
                min={1}
                max={7}
                className={styles.settingsNumber}
                value={newGoal}
                onChange={(e) => setNewGoal(Number(e.target.value))}
              />
            </label>
            <select
              className={styles.settingsSelect}
              value={newCategoryId ?? ''}
              onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">без сферы</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button type="button" className={styles.markBtn} onClick={add}>
              добавить
            </button>
          </div>

          {addError && <div className={styles.empty}>{addError}</div>}
        </div>
      )}
    </div>
  );
}
