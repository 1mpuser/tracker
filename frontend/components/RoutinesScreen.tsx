'use client';

import { useEffect, useState } from 'react';
import type { RoutinesWeek } from '@/types/api';
import { addRoutineLog, getRoutines, removeRoutineLog } from '@/lib/api';
import { isDoneOn, weekDays } from '@/lib/routines';
import { todayLocal } from '@/lib/date';
import styles from './RoutinesScreen.module.css';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function RoutinesScreen() {
  const [week, setWeek] = useState<RoutinesWeek | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const today = todayLocal();

  useEffect(() => {
    getRoutines().then(setWeek);
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
    </div>
  );
}
