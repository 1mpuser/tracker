'use client';

import { useEffect, useState } from 'react';
import styles from './WeeklyReview.module.css';

type ReviewBucket = 'inbox' | 'backlog' | 'project' | 'waiting' | 'someday';

interface ReviewStep {
  key: ReviewBucket;
  title: string;
  guidance: string;
}

const STEPS: ReviewStep[] = [
  { key: 'inbox', title: 'Корзина', guidance: 'Обнули: разбери все входящие до нуля.' },
  { key: 'backlog', title: 'Бэклог', guidance: 'Пройдись: что ещё актуально? что берёшь на неделю?' },
  { key: 'project', title: 'Проекты', guidance: 'У каждого проекта есть следующий шаг?' },
  { key: 'waiting', title: 'Ожидание', guidance: 'Не завис ли кто? Напомни, если нужно.' },
  { key: 'someday', title: 'Когда-нибудь', guidance: 'Поднять что-то в Бэклог на эту неделю?' },
];

interface WeeklyReviewProps {
  onClose: () => void;
  onGoToBucket: (status: ReviewBucket) => void;
}

export default function WeeklyReview({ onClose, onGoToBucket }: WeeklyReviewProps) {
  const [done, setDone] = useState<Set<ReviewBucket>>(new Set());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleDone(key: ReviewBucket) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Еженедельный разбор</div>
            <div className={styles.subline}>Пройди по шагам — раз в неделю приводим систему в порядок.</div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <ul className={styles.steps}>
          {STEPS.map((step) => {
            const isDone = done.has(step.key);
            return (
              <li key={step.key} className={styles.step}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isDone}
                  onChange={() => toggleDone(step.key)}
                  aria-label={`Отметить шаг «${step.title}» пройденным`}
                />
                <div className={styles.stepBody}>
                  <div className={`${styles.stepTitle} ${isDone ? styles.stepTitleDone : ''}`}>{step.title}</div>
                  <div className={styles.stepGuidance}>{step.guidance}</div>
                </div>
                <button type="button" className={styles.openBtn} onClick={() => onGoToBucket(step.key)}>
                  Открыть
                </button>
              </li>
            );
          })}
        </ul>

        <button type="button" className={styles.finishBtn} onClick={onClose}>
          Завершить разбор
        </button>
      </div>
    </div>
  );
}
