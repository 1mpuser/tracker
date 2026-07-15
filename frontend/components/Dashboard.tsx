'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, HistoryEntry, Settings } from '@/types/api';
import {
  addDaily as apiAddDaily,
  deleteDaily as apiDeleteDaily,
  getDay,
  getHistory,
  getSettings,
  setCategoryDone,
  setEveningClosed,
  updateDaily as apiUpdateDaily,
  updateSettings,
  updateYoutube,
} from '@/lib/api';
import { formatDisplayDate, todayUTC } from '@/lib/date';
import { isEveningWindow, isMorningWindow } from '@/lib/notifications';
import { computeStreak, STREAK_THRESHOLD } from '@/lib/streak';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';
import YoutubePanel from './YoutubePanel';
import StatsPanel from './StatsPanel';
import SettingsModal from './SettingsModal';
import DayDetailModal from './DayDetailModal';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  useEffect(() => {
    if (!settings?.notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const check = () => {
      const now = new Date();
      if (isMorningWindow(now) && day && day.dailies.length === 0) {
        new Notification('Ещё не занёс задачи на сегодня');
      }
      if (isEveningWindow(now) && day && !day.eveningClosed) {
        new Notification('Отметь сферы за сегодня и закрой день');
      }
    };

    check();
    const interval = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings?.notificationsEnabled, day]);

  async function refreshDay() {
    setDay(await getDay(date));
  }

  async function refreshHistory() {
    setHistory(await getHistory(HISTORY_LIMIT));
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setSettings(await updateSettings({ notificationsEnabled: true }));
    }
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

  async function addDailyTask(text: string) {
    await apiAddDaily(date, text);
    await refreshDay();
  }

  async function toggleDaily(id: number) {
    if (!day) return;
    const current = day.dailies.find((t) => t.id === id);
    if (!current) return;
    await apiUpdateDaily(id, { done: !current.done });
    await refreshDay();
  }

  async function deleteDailyTask(id: number) {
    await apiDeleteDaily(id);
    await refreshDay();
  }

  async function addYoutubeMinutes(delta: number) {
    setDay(await updateYoutube(date, { delta }));
    refreshHistory();
  }

  async function resetYoutube() {
    setDay(await updateYoutube(date, { reset: true }));
    refreshHistory();
  }

  async function changeYoutubeBudget(value: number) {
    setSettings(await updateSettings({ youtubeBudget: value }));
  }

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  if (error || !day || !settings) {
    return <div className={styles.loading}>Не удалось загрузить данные{error ? `: ${error}` : ''}</div>;
  }

  const todayCompleted = day.categories.filter((c) => c.done).length;
  const streak = computeStreak(history, { date, completed: todayCompleted });
  const streakBoosted = todayCompleted >= STREAK_THRESHOLD;

  return (
    <div className={styles.wrap}>
      <div className={styles.sysline}>sys / daily-tracker</div>
      <Header
        dateLabel={formatDisplayDate(date)}
        streak={streak}
        streakBoosted={streakBoosted}
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
        <DailiesPanel dailies={day.dailies} onAdd={addDailyTask} onToggle={toggleDaily} onDelete={deleteDailyTask} />
        <YoutubePanel
          minutes={day.youtubeMinutes}
          budget={settings.youtubeBudget}
          onAdd={addYoutubeMinutes}
          onReset={resetYoutube}
          onBudgetChange={changeYoutubeBudget}
        />
      </div>
      <StatsPanel history={history} onSelectDate={setSelectedDate} />
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onCategoriesChanged={refreshDay} />
      )}
      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} onDataChanged={refreshHistory} />
      )}
    </div>
  );
}
