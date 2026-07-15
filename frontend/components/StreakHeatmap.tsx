import styles from './StreakHeatmap.module.css';
import type { HistoryEntry } from '@/types/api';
import { mondayOffset, thresholdHeatmapColor } from '@/lib/heatmap';
import { todayUTC } from '@/lib/date';
import { STREAK_THRESHOLD } from '@/lib/streak';

interface StreakHeatmapProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function StreakHeatmap({ history, onSelectDate }: StreakHeatmapProps) {
  if (history.length === 0) return null;
  const leadingBlanks = mondayOffset(history[0].date);
  const cells: (HistoryEntry | null)[] = [...Array(leadingBlanks).fill(null), ...history];
  const today = todayUTC();
  const metCount = history.filter((h) => h.completed >= STREAK_THRESHOLD).length;
  const pct = Math.round((metCount / history.length) * 100);

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Дни с {STREAK_THRESHOLD}+ сферами</div>
      <div className={styles.grid}>
        {cells.map((entry, i) => {
          if (!entry) return <div key={`blank-${i}`} className={styles.blank} />;
          const isToday = entry.date === today;
          const met = entry.completed >= STREAK_THRESHOLD;
          return (
            <div
              key={entry.date}
              className={`${styles.cell} ${isToday ? '' : styles.clickable}`}
              style={{ background: thresholdHeatmapColor(entry.completed, STREAK_THRESHOLD) }}
              title={`${entry.date}: ${entry.completed}/${entry.total} сфер${met ? ' — засчитан в серию' : ''}`}
              onClick={isToday ? undefined : () => onSelectDate(entry.date)}
            />
          );
        })}
      </div>
      <div className={styles.legend}>
        {metCount} из {history.length} дней с {STREAK_THRESHOLD}+ сферами ({pct}%)
      </div>
    </div>
  );
}
