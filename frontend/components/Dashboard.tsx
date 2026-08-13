'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DayView, GtdItem, HistoryEntry, Settings } from '@/types/api';
import {
  getDay,
  getHistory,
  getRoutines,
  getSettings,
  planForToday,
  setCategoryDone,
  syncSessionPomodoros,
  updateDay,
  updateGtdItem,
  updatePomodoros,
  updateSettings,
  updateYoutube,
} from '@/lib/api';
import { formatDisplayDate, todayLocal } from '@/lib/date';
import { isEveningWindow, isMorningWindow, isWeeklyReviewWindow } from '@/lib/notifications';
import { computeStreak } from '@/lib/streak';
import { computePomodoroStreak, POMODORO_MIN, POMODORO_OPT } from '@/lib/pomodoro';
import { unclosedRoutines } from '@/lib/routines';
import { useWeeklySummary } from '@/lib/useWeeklySummary';
import Header from './Header';
import SpheresPanel from './SpheresPanel';
import TodayPanel from './TodayPanel';
import YoutubePanel from './YoutubePanel';
import PomodoroPanel from './PomodoroPanel';
import StatsPanel from './StatsPanel';
import SettingsModal from './SettingsModal';
import DayDetailModal from './DayDetailModal';
import GtdScreen from './GtdScreen';
import RoutinesScreen from './RoutinesScreen';
import styles from './Dashboard.module.css';

const HISTORY_LIMIT = 84;

const TABS = [
  { key: 'home', label: 'Главный' },
  { key: 'gtd', label: 'GTD' },
  { key: 'routines', label: 'Рутины' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Dashboard() {
  const [date, setDate] = useState(() => todayLocal());
  const [day, setDay] = useState<DayView | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [closingDay, setClosingDay] = useState(false);
  const [syncingSession, setSyncingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Закрыто норм из скольких: голое число «сколько не добрал» ничего не объясняет,
  // а «1/3» читается так же, как счётчик на самой строке рутины.
  const [routinesDone, setRoutinesDone] = useState({ closed: 0, total: 0 });
  const { sendIfSunday, chartNode } = useWeeklySummary();

  const loadCore = useCallback(async () => {
    const [d, h, s] = await Promise.all([getDay(date), getHistory(HISTORY_LIMIT, date), getSettings()]);
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
    // Ошибка синка Session привязана к дате, на которой она произошла —
    // при переключении даты она не должна висеть под чужим счётчиком.
    setSessionError(null);
  }, [date]);

  useEffect(() => {
    // `date` — локальное «сегодня» (оно же переживает переход через полночь).
    // Без него бэкенд посчитал бы неделю от своей UTC-даты, и ночью счётчик
    // показывал бы недобор прошлой недели.
    getRoutines(date)
      .then((w) =>
        setRoutinesDone({
          closed: w.routines.length - unclosedRoutines(w.routines),
          total: w.routines.length,
        }),
      )
      .catch(() => setRoutinesDone({ closed: 0, total: 0 }));
  }, [activeTab, date]);

  useEffect(() => {
    function checkDateRollover() {
      const current = todayLocal();
      if (current !== date) setDate(current);
    }
    const interval = setInterval(checkDateRollover, 60 * 1000);
    document.addEventListener('visibilitychange', checkDateRollover);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', checkDateRollover);
    };
  }, [date]);

  useEffect(() => {
    if (!settings?.notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const check = () => {
      const now = new Date();
      if (isMorningWindow(now) && day && day.today.length === 0) {
        new Notification('Ещё не занёс задачи на сегодня');
      }
      if (isEveningWindow(now) && day && !day.eveningClosed) {
        new Notification('Отметь сферы за сегодня и закрой день');
      }
      if (isEveningWindow(now) && day && day.pomodoros < POMODORO_MIN) {
        new Notification(`Помидорки за день: ${day.pomodoros}/${POMODORO_MIN} — добей минимум`);
      }
      if (isWeeklyReviewWindow(now)) {
        const key = todayLocal();
        if (localStorage.getItem('weeklyReviewNotified') !== key) {
          new Notification(
            'Воскресенье — время для Weekly Review: разбери входящие, пройдись по Бэклогу недели и Проектам',
          );
          localStorage.setItem('weeklyReviewNotified', key);
        }
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
    setHistory(await getHistory(HISTORY_LIMIT, date));
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
    if (!day || closingDay) return;
    setClosingDay(true);
    try {
      const wasClosing = !day.eveningClosed;
      setDay(await updateDay(date, { eveningClosed: !day.eveningClosed }));
      // Сводка идёт фоном: интерфейс уже показал закрытый день.
      if (wasClosing) void sendIfSunday(date);
    } finally {
      setClosingDay(false);
    }
  }

  async function changeRating(rating: number) {
    setDay(await updateDay(date, { rating }));
    refreshHistory();
  }

  async function changeComment(comment: string) {
    setDay(await updateDay(date, { comment }));
  }

  async function addToday(title: string) {
    await planForToday(title, date);
    await refreshDay();
  }

  async function toggleTodayDone(item: GtdItem) {
    if (item.status === 'done') {
      await updateGtdItem(item.id, { status: 'backlog' });
    } else {
      await updateGtdItem(item.id, { status: 'done', plannedDate: date });
    }
    await refreshDay();
  }

  async function removeFromToday(id: number) {
    await updateGtdItem(id, { plannedDate: null });
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

  async function addPomodoro(delta: number) {
    setDay(await updatePomodoros(date, { delta }));
    refreshHistory();
  }

  async function resetPomodoro() {
    setDay(await updatePomodoros(date, { reset: true }));
    refreshHistory();
  }

  async function syncSession() {
    setSyncingSession(true);
    setSessionError(null);
    try {
      setDay(await syncSessionPomodoros(date));
      refreshHistory();
    } catch {
      setSessionError('Не удалось прочитать календарь Session');
    } finally {
      setSyncingSession(false);
    }
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
  const pomodoroStreakMin = computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_MIN);
  const pomodoroStreakOpt = computePomodoroStreak(history, { date, pomodoros: day.pomodoros }, POMODORO_OPT);
  const notificationsActive =
    settings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <nav className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key === 'routines' && routinesDone.total > 0 ? (
                <span
                  className={`${styles.tabBadge} ${
                    routinesDone.closed === routinesDone.total ? styles.tabBadgeDone : ''
                  }`}
                  title="рутин с выполненной недельной нормой"
                >
                  {routinesDone.closed}/{routinesDone.total}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <span className={styles.sysHint}>sys / daily-tracker</span>
      </div>

      {activeTab === 'home' && (
        <>
          <Header
            dateLabel={formatDisplayDate(date)}
            streak={streak}
            pomodoroStreakMin={pomodoroStreakMin}
            pomodoroStreakOpt={pomodoroStreakOpt}
            notificationsEnabled={notificationsActive}
            onEnableNotifications={enableNotifications}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className={styles.grid}>
            <SpheresPanel
              categories={day.categories}
              eveningClosed={day.eveningClosed}
              rating={day.rating}
              comment={day.comment}
              onToggle={toggleCategory}
              onToggleEveningClosed={toggleEveningClosed}
              onRatingChange={changeRating}
              onCommentChange={changeComment}
            />
            <TodayPanel
              items={day.today}
              onAdd={addToday}
              onToggleDone={toggleTodayDone}
              onRemove={removeFromToday}
            />
            <YoutubePanel
              minutes={day.youtubeMinutes}
              budget={settings.youtubeBudget}
              onAdd={addYoutubeMinutes}
              onReset={resetYoutube}
              onBudgetChange={changeYoutubeBudget}
            />
            <PomodoroPanel
              count={day.pomodoros}
              onAdd={addPomodoro}
              onReset={resetPomodoro}
              onSyncSession={settings.sessionSyncEnabled ? syncSession : undefined}
              syncing={syncingSession}
              syncError={sessionError}
            />
          </div>
          <StatsPanel history={history} onSelectDate={setSelectedDate} />
        </>
      )}

      {activeTab === 'gtd' && <GtdScreen />}
      {activeTab === 'routines' && <RoutinesScreen />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onCategoriesChanged={refreshDay} />}
      {selectedDate && (
        <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} onDataChanged={refreshHistory} />
      )}
      {chartNode}
    </div>
  );
}
