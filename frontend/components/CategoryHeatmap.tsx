import styles from './CategoryHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { categoryHeatmapColor, mondayOffset } from '@/lib/heatmap';

interface CategoryHeatmapProps {
  history: HistoryEntry[];
}

export default function CategoryHeatmap({ history }: CategoryHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];

  return (
    <div>
      <div className={styles.grid}>
        {cells.map((entry, i) =>
          entry ? (
            <div
              key={entry.date}
              className={styles.cell}
              style={{ background: categoryHeatmapColor(entry.completed, entry.total) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${
                entry.ytOver ? ', YouTube — перебор' : ''
              }`}
            >
              {entry.ytOver && <span className={styles.ytOver} />}
            </div>
          ) : (
            <div key={`blank-${i}`} className={styles.blank} />
          ),
        )}
      </div>
      <div className={styles.legend}>закрашено = доля закрытых сфер · красная черта = перебор по YouTube</div>
    </div>
  );
}
