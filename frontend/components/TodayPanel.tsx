'use client';

import { useState } from 'react';
import type { GtdItem } from '@/types/api';
import { getGtdItems } from '@/lib/api';
import { backlogForToday, sortGtdItems, toggleBacklogSelection } from '@/lib/gtd';
import { todayLocal, formatRuDate } from '@/lib/date';
import styles from './TodayPanel.module.css';

interface TodayPanelProps {
  items: GtdItem[];
  onAdd: (title: string) => void;
  onTakeFromBacklog: (ids: number[]) => void | Promise<void>;
  onToggleDone: (item: GtdItem) => void;
  onRemove: (id: number) => void;
}

export default function TodayPanel({ items, onAdd, onTakeFromBacklog, onToggleDone, onRemove }: TodayPanelProps) {
  const [text, setText] = useState('');
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogItems, setBacklogItems] = useState<GtdItem[]>([]);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [backlogError, setBacklogError] = useState<string | null>(null);
  const [selectedBacklogIds, setSelectedBacklogIds] = useState<number[]>([]);
  const [takingBacklog, setTakingBacklog] = useState(false);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  }

  async function openBacklog() {
    if (backlogOpen) {
      setBacklogOpen(false);
      setSelectedBacklogIds([]);
      return;
    }
    setBacklogOpen(true);
    setBacklogError(null);
    setSelectedBacklogIds([]);
    setBacklogLoading(true);
    try {
      setBacklogItems(backlogForToday(await getGtdItems('backlog'), todayLocal()));
    } catch {
      setBacklogError('Не удалось загрузить бэклог');
    } finally {
      setBacklogLoading(false);
    }
  }

  function toggleBacklogItem(id: number) {
    setSelectedBacklogIds((current) => toggleBacklogSelection(current, id));
  }

  async function takeSelectedBacklog() {
    if (selectedBacklogIds.length === 0) return;
    setTakingBacklog(true);
    setBacklogError(null);
    try {
      await onTakeFromBacklog(selectedBacklogIds);
      setBacklogItems((current) => current.filter((item) => !selectedBacklogIds.includes(item.id)));
      setSelectedBacklogIds([]);
      setBacklogOpen(false);
    } catch {
      setBacklogError('Не удалось взять выбранные задачи на сегодня');
    } finally {
      setTakingBacklog(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Задачи на сегодня</h2>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Добавить задачу…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button type="button" className={styles.addBtn} onClick={submit}>
          +
        </button>
        <div className={styles.backlogWrap}>
          <button
            type="button"
            className={styles.backlogBtn}
            onClick={openBacklog}
            aria-expanded={backlogOpen}
            aria-haspopup="dialog"
          >
            выбрать из бэклога
          </button>
          {backlogOpen && (
            <div className={styles.backlogDropdown} role="dialog" aria-label="Выбрать задачи из бэклога">
              {backlogLoading && <div className={styles.dropdownEmpty}>загрузка…</div>}
              {!backlogLoading && backlogError && <div className={styles.dropdownEmpty}>{backlogError}</div>}
              {!backlogLoading && !backlogError && backlogItems.length === 0 && (
                <div className={styles.dropdownEmpty}>Бэклог пуст</div>
              )}
              {!backlogLoading &&
                !backlogError &&
                backlogItems.map((item) => (
                  <label
                    key={item.id}
                    className={styles.dropdownItem}
                  >
                    <input
                      className={styles.dropdownCheck}
                      type="checkbox"
                      checked={selectedBacklogIds.includes(item.id)}
                      onChange={() => toggleBacklogItem(item.id)}
                      disabled={takingBacklog}
                    />
                    {item.title}
                  </label>
                ))}
              {!backlogLoading && !backlogError && backlogItems.length > 0 && (
                <div className={styles.backlogActions}>
                  <button
                    type="button"
                    className={styles.backlogApply}
                    onClick={takeSelectedBacklog}
                    disabled={selectedBacklogIds.length === 0 || takingBacklog}
                  >
                    {takingBacklog ? 'добавление…' : `Взять на сегодня (${selectedBacklogIds.length})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ul className={styles.list}>
        {items.length === 0 && (
          <li className={styles.empty}>
            Пусто — возьми что-нибудь из Бэклога недели (вкладка GTD) или добавь задачу.
          </li>
        )}
        {sortGtdItems(items).map((item) => {
          const done = item.status === 'done';
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={`${styles.check} ${done ? styles.checkDone : ''}`}
                onClick={() => onToggleDone(item)}
                aria-label={item.title}
              >
                {done ? '✓' : ''}
              </button>
              <span className={`${styles.text} ${done ? styles.textDone : ''}`} onClick={() => onToggleDone(item)}>
                {item.title}
              </span>
              {item.priority && <span className={styles.prio}>❗</span>}
              {item.dueDate && (
                <span
                  className={`${styles.due} ${item.dueDate < todayLocal() && item.status !== 'done' ? styles.overdue : ''}`}
                >
                  ⏰ {formatRuDate(item.dueDate)}
                </span>
              )}
              {item.status === 'calendar' && item.scheduledDate && (
                <span className={styles.cal}>📅 {formatRuDate(item.scheduledDate, item.scheduledTime)}</span>
              )}
              {!(item.status === 'calendar' && !item.plannedDate) && (
                <span className={styles.del} onClick={() => onRemove(item.id)}>
                  ×
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
