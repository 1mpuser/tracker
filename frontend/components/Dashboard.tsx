'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import { getDay, getHistory, getSettings } from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT), getSettings()]);
    setDay(d);
    setHistory(h);
    setSettings(s);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    loadCore()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadCore]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const streak = computeStreak(history, {
    date,
    completed: day.categories.filter((c) => c.done).length,
    total: day.categories.length,
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <div>Дата: {formatDisplayDate(date)}</div>
      <div>Серия: {streak}</div>
      <div>
        Сфер выполнено: {day.categories.filter((c) => c.done).length} / {day.categories.length}
      </div>
      <div>Задач на сегодня: {day.dailies.length}</div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
    </div>
  );
}
