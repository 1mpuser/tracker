import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import styles from './RatingChart.module.css';
import type { HistoryEntry } from '@/types/api';

interface RatingChartProps {
  history: HistoryEntry[];
}

const DAYS = 30;

export default function RatingChart({ history }: RatingChartProps) {
  const data = history.slice(-DAYS);
  if (data.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Оценка дня · {DAYS} дней</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            domain={[1, 10]}
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--accent)' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
