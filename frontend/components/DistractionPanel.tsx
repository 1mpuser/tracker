import styles from './DistractionPanel.module.css';

interface DistractionPanelProps {
  minutes: number;
  budget: number;
  label: string;
  onAdd: (delta: number) => void;
  onReset: () => void;
  onBudgetChange: (value: number) => void;
}

export default function DistractionPanel({
  minutes,
  budget,
  label,
  onAdd,
  onReset,
  onBudgetChange,
}: DistractionPanelProps) {
  const pct = budget > 0 ? Math.min(100, (minutes / budget) * 100) : 0;
  let barColor = 'var(--distraction)';
  if (minutes > budget) barColor = 'var(--pom)';

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{label}</h2>
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
        Здесь только то, что занесено вручную. Точные цифры — в «Экранном времени» телефона и компьютера.
      </div>
    </div>
  );
}
