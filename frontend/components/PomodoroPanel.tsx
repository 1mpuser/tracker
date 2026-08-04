import styles from './PomodoroPanel.module.css';
import { POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';
import { TomatoIcon } from './icons';

interface PomodoroPanelProps {
  count: number;
  onAdd: (delta: number) => void;
  onReset: () => void;
  onSyncSession?: () => void;
  syncing?: boolean;
  syncError?: string | null;
}

export default function PomodoroPanel({
  count,
  onAdd,
  onReset,
  onSyncSession,
  syncing = false,
  syncError = null,
}: PomodoroPanelProps) {
  const pct = Math.min(100, (count / POMODORO_OPT) * 100);
  const minMarkerPct = (POMODORO_MIN / POMODORO_OPT) * 100;
  const reachedMin = count >= POMODORO_MIN;
  const reachedOpt = count >= POMODORO_OPT;

  let barColor = 'var(--panel-alt)';
  if (reachedOpt) barColor = 'var(--fire-grad)';
  else if (reachedMin) barColor = 'var(--pom)';
  else if (count > 0) barColor = 'var(--pom-deep)';

  const countClass = reachedOpt ? styles.countOpt : reachedMin ? styles.countMin : styles.countLow;

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>
        <TomatoIcon className={styles.headingIcon} /> Помидорки
      </h2>
      <div className={styles.top}>
        <div className={`${styles.count} ${countClass}`}>
          {count}
          <span className={styles.of}> / {POMODORO_OPT}</span>
        </div>
        <div className={styles.actions}>
          {onSyncSession && (
            <button
              type="button"
              className={styles.linkAction}
              onClick={onSyncSession}
              disabled={syncing}
            >
              {syncing ? 'читаю…' : 'из Session'}
            </button>
          )}
          <span className={styles.reset} onClick={onReset}>
            сбросить
          </span>
        </div>
      </div>
      <div className={`${styles.bar} ${reachedOpt ? styles.barOpt : ''}`}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: barColor }} />
        <div className={styles.minMarker} style={{ left: `${minMarkerPct}%` }} />
      </div>
      <div className={styles.caption}>
        минимум {POMODORO_MIN} · оптимум {POMODORO_OPT}
      </div>
      {syncError && <div className={styles.syncError}>{syncError}</div>}
      <div className={styles.buttons}>
        <button type="button" onClick={() => onAdd(1)}>
          +1
        </button>
        <button type="button" onClick={() => onAdd(-1)}>
          −1
        </button>
      </div>
    </div>
  );
}
