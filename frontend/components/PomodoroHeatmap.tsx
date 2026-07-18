'use client';

import styles from './PomodoroHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { pomodoroHeatmapColor } from '@/lib/heatmap';
import { POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';

const DAYS = 30;

interface PomodoroHeatmapProps {
  history: HistoryEntry[];
}

export default function PomodoroHeatmap({ history }: PomodoroHeatmapProps) {
  if (history.length === 0) return null;
  const recent = history.slice(-DAYS);
  const minDays = recent.filter((h) => h.pomodoros >= POMODORO_MIN).length;
  const optDays = recent.filter((h) => h.pomodoros >= POMODORO_OPT).length;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Помидорки · {recent.length} дней</div>
      <div className={styles.grid}>
        {recent.map((h) => (
          <div
            key={h.date}
            className={`${styles.cell} ${h.pomodoros >= POMODORO_OPT ? styles.optimum : ''}`}
            style={{ background: pomodoroHeatmapColor(h.pomodoros, POMODORO_MIN, POMODORO_OPT) }}
            title={`${h.date}: ${h.pomodoros} помидорок`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        ≥{POMODORO_MIN}: {minDays}/{recent.length} дней · ≥{POMODORO_OPT}: {optDays}/{recent.length} дней
      </div>
    </div>
  );
}
