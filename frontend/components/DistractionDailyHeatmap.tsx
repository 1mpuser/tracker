'use client';

import { useEffect, useState } from 'react';
import styles from './DistractionDailyHeatmap.module.css';
import type { DistractionDayStat } from '@/types/api';
import { getDistractionDailyStats } from '@/lib/api';
import { distractionHeatmapColor } from '@/lib/heatmap';

const DAYS = 30;

interface DistractionDailyHeatmapProps {
  label: string;
}

export default function DistractionDailyHeatmap({ label }: DistractionDailyHeatmapProps) {
  const [stats, setStats] = useState<DistractionDayStat[] | null>(null);

  useEffect(() => {
    getDistractionDailyStats(DAYS).then(setStats);
  }, []);

  if (!stats || stats.length === 0) return null;

  const budget = stats[0].budget;
  const avg = stats.reduce((sum, s) => sum + s.minutes, 0) / stats.length;
  const barPct = budget > 0 ? Math.min(100, (avg / budget) * 100) : 0;
  let barColor = 'var(--distraction)';
  if (avg > budget) barColor = 'var(--pom)';

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>{label} · хитмеп · {DAYS} дней</div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${barPct}%`, background: barColor }} />
      </div>
      <div className={styles.avgLabel}>
        {Math.round(avg * 10) / 10} / {budget} мин/день · {DAYS} дней
      </div>
      <div className={styles.grid}>
        {stats.map((s) => (
          <div
            key={s.date}
            className={styles.cell}
            style={{ background: distractionHeatmapColor(s.minutes, s.budget) }}
            title={`${s.date}: ${s.minutes} мин (${s.pct}% от бюджета)`}
          />
        ))}
      </div>
    </div>
  );
}
