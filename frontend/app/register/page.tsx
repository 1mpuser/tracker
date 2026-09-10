'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../Auth.module.css';
import { apiErrorMessage, confirmSignupByCode, register, resendSignup } from '@/lib/api';

type Stage = 'form' | 'checkEmail';

const RESEND_AFTER_MS = 60_000;

export default function RegisterPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startResendTimer() {
    setResendLeft(RESEND_AFTER_MS / 1000);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await register({ email: email.trim(), password, timezone });
      setStage('checkEmail');
      startResendTimer();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await confirmSignupByCode(email.trim(), code);
      router.push('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendLeft > 0) return;
    setBusy(true);
    setError(null);
    try {
      await resendSignup(email.trim());
      startResendTimer();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'checkEmail') {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Проверьте почту</h1>
          <p className={styles.subtitle}>Мы отправили письмо на {email.trim()}</p>
          <form onSubmit={submitCode}>
            <div className={styles.field}>
              <label>Код из письма</label>
              <div className={styles.codeRow}>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                  autoFocus
                />
              </div>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy || code.length !== 6}>
                {busy ? 'Проверяем…' : 'Подтвердить'}
              </button>
            </div>
          </form>
          <div className={styles.resend}>
            <span>Не пришло письмо?</span>
            <button type="button" onClick={resend} disabled={resendLeft > 0 || busy}>
              {resendLeft > 0 ? `ещё раз через ${resendLeft} с` : 'отправить ещё раз'}
            </button>
          </div>
          <div className={styles.notice}>Письма нет — загляните в спам.</div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Регистрация</h1>
        <p className={styles.subtitle}>Почта + пароль. Подтверждение придёт письмом</p>
        <form onSubmit={submitForm}>
          <div className={styles.field}>
            <label>Почта</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label>Пароль (от 8 символов)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Пароль ещё раз</label>
            <input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Отправляем…' : 'Зарегистрироваться'}
            </button>
          </div>
        </form>
        <div className={styles.links}>
          <span />
          <Link href="/login">Уже есть аккаунт — войти</Link>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
