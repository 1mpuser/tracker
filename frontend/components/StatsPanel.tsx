import styles from './StatsPanel.module.css';
import type { HistoryEntry } from '@/types/api';
import CategoryHeatmap from './CategoryHeatmap';
import CategoryBars from './CategoryBars';
import YoutubeWeeklyChart from './YoutubeWeeklyChart';

interface StatsPanelProps {
  history: HistoryEntry[];
}

export default function StatsPanel({ history }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Статистика</h2>
      <CategoryHeatmap history={history} />
      <CategoryBars />
      <YoutubeWeeklyChart />
    </div>
  );
}
