'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../../Auth.module.css';
import { apiErrorMessage, confirmSignupByToken } from '@/lib/api';

function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setFailed(true);
      return;
    }
    confirmSignupByToken(token)
      .then(() => router.replace('/'))
      .catch(() => setFailed(true));
  }, [searchParams, router]);

  if (failed) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Ссылка устарела</h1>
          <div className={styles.notice}>Код или ссылка больше не действуют. Зарегистрируйтесь ещё раз.</div>
          <div className={styles.actions}>
            <Link href="/register" className={styles.primary}>
              Зарегистрироваться
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.notice}>Подтверждаем регистрацию…</div>
      </div>
    </div>
  );
}

export default function RegisterConfirmPage() {
  return (
    <Suspense>
      <ConfirmInner />
    </Suspense>
  );
}
