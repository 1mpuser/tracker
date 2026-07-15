'use client';

import { useEffect, useState } from 'react';
import styles from './DayDetailModal.module.css';
import type { DayView } from '@/types/api';
import { addDaily, deleteDaily, getDay, setCategoryDone, updateDaily, updateDay, updateYoutube } from '@/lib/api';
import { formatDisplayDate } from '@/lib/date';
import SpheresPanel from './SpheresPanel';
import DailiesPanel from './DailiesPanel';

type Stage = 'loading' | 'view' | 'confirm' | 'edit';

interface DayDetailModalProps {
  date: string;
  onClose: () => void;
  onDataChanged: () => void;
}

export default function DayDetailModal({ date, onClose, onDataChanged }: DayDetailModalProps) {
  const [day, setDay] = useState<DayView | null>(null);
  const [stage, setStage] = useState<Stage>('loading');

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
    if (!day) return;
    await updateDay(date, { eveningClosed: !day.eveningClosed });
    await refresh();
  }

  async function changeRating(rating: number) {
    await updateDay(date, { rating });
    await refresh();
  }

  async function changeComment(comment: string) {
    await updateDay(date, { comment });
    await refresh();
  }

  async function addDailyTask(text: string) {
    await addDaily(date, text);
    await refresh();
  }

  async function toggleDaily(id: number) {
    if (!day) return;
    const current = day.dailies.find((t) => t.id === id);
    if (!current) return;
    await updateDaily(id, { done: !current.done });
    await refresh();
  }

  async function deleteDailyTask(id: number) {
    await deleteDaily(id);
    await refresh();
  }

  async function addYoutubeMinutes(delta: number) {
    await updateYoutube(date, { delta });
    await refresh();
  }

  async function resetYoutube() {
    await updateYoutube(date, { reset: true });
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
              <div className={styles.viewLine}>YouTube: {day.youtubeMinutes} мин</div>
              <div className={styles.viewLine}>День закрыт: {day.eveningClosed ? 'да' : 'нет'}</div>
              <div className={styles.viewLine}>Оценка: {day.rating === null ? '—' : `${day.rating}/10`}</div>
              {day.comment && <div className={styles.viewLine}>Комментарий: {day.comment}</div>}
            </div>
            <div className={styles.section}>
              {day.dailies.length === 0 && <div className={styles.viewEmpty}>Задач не было</div>}
              {day.dailies.map((t) => (
                <div key={t.id} className={`${styles.viewTask} ${t.done ? styles.viewTaskDone : ''}`}>
                  {t.text}
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
            <DailiesPanel
              dailies={day.dailies}
              onAdd={addDailyTask}
              onToggle={toggleDaily}
              onDelete={deleteDailyTask}
            />
            <div className={styles.ytEditor}>
              <div className={styles.ytEditorHeading}>YouTube</div>
              <div className={styles.ytEditorTop}>
                <span className={styles.ytEditorMinutes}>{day.youtubeMinutes} мин</span>
                <span className={styles.ytEditorReset} onClick={resetYoutube}>
                  сбросить
                </span>
              </div>
              <div className={styles.ytEditorButtons}>
                <button type="button" onClick={() => addYoutubeMinutes(10)}>
                  +10
                </button>
                <button type="button" onClick={() => addYoutubeMinutes(25)}>
                  +25
                </button>
                <button type="button" onClick={() => addYoutubeMinutes(50)}>
                  +50
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
