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
  let barColor = 'var(--yt)';
  if (minutes > budget) barColor = 'var(--pom)';

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
