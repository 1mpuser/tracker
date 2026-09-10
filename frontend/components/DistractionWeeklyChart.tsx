'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import styles from './DistractionWeeklyChart.module.css';
import type { DistractionWeekStat } from '@/types/api';
import { getDistractionWeeklyStats } from '@/lib/api';

const WEEKS = 8;

interface DistractionWeeklyChartProps {
  label: string;
}

export default function DistractionWeeklyChart({ label }: DistractionWeeklyChartProps) {
  const [stats, setStats] = useState<DistractionWeekStat[] | null>(null);

  useEffect(() => {
    getDistractionWeeklyStats(WEEKS).then(setStats);
  }, []);

  if (!stats || stats.length === 0) return null;
  const budget = stats[0].budget;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>{label} по неделям</div>
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
