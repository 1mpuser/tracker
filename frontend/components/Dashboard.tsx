'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import { getDay, getHistory, getSettings, setCategoryDone, setEveningClosed } from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { computeStreak } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

export default function Dashboard() {
  const [date] = useState(() => todayUTC());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  function enableNotifications() {
    // Real Notification.requestPermission() + Settings persistence lands in Task 18.
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    setDay(await setCategoryDone(date, key, !current.done));
    refreshHistory();
  }

  async function toggleEveningClosed() {
    if (!day) return;
    setDay(await setEveningClosed(date, !day.eveningClosed));
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
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        notificationsEnabled={settings.notificationsEnabled}
        onEnableNotifications={enableNotifications}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={styles.grid}>
        <SpheresPanel
          categories={day.categories}
          eveningClosed={day.eveningClosed}
          onToggle={toggleCategory}
          onToggleEveningClosed={toggleEveningClosed}
        />
      </div>
      <div>Задач на сегодня: {day.dailies.length}</div>
      <div>
        YouTube: {day.youtubeMinutes} / {settings.youtubeBudget} мин
      </div>
      {settingsOpen && <div>Настройки скоро — модалка появится в Task 16.</div>}
    </div>
  );
}
