'use client';

import { useEffect, useState } from 'react';
import styles from './CategoryBars.module.css';
import type { CategoryStat } from '@/types/api';
import { getCategoryStats } from '@/lib/api';

const DAYS = 30;

export default function CategoryBars() {
  const [stats, setStats] = useState<CategoryStat[] | null>(null);

  useEffect(() => {
    getCategoryStats(DAYS).then(setStats);
  }, []);

  if (!stats) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Разбивка по категориям · {DAYS} дней</div>
      {stats.map((s) => (
        <div key={s.key} className={styles.row}>
          <span className={styles.label}>{s.label}</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${s.pct}%` }} />
          </div>
          <span className={styles.pct}>{s.pct}%</span>
        </div>
      ))}
    </div>
  );
}
