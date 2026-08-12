'use client';

import { useEffect, useState } from 'react';
import type { GtdItem } from '@/types/api';
import { updateGtdItem } from '@/lib/api';
import { needsEscalation, staleDays, staleItems } from '@/lib/gtd';
import DatePicker from './DatePicker';
import styles from './WeeklyReview.module.css';

type ReviewBucket = 'inbox' | 'backlog' | 'project' | 'waiting' | 'someday';

interface ReviewStep {
  key: ReviewBucket;
  title: string;
  guidance: string;
}

const STEPS: ReviewStep[] = [
  { key: 'inbox', title: 'Разбор', guidance: 'Обнули: разбери все входящие до нуля.' },
  { key: 'backlog', title: 'Бэклог недели', guidance: 'Что берёшь на эту неделю, а что уже не актуально?' },
  { key: 'project', title: 'Проекты', guidance: 'У каждого проекта есть следующий шаг?' },
  { key: 'waiting', title: 'Ожидание', guidance: 'Не завис ли кто? Напомни, если нужно.' },
  { key: 'someday', title: 'Потом', guidance: 'Поднять что-то в Бэклог недели?' },
];

interface WeeklyReviewProps {
  items: GtdItem[];
  today: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onGoToBucket: (status: ReviewBucket) => void;
}

export default function WeeklyReview({ items, today, onClose, onChanged, onGoToBucket }: WeeklyReviewProps) {
  const [done, setDone] = useState<Set<ReviewBucket>>(new Set());
  const [dateForId, setDateForId] = useState<number | null>(null);
  const [dateValue, setDateValue] = useState<Record<number, string>>({});
  // id задачи, по которой прямо сейчас летит запрос. Список не перерисовывается
  // до возврата onChanged, поэтому без этого второй клик по «Беру» ушёл бы
  // вторым PATCH-ом и накрутил бы deferCount, который не сбрасывается никогда.
  const [busy, setBusy] = useState<number | null>(null);

  const stale = staleItems(items, today);

  async function decide(id: number, patch: Parameters<typeof updateGtdItem>[1]) {
    if (busy !== null) return;
    setBusy(id);
    try {
      await updateGtdItem(id, patch);
      // Закрываем пикер только если он открыт у этой же задачи — решение по одной
      // задаче не должно захлопывать пикер, открытый у другой.
      setDateForId((cur) => (cur === id ? null : cur));
      setDateValue((v) => {
        const next = { ...v };
        delete next[id];
        return next;
      });
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

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
                {step.key === 'backlog' && stale.length > 0 && (
                  <div className={styles.queue}>
                    <div className={styles.queueTitle}>протухло: {stale.length}</div>
                    {stale.map((item) => (
                      <div key={item.id} className={styles.queueItem}>
                        <div className={styles.queueName}>
                          {item.title} — лежит {staleDays(item, today)} дн.
                        </div>
                        {needsEscalation(item) ? (
                          <>
                            <div className={styles.queueQuestion}>
                              Откладываешь {item.deferCount + 1}-й раз. Это слишком крупно или ты этого не сделаешь?
                            </div>
                            <div className={styles.queueActions}>
                              <button
                                type="button"
                                className={styles.queueBtn}
                                disabled={busy === item.id}
                                onClick={() => decide(item.id, { status: 'project' })}
                              >
                                Разбить на проект
                              </button>
                              <button
                                type="button"
                                className={styles.queueBtn}
                                disabled={busy === item.id}
                                onClick={() => decide(item.id, { status: 'archived' })}
                              >
                                В архив
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className={styles.queueActions}>
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={busy === item.id}
                              onClick={() => decide(item.id, { status: 'backlog' })}
                            >
                              Беру
                            </button>
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={busy === item.id}
                              onClick={() => decide(item.id, { status: 'someday' })}
                            >
                              Потом
                            </button>
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={busy === item.id}
                              onClick={() => decide(item.id, { status: 'archived' })}
                            >
                              Архив
                            </button>
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={busy === item.id}
                              onClick={() => setDateForId(dateForId === item.id ? null : item.id)}
                            >
                              На дату
                            </button>
                          </div>
                        )}
                        {dateForId === item.id && (
                          <div className={styles.queueActions}>
                            <DatePicker
                              value={dateValue[item.id] ?? null}
                              onChange={(v) => setDateValue((s) => ({ ...s, [item.id]: v ?? '' }))}
                            />
                            <button
                              type="button"
                              className={styles.queueBtn}
                              disabled={!dateValue[item.id] || busy === item.id}
                              onClick={() => decide(item.id, { status: 'calendar', scheduledDate: dateValue[item.id] })}
                            >
                              OK
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
