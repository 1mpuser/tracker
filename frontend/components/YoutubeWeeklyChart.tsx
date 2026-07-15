'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import styles from './YoutubeWeeklyChart.module.css';
import type { YoutubeWeekStat } from '@/types/api';
import { getYoutubeWeeklyStats } from '@/lib/api';

const WEEKS = 8;

export default function YoutubeWeeklyChart() {
  const [stats, setStats] = useState<YoutubeWeekStat[] | null>(null);

  useEffect(() => {
    getYoutubeWeeklyStats(WEEKS).then(setStats);
  }, []);

  if (!stats || stats.length === 0) return null;
  const budget = stats[0].budget;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>YouTube по неделям</div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={stats} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={budget} stroke="var(--danger)" strokeDasharray="4 4" />
          <Bar dataKey="avgMinutes" fill="var(--accent2)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
