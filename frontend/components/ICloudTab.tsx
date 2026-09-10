'use client';

import { useEffect, useState } from 'react';
import styles from './TelegramSettings.module.css';
import type { ICloudView } from '@/types/api';
import { apiErrorMessage, clearICloud, getICloud, resyncICloud, setICloud } from '@/lib/api';

export default function ICloudTab() {
  const [view, setView] = useState<ICloudView | null>(null);
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [listName, setListName] = useState('GTD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getICloud().then((v) => {
      setView(v);
      setAppleId(v.appleId ?? '');
      setListName(v.remindersList);
    }).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function save() {
    if (!appleId.trim() || !appPassword.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const v = await setICloud({ appleId: appleId.trim(), appPassword: appPassword.trim(), remindersList: listName.trim() || 'GTD' });
      setView(v);
      setAppleId(v.appleId ?? '');
      setAppPassword('');
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
      setView(await clearICloud());
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { synced } = await resyncICloud();
      setNotice(`Обновлено напоминаний: ${synced}`);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.status}>
        {!view && 'загрузка…'}
        {view && !view.configured && 'Не подключено — Reminders в iCloud не синхронизируются.'}
        {view?.configured && `Подключено: ${view.appleId} · список «${view.remindersList}»`}
      </div>

      <div className={styles.hint}>
        Нужен пароль приложения, а не пароль Apple ID: appleid.apple.com → «Вход и безопасность» → «Пароли
        приложений». Список «GTD» создайте в «Напоминаниях». Всё опционально — без настройки трекер работает как
        раньше.
      </div>

      <div className={styles.row}>
        <input placeholder="Apple ID (email)" value={appleId} onChange={(e) => setAppleId(e.target.value)} />
      </div>
      <div className={styles.row}>
        <input
          type="password"
          autoComplete="off"
          placeholder="Пароль приложения"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <input placeholder="Имя списка (по умолчанию GTD)" value={listName} onChange={(e) => setListName(e.target.value)} />
        <button type="button" onClick={save} disabled={busy || !appleId.trim() || !appPassword.trim()}>
          {view?.configured ? 'заменить' : 'подключить'}
        </button>
        {view?.configured && (
          <button type="button" onClick={disconnect} disabled={busy}>
            отключить
          </button>
        )}
      </div>

      {view?.configured && (
        <div className={styles.row}>
          <button type="button" onClick={resync} disabled={busy}>
            Синхронизировать все напоминания
          </button>
        </div>
      )}

      {notice && <div className={styles.status}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
