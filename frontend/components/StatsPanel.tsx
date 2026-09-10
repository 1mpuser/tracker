import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import StreakHeatmap from './StreakHeatmap';
import CategoryBars from './CategoryBars';
import DistractionWeeklyChart from './DistractionWeeklyChart';
import DistractionDailyHeatmap from './DistractionDailyHeatmap';
import PomodoroHeatmap from './PomodoroHeatmap';
import RatingChart from './RatingChart';

interface StatsPanelProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
  distractionLabel: string;
}

export default function StatsPanel({ history, onSelectDate, distractionLabel }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      {/* Heatmaps in focus order: залипание (главный фокус) → помидорки → 2+ сфер */}
      <DistractionDailyHeatmap label={distractionLabel} />
      <PomodoroHeatmap history={history} />
      <StreakHeatmap history={history} onSelectDate={onSelectDate} />
      <CategoryHeatmap history={history} onSelectDate={onSelectDate} distractionLabel={distractionLabel} />
      <CategoryBars />
      <DistractionWeeklyChart label={distractionLabel} />
      <RatingChart history={history} />
    </div>
  );
}
