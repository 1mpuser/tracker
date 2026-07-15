import styles from './SpheresPanel.module.css';
import type { CategoryView } from '@/types/api';
import DayRatingBlock from './DayRatingBlock';

interface SpheresPanelProps {
  categories: CategoryView[];
  eveningClosed: boolean;
  rating: number | null;
  comment: string | null;
  onToggle: (key: string) => void;
  onToggleEveningClosed: () => void;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
}

export default function SpheresPanel({
  categories,
  eveningClosed,
  rating,
  comment,
  onToggle,
  onToggleEveningClosed,
  onRatingChange,
  onCommentChange,
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
      <DayRatingBlock
        rating={rating}
        comment={comment}
        onRatingChange={onRatingChange}
        onCommentChange={onCommentChange}
      />
      <button type="button" className={styles.closeBtn} onClick={onToggleEveningClosed}>
        {eveningClosed ? 'День закрыт ✓ (отменить)' : 'Отметить день закрытым'}
      </button>
    </div>
  );
}
