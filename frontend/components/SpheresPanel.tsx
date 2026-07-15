import styles from './SpheresPanel.module.css';
import type { CategoryView } from '@/types/api';

interface SpheresPanelProps {
  categories: CategoryView[];
  eveningClosed: boolean;
  onToggle: (key: string) => void;
  onToggleEveningClosed: () => void;
}

export default function SpheresPanel({
  categories,
  eveningClosed,
  onToggle,
  onToggleEveningClosed,
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
      <button type="button" className={styles.closeBtn} onClick={onToggleEveningClosed}>
        {eveningClosed ? 'День закрыт ✓ (отменить)' : 'Отметить день закрытым'}
      </button>
    </div>
  );
}
