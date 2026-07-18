import styles from './PomodoroPanel.module.css';
import { POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';

interface PomodoroPanelProps {
  count: number;
  streakMin: number;
  streakOpt: number;
  onAdd: (delta: number) => void;
  onReset: () => void;
}

export default function PomodoroPanel({ count, streakMin, streakOpt, onAdd, onReset }: PomodoroPanelProps) {
  const pct = Math.min(100, (count / POMODORO_OPT) * 100);
  const minMarkerPct = (POMODORO_MIN / POMODORO_OPT) * 100;
  const reachedMin = count >= POMODORO_MIN;
  const reachedOpt = count >= POMODORO_OPT;

  let barColor = 'var(--panel-alt)';
  if (reachedOpt) barColor = 'var(--accent)';
  else if (reachedMin) barColor = 'rgba(224, 164, 88, 0.6)';
  else if (count > 0) barColor = 'var(--accent-soft)';

  const countClass = reachedOpt ? styles.countOpt : reachedMin ? styles.countMin : styles.countLow;

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Помидорки</h2>
      <div className={styles.top}>
        <div className={`${styles.count} ${countClass}`}>
          {count}
          <span className={styles.of}> / {POMODORO_OPT}</span>
        </div>
        <span className={styles.reset} onClick={onReset}>
          сбросить
        </span>
      </div>
      <div className={styles.bar}>
        <div
          className={`${styles.barFill} ${reachedOpt ? styles.barFillOpt : ''}`}
          style={{ width: `${pct}%`, background: barColor }}
        />
        <div className={styles.minMarker} style={{ left: `${minMarkerPct}%` }} />
      </div>
      <div className={styles.caption}>
        минимум {POMODORO_MIN} · оптимум {POMODORO_OPT}
      </div>
      <div className={styles.buttons}>
        <button type="button" onClick={() => onAdd(1)}>
          +1
        </button>
        <button type="button" onClick={() => onAdd(-1)}>
          −1
        </button>
      </div>
      <div className={styles.streaks}>
        <span className={`${styles.streakMin} ${streakMin > 0 ? styles.streakMinOn : ''}`}>
          серия ≥{POMODORO_MIN}: {streakMin}
        </span>
        <span className={`${styles.streakOpt} ${streakOpt > 0 ? styles.streakOptGlow : ''}`}>
          ≥{POMODORO_OPT}: {streakOpt}
        </span>
      </div>
    </div>
  );
}
