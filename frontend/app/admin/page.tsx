'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Admin.module.css';
import { generatePassword } from '@/lib/password';
import {
  apiErrorMessage,
  blockAdminUser,
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  getMe,
  setAdminPassword,
  unblockAdminUser,
} from '@/lib/api';
import type { AdminUser } from '@/lib/api';

const DEFAULT_TIMEZONE = 'Europe/Moscow';
const TIMEZONES =
  typeof Intl !== 'undefined' && Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU');
}

export default function AdminPage() {
  const router = useRouter();
  const [meId, setMeId] = useState<number | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Форма «Новая учётка».
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  // Пароль, показанный один раз после создания/смены, с кнопкой «Скопировать».
  const [revealed, setRevealed] = useState<{ email: string; password: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Диалог «Сменить пароль».
  const [changeId, setChangeId] = useState<number | null>(null);
  const [changePassword, setChangePassword] = useState('');

  // Подтверждение удаления вводом почты учётки.
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  async function loadUsers() {
    setUsers(await getAdminUsers());
  }

  useEffect(() => {
    getMe()
      .then(async ({ user }) => {
        if (!user.isAdmin) {
          // Не админ — страница ведёт на главную; сам API всё равно отвечает 404.
          router.replace('/');
          return;
        }
        setMeId(user.id);
        await loadUsers();
      })
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  function resetError() {
    setError(null);
    setNotice(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    resetError();
    try {
      const created = await createAdminUser({ email, password, timezone });
      await loadUsers();
      await copyPassword(password);
      setRevealed({ email: created.email, password, label: 'Новая учётка' });
      // Форма для следующей учётки: поле почты очищаем, пароль генерируем заново.
      setEmail('');
      setPassword(generatePassword());
      setNotice(`Учётка ${created.email} создана`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function submitChangePassword() {
    if (busy || changeId === null) return;
    const target = users.find((u) => u.id === changeId);
    setBusy(true);
    resetError();
    try {
      await setAdminPassword(changeId, changePassword);
      await loadUsers();
      await copyPassword(changePassword);
      setRevealed({ email: target?.email ?? '', password: changePassword, label: 'Пароль изменён' });
      setNotice('Пароль изменён, все сессии учётки закрыты');
      setChangeId(null);
      setChangePassword('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock(u: AdminUser) {
    if (busy || u.id === meId) return;
    setBusy(true);
    resetError();
    try {
      if (u.blockedAt) await unblockAdminUser(u.id);
      else await blockAdminUser(u.id);
      await loadUsers();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy || deleteId === null) return;
    const target = users.find((u) => u.id === deleteId);
    if (!target || deleteConfirm.trim().toLowerCase() !== target.email.toLowerCase()) return;
    setBusy(true);
    resetError();
    try {
      await deleteAdminUser(deleteId);
      await loadUsers();
      setNotice(`Учётка ${target.email} удалена вместе с данными`);
      setDeleteId(null);
      setDeleteConfirm('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className={styles.page}>Загрузка…</div>;
  }

  const deleteTarget = users.find((u) => u.id === deleteId) ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Учётки</h1>
        <span className={styles.hint}>Почта и пароль выдаёт админ; регистрации нет</span>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <form className={styles.createCard} onSubmit={handleCreate}>
        <h2 className={styles.subtitle}>Новая учётка</h2>
        <div className={styles.formRow}>
          <label>Почта (она же логин)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
          />
        </div>
        <div className={styles.formRow}>
          <label>Пароль</label>
          <div className={styles.passwordRow}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className={styles.smallBtn} onClick={() => setPassword(generatePassword())}>
              Сгенерировать заново
            </button>
          </div>
        </div>
        <div className={styles.formRow}>
          <label>Часовой пояс</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={styles.primaryBtn} disabled={busy}>
          Создать
        </button>
      </form>

      {revealed && (
        <div className={styles.reveal}>
          <span className={styles.revealLabel}>{revealed.label}</span>
          <span className={styles.revealEmail}>{revealed.email}</span>
          <code className={styles.revealPassword}>{revealed.password}</code>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => copyPassword(revealed.password)}
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
          <button type="button" className={styles.closeBtn} onClick={() => setRevealed(null)}>
            Закрыть
          </button>
        </div>
      )}

      <div className={styles.listCard}>
        <h2 className={styles.subtitle}>Все учётки</h2>
        {users.length === 0 ? (
          <div className={styles.empty}>Пока никого нет</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Почта</th>
                <th>Пояс</th>
                <th>Создана</th>
                <th>Статус</th>
                <th className={styles.actionsCol}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === meId;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.email}
                      {u.isAdmin && <span className={styles.badge}>админ</span>}
                      {isSelf && <span className={styles.selfBadge}>вы</span>}
                    </td>
                    <td>{u.timezone}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      {u.blockedAt ? (
                        <span className={styles.statusBlocked}>заблокирована</span>
                      ) : (
                        <span className={styles.statusActive}>активна</span>
                      )}
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.rowBtn}
                        disabled={busy}
                        onClick={() => {
                          setChangeId(u.id);
                          setChangePassword(generatePassword());
                        }}
                      >
                        Сменить пароль
                      </button>
                      <button
                        type="button"
                        className={styles.rowBtn}
                        disabled={busy || isSelf}
                        onClick={() => toggleBlock(u)}
                      >
                        {u.blockedAt ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowBtn} ${styles.dangerBtn}`}
                        disabled={busy || isSelf}
                        onClick={() => {
                          setDeleteConfirm('');
                          setDeleteId(u.id);
                        }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {changeId !== null && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.subtitle}>Сменить пароль</h3>
            <div className={styles.formRow}>
              <label>Новый пароль</label>
              <div className={styles.passwordRow}>
                <input value={changePassword} onChange={(e) => setChangePassword(e.target.value)} />
                <button type="button" className={styles.smallBtn} onClick={() => setChangePassword(generatePassword())}>
                  Сгенерировать заново
                </button>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primaryBtn} disabled={busy} onClick={submitChangePassword}>
                Сохранить
              </button>
              <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => setChangeId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h3 className={styles.subtitle}>Удалить учётку {deleteTarget.email}?</h3>
            <p className={styles.modalNote}>
              Будут удалены все данные. Чтобы подтвердить, введите почту учётки:
            </p>
            <div className={styles.formRow}>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={deleteTarget.email}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.primaryBtn} ${styles.dangerBtn}`}
                disabled={busy || deleteConfirm.trim().toLowerCase() !== deleteTarget.email.toLowerCase()}
                onClick={confirmDelete}
              >
                Удалить навсегда
              </button>
              <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => setDeleteId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
