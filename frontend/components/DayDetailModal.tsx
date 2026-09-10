'use client';

import { useEffect, useState } from 'react';
import styles from './DayDetailModal.module.css';
import type { DayView } from '@/types/api';
import { getDay, setCategoryDone, updateDay, updateDistraction, updatePomodoros } from '@/lib/api';
import { formatDisplayDate } from '@/lib/date';
import { useWeeklySummary } from '@/lib/useWeeklySummary';
import SpheresPanel from './SpheresPanel';

type Stage = 'loading' | 'view' | 'confirm' | 'edit';

interface DayDetailModalProps {
  date: string;
  distractionLabel: string;
  onClose: () => void;
  onDataChanged: () => void;
}

export default function DayDetailModal({ date, distractionLabel, onClose, onDataChanged }: DayDetailModalProps) {
  const [day, setDay] = useState<DayView | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [closingDay, setClosingDay] = useState(false);
  const { sendIfSunday, chartNode } = useWeeklySummary();

  useEffect(() => {
    getDay(date).then((d) => {
      setDay(d);
      setStage('view');
    });
  }, [date]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function refresh() {
    setDay(await getDay(date));
    onDataChanged();
  }

  async function toggleCategory(key: string) {
    if (!day) return;
    const current = day.categories.find((c) => c.key === key);
    if (!current) return;
    await setCategoryDone(date, key, !current.done);
    await refresh();
  }

  async function toggleEveningClosed() {
    if (!day || closingDay) return;
    setClosingDay(true);
    try {
      const wasClosing = !day.eveningClosed;
      await updateDay(date, { eveningClosed: !day.eveningClosed });
      await refresh();
      if (wasClosing) void sendIfSunday(date);
    } finally {
      setClosingDay(false);
    }
  }

  async function changeRating(rating: number) {
    await updateDay(date, { rating });
    await refresh();
  }

  async function changeComment(comment: string) {
    await updateDay(date, { comment });
    await refresh();
  }

  async function addDistractionMinutes(delta: number) {
    await updateDistraction(date, { delta });
    await refresh();
  }

  async function resetDistraction() {
    await updateDistraction(date, { reset: true });
    await refresh();
  }

  async function addPomodoro(delta: number) {
    await updatePomodoros(date, { delta });
    await refresh();
  }

  async function resetPomodoro() {
    await updatePomodoros(date, { reset: true });
    await refresh();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.dateLabel}>{formatDisplayDate(date)}</span>
          <div className={styles.headerActions}>
            {stage === 'view' && (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => setStage('confirm')}
                aria-label="Редактировать"
              >
                ✎
              </button>
            )}
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>

        {stage === 'loading' && <div className={styles.loading}>загрузка…</div>}

        {stage === 'view' && day && (
          <div className={styles.body}>
            <div className={styles.section}>
              {day.categories.map((c) => (
                <div key={c.key} className={styles.viewRow}>
                  <span className={`${styles.viewMark} ${c.done ? styles.viewMarkDone : ''}`}>
                    {c.done ? '✓' : ''}
                  </span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.section}>
              <div className={styles.viewLine}>{distractionLabel}: {day.distractionMinutes} мин</div>
              <div className={styles.viewLine}>Помидорок: {day.pomodoros}</div>
              <div className={styles.viewLine}>День закрыт: {day.eveningClosed ? 'да' : 'нет'}</div>
              <div className={styles.viewLine}>Оценка: {day.rating === null ? '—' : `${day.rating}/10`}</div>
              {day.comment && <div className={styles.viewLine}>Комментарий: {day.comment}</div>}
            </div>
            <div className={styles.section}>
              {day.today.length === 0 && <div className={styles.viewEmpty}>Задач не было</div>}
              {day.today.map((t) => (
                <div key={t.id} className={`${styles.viewTask} ${t.status === 'done' ? styles.viewTaskDone : ''}`}>
                  {t.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 'confirm' && (
          <div className={styles.confirm}>
            <p className={styles.confirmText}>
              Редактировать данные за {formatDisplayDate(date)}? Это повлияет на серию и статистику.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={() => setStage('view')}>
                Отмена
              </button>
              <button type="button" className={styles.confirmEdit} onClick={() => setStage('edit')}>
                Редактировать
              </button>
            </div>
          </div>
        )}

        {stage === 'edit' && day && (
          <div className={styles.body}>
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
            <div className={styles.distractionEditor}>
              <div className={styles.distractionEditorHeading}>{distractionLabel}</div>
              <div className={styles.distractionEditorTop}>
                <span className={styles.distractionEditorMinutes}>{day.distractionMinutes} мин</span>
                <span className={styles.distractionEditorReset} onClick={resetDistraction}>
                  сбросить
                </span>
              </div>
              <div className={styles.distractionEditorButtons}>
                <button type="button" onClick={() => addDistractionMinutes(10)}>
                  +10
                </button>
                <button type="button" onClick={() => addDistractionMinutes(25)}>
                  +25
                </button>
                <button type="button" onClick={() => addDistractionMinutes(50)}>
                  +50
                </button>
              </div>
            </div>
            <div className={styles.distractionEditor}>
              <div className={styles.distractionEditorHeading}>Помидорки</div>
              <div className={styles.distractionEditorTop}>
                <span className={styles.distractionEditorMinutes}>{day.pomodoros}</span>
                <span className={styles.distractionEditorReset} onClick={resetPomodoro}>
                  сбросить
                </span>
              </div>
              <div className={styles.distractionEditorButtons}>
                <button type="button" onClick={() => addPomodoro(1)}>
                  +1
                </button>
                <button type="button" onClick={() => addPomodoro(-1)}>
                  −1
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {chartNode}
    </div>
  );
}
