'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../Auth.module.css';
import { apiErrorMessage, forgotPassword } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Ответ всегда одинаковый — не раскрываем, зарегистрирован ли адрес.
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Восстановление пароля</h1>
        <p className={styles.subtitle}>Если адрес зарегистрирован, мы отправим письмо со ссылкой</p>
        {!sent ? (
          <form onSubmit={submit}>
            <div className={styles.field}>
              <label>Почта</label>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Отправляем…' : 'Отправить письмо'}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.notice}>Если адрес зарегистрирован, мы отправили письмо.</div>
        )}
        <div className={styles.links}>
          <span />
          <Link href="/login">Вернуться ко входу</Link>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
