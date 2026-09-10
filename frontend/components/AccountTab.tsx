'use client';

import { useEffect, useState } from 'react';
import styles from './SettingsModal.module.css';
import type { AuthUser } from '@/lib/api';
import { apiErrorMessage, changePassword, getMe, logout, logoutAll, updateMe } from '@/lib/api';

const TIMEZONES = typeof Intl !== 'undefined' && Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];

export default function AccountTab() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [timezone, setTimezone] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(({ user }) => {
        setMe(user);
        setTimezone(user.timezone);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function saveTimezone() {
    if (!me || timezone === me.timezone) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await updateMe(timezone);
      setMe(user);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== repeat) {
      setError('Новые пароли не совпадают');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setNotice('Пароль изменён');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function signOutAll() {
    setBusy(true);
    setError(null);
    try {
      await logoutAll();
      window.location.href = '/login';
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className={styles.tabBody}>
      <div className={styles.addRow}>
        <span>Почта</span>
        <input value={me?.email ?? ''} readOnly />
      </div>

      <div className={styles.addRow}>
        <span>Часовой пояс</span>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          onBlur={saveTimezone}
          disabled={busy || TIMEZONES.length === 0}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={savePassword}>
        <div className={styles.addRow}>
          <span>Текущий пароль</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className={styles.addRow}>
          <span>Новый пароль</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className={styles.addRow}>
          <span>Повтор</span>
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        <div className={styles.addRow}>
          <button type="submit" className={styles.primaryBtn} disabled={busy || !current || !next}>
            Сменить пароль
          </button>
        </div>
      </form>

      <div className={styles.addRow}>
        <span>Сессии</span>
        <span>
          <button type="button" className={styles.secondaryBtn} onClick={signOutAll} disabled={busy}>
            Выйти на всех устройствах
          </button>
        </span>
      </div>

      <div className={styles.addRow}>
        <span>Здесь и сейчас</span>
        <span>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={async () => {
              setError(null);
              try {
                await logout();
                window.location.href = '/login';
              } catch (e) {
                setError(apiErrorMessage(e));
              }
            }}
            disabled={busy}
          >
            Выйти
          </button>
        </span>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
