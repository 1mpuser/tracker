'use client';

import { useEffect, useState } from 'react';
import styles from './TelegramSettings.module.css';
import type { SessionView } from '@/types/api';
import { apiErrorMessage, clearSession, getSession, setSession } from '@/lib/api';

export default function SessionTab() {
  const [view, setView] = useState<SessionView | null>(null);
  const [calendarName, setCalendarName] = useState('');
  const [minMinutes, setMinMinutes] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((v) => {
      setView(v);
      setCalendarName(v.calendarName ?? '');
      setMinMinutes(v.minMinutes);
    }).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function save() {
    if (!calendarName.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const v = await setSession({ calendarName: calendarName.trim(), minMinutes });
      setView(v);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setView(await clearSession());
      setCalendarName('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (view && !view.icloudConfigured) {
    return <div className={styles.body}>Сначала подключите iCloud во вкладке «iCloud».</div>;
  }

  return (
    <div className={styles.body}>
      <div className={styles.status}>
        {!view && 'загрузка…'}
        {view && !view.configured && 'Не настроено — помидорки из Session не синхронизируются.'}
        {view?.configured && `Календарь «${view.calendarName}» · минимум ${view.minMinutes} мин`}
      </div>

      <div className={styles.hint}>
        Календарь, в который Session.app пишет сессии фокуса. Укажите его имя и минимальную длину сессии — сессии
        короче помидоркой не считаются.
      </div>

      <div className={styles.row}>
        <input
          placeholder="Имя календаря"
          value={calendarName}
          onChange={(e) => setCalendarName(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <input
          type="number"
          min={1}
          placeholder="Минимальная длина сессии, мин"
          value={minMinutes}
          onChange={(e) => setMinMinutes(parseInt(e.target.value, 10) || 20)}
        />
        <button type="button" onClick={save} disabled={busy || !calendarName.trim()}>
          сохранить
        </button>
        {view?.configured && (
          <button type="button" onClick={disconnect} disabled={busy}>
            отключить
          </button>
        )}
      </div>

      {notice && <div className={styles.status}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
