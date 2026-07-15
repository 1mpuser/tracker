import styles from './CategoryHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { categoryHeatmapColor, mondayOffset } from '@/lib/heatmap';
import { todayLocal } from '@/lib/date';

interface CategoryHeatmapProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function CategoryHeatmap({ history, onSelectDate }: CategoryHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];
  const today = todayLocal();

  return (
    <div>
      <div className={styles.grid}>
        {cells.map((entry, i) => {
          if (!entry) return <div key={`blank-${i}`} className={styles.blank} />;
          const isToday = entry.date === today;
          return (
            <div
              key={entry.date}
              className={`${styles.cell} ${isToday ? '' : styles.clickable}`}
              style={{ background: categoryHeatmapColor(entry.completed, entry.total) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${
                entry.ytOver ? ', YouTube — перебор' : ''
              }`}
              onClick={isToday ? undefined : () => onSelectDate(entry.date)}
            >
              {entry.ytOver && <span className={styles.ytOver} />}
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>закрашено = доля закрытых сфер · красная черта = перебор по YouTube</div>
    </div>
  );
}
