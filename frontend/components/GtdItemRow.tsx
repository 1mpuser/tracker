'use client';

import { useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { formatRuDate } from '@/lib/date';
import styles from './GtdItemRow.module.css';

interface GtdItemRowProps {
  item: GtdItem;
  today: string;
  onOpenProject: (item: GtdItem) => void;
  onUpdate: (
    id: number,
    patch: Partial<
      Pick<
        GtdItem,
        'title' | 'notes' | 'status' | 'plannedDate' | 'dueDate' | 'priority' | 'scheduledDate' | 'scheduledTime'
      >
    >,
  ) => void | Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
}

const MOVE_TARGETS: { status: GtdStatus; label: string }[] = [
  { status: 'backlog', label: 'Бэклог' },
  { status: 'calendar', label: 'Календарь' },
  { status: 'someday', label: 'Когда-нибудь' },
  { status: 'waiting', label: 'Ожидание' },
  { status: 'project', label: 'Проект' },
  { status: 'reference', label: 'Заметки' },
];

export default function GtdItemRow({ item, today, onOpenProject, onUpdate, onDelete }: GtdItemRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCalendarOpen, setMoveCalendarOpen] = useState(false);
  const [moveDateValue, setMoveDateValue] = useState('');
  const [moveTimeValue, setMoveTimeValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '');

  function closeMenu() {
    setMenuOpen(false);
    setDueOpen(false);
    setMoveOpen(false);
    setMoveCalendarOpen(false);
    setMoveDateValue('');
    setMoveTimeValue('');
  }

  function moveTo(target: GtdStatus) {
    if (target === 'calendar') {
      setMoveCalendarOpen((v) => !v);
      return;
    }
    onUpdate(item.id, { status: target });
    closeMenu();
  }

  function confirmMoveToCalendar() {
    if (!moveDateValue) return;
    onUpdate(item.id, { status: 'calendar', scheduledDate: moveDateValue, scheduledTime: moveTimeValue || null });
    closeMenu();
  }

  function startEdit() {
    setTitleDraft(item.title);
    setNotesDraft(item.notes ?? '');
    setEditing(true);
    closeMenu();
  }

  async function saveEdit() {
    await onUpdate(item.id, { title: titleDraft, notes: notesDraft });
    setEditing(false);
  }

  const isOverdue = !!item.dueDate && item.dueDate < today && item.status !== 'done';
  const canPlanToday = item.status === 'backlog' || item.status === 'someday' || item.status === 'calendar';
  const isToday = item.plannedDate === today;

  if (editing) {
    return (
      <li className={styles.item}>
        <div className={styles.editForm}>
          <input
            className={styles.editTitle}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            autoFocus
          />
          <textarea
            className={styles.editNotes}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Заметки…"
            rows={2}
          />
          <div className={styles.editActions}>
            <button type="button" className={styles.saveBtn} onClick={saveEdit}>
              Сохранить
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={styles.item}>
      {item.status === 'project' ? (
        <button type="button" className={styles.titleBtn} onClick={() => onOpenProject(item)}>
          {item.title}
        </button>
      ) : (
        <span className={styles.title}>{item.title}</span>
      )}

      {item.status === 'calendar' && item.scheduledDate && (
        <span className={styles.meta}>📅 {formatRuDate(item.scheduledDate, item.scheduledTime)}</span>
      )}
      {item.status === 'waiting' && item.waitingFor && <span className={styles.meta}>→ {item.waitingFor}</span>}
      {item.priority && <span className={styles.prio}>❗</span>}
      {item.dueDate && (
        <span className={`${styles.due} ${isOverdue ? styles.overdue : ''}`}>⏰ {formatRuDate(item.dueDate)}</span>
      )}

      <span className={styles.actions}>
        <button
          type="button"
          className={`${styles.doneBtn} ${item.status === 'done' ? styles.doneBtnActive : ''}`}
          onClick={() => onUpdate(item.id, { status: item.status === 'done' ? 'backlog' : 'done' })}
          title="Готово"
        >
          ✓
        </button>
        {canPlanToday && (
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => onUpdate(item.id, { plannedDate: isToday ? null : today })}
          >
            {isToday ? 'убрать' : 'сегодня'}
          </button>
        )}

        <div className={styles.menuWrap}>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Ещё"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className={styles.menu}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => setDueOpen((v) => !v)}
              >
                Дедлайн…
              </button>
              {dueOpen && (
                <div className={styles.dueInputWrap}>
                  <input
                    type="date"
                    className={styles.dueInput}
                    value={item.dueDate ?? ''}
                    onChange={(e) => {
                      onUpdate(item.id, { dueDate: e.target.value || null });
                      closeMenu();
                    }}
                  />
                </div>
              )}
              {item.dueDate && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onUpdate(item.id, { dueDate: null });
                    closeMenu();
                  }}
                >
                  снять срок
                </button>
              )}
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => setMoveOpen((v) => !v)}
              >
                Перенести в…
              </button>
              {moveOpen && (
                <div className={styles.moveWrap}>
                  {MOVE_TARGETS.filter((t) => t.status !== item.status).map((t) => (
                    <button
                      key={t.status}
                      type="button"
                      className={styles.menuItem}
                      onClick={() => moveTo(t.status)}
                    >
                      {t.label}
                    </button>
                  ))}
                  {moveCalendarOpen && (
                    <div className={styles.dueInputWrap}>
                      <input
                        type="date"
                        className={styles.dueInput}
                        value={moveDateValue}
                        onChange={(e) => setMoveDateValue(e.target.value)}
                      />
                      <input
                        type="time"
                        className={styles.dueInput}
                        value={moveTimeValue}
                        onChange={(e) => setMoveTimeValue(e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.saveBtn}
                        disabled={!moveDateValue}
                        onClick={confirmMoveToCalendar}
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  onUpdate(item.id, { priority: !item.priority });
                  closeMenu();
                }}
              >
                {item.priority ? 'Не важное' : 'Важное'}
              </button>
              <button type="button" className={styles.menuItem} onClick={startEdit}>
                Редактировать
              </button>
              {item.status !== 'archived' && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onUpdate(item.id, { status: 'archived' });
                    closeMenu();
                  }}
                >
                  В архив
                </button>
              )}
              {item.status !== 'inbox' && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onUpdate(item.id, { status: 'inbox' });
                    closeMenu();
                  }}
                >
                  В Корзину
                </button>
              )}
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => {
                  onDelete(item.id);
                  closeMenu();
                }}
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      </span>
    </li>
  );
}
