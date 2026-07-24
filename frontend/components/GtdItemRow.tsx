'use client';

import { useEffect, useRef, useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { formatRuDate } from '@/lib/date';
import DatePicker from './DatePicker';
import styles from './GtdItemRow.module.css';

interface GtdItemRowProps {
  item: GtdItem;
  today: string;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
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

export default function GtdItemRow({
  item,
  today,
  isMenuOpen,
  onMenuOpenChange,
  onOpenProject,
  onUpdate,
  onDelete,
}: GtdItemRowProps) {
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCalendarOpen, setMoveCalendarOpen] = useState(false);
  const [moveDateValue, setMoveDateValue] = useState('');
  const [moveTimeValue, setMoveTimeValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '');

  // Whenever this row's menu closes — whether by its own toggle, an outside
  // click, Escape, or another row's menu opening (isMenuOpen is controlled by
  // the parent so only one row's menu is ever open at a time) — reset every
  // sub-panel so the next open starts clean.
  useEffect(() => {
    if (!isMenuOpen) {
      setDueOpen(false);
      setMoveOpen(false);
      setMoveCalendarOpen(false);
      setMoveDateValue('');
      setMoveTimeValue('');
      setConfirmDelete(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) onMenuOpenChange(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onMenuOpenChange(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMenuOpen, onMenuOpenChange]);

  function closeMenu() {
    onMenuOpenChange(false);
  }

  function toggleMenu() {
    if (!isMenuOpen && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect();
      // Generous estimate of the fully-expanded menu height (incl. the move
      // submenu) — good enough to decide whether it fits below the button.
      const estimatedMenuHeight = 380;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Only flip up when there's truly more room above than below —
      // otherwise a menu near the top of the viewport would flip up and
      // clip off-screen instead of just scrolling within its own max-height.
      setMenuUp(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    }
    onMenuOpenChange(!isMenuOpen);
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
        <span
          className={`${styles.title} ${styles.titleClickable}`}
          onClick={() => onUpdate(item.id, { status: item.status === 'done' ? 'backlog' : 'done' })}
          title="Отметить готово"
        >
          {item.title}
        </span>
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

        <div className={styles.menuWrap} ref={menuWrapRef}>
          <button
            ref={moreBtnRef}
            type="button"
            className={styles.moreBtn}
            onClick={toggleMenu}
            aria-label="Ещё"
          >
            ⋯
          </button>
          {isMenuOpen && (
            <div className={`${styles.menu} ${menuUp ? styles.menuUp : ''}`}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => setDueOpen((v) => !v)}
              >
                Дедлайн…
              </button>
              {dueOpen && (
                <div className={styles.dueInputWrap}>
                  <DatePicker
                    value={item.dueDate}
                    onChange={(v) => {
                      onUpdate(item.id, { dueDate: v });
                      closeMenu();
                    }}
                    allowClear
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
                    <div className={styles.moveCalendarPick}>
                      <span className={styles.moveCalendarHint}>Дата (и время — по желанию), затем «OK»</span>
                      <div className={styles.dueInputWrap}>
                        <DatePicker value={moveDateValue || null} onChange={(v) => setMoveDateValue(v ?? '')} />
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
              {!confirmDelete ? (
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={() => setConfirmDelete(true)}
                >
                  Удалить
                </button>
              ) : (
                <div className={styles.confirmDeleteRow}>
                  <span className={styles.confirmDeleteText}>Точно удалить?</span>
                  <button
                    type="button"
                    className={`${styles.confirmBtn} ${styles.confirmBtnDanger}`}
                    onClick={() => {
                      onDelete(item.id);
                      closeMenu();
                    }}
                  >
                    Да
                  </button>
                  <button type="button" className={styles.confirmBtn} onClick={() => setConfirmDelete(false)}>
                    Отмена
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </span>
    </li>
  );
}
