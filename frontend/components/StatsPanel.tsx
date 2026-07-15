import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import StreakHeatmap from './StreakHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';
import YoutubeDailyHeatmap from './YoutubeDailyHeatmap';
import RatingChart from './RatingChart';

interface StatsPanelProps {
  history: HistoryEntry[];
  onSelectDate: (date: string) => void;
}

export default function StatsPanel({ history, onSelectDate }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} onSelectDate={onSelectDate} />
      <StreakHeatmap history={history} onSelectDate={onSelectDate} />
      <CategoryBars />
      <YoutubeWeeklyChart />
      <YoutubeDailyHeatmap />
      <RatingChart history={history} />
    </div>
  );
}
