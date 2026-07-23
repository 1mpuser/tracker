'use client';

import { useState } from 'react';
import type { GtdItem, TaskTemplate } from '@/types/api';
import { getTaskTemplates } from '@/lib/api';
import styles from './TodayPanel.module.css';

interface TodayPanelProps {
  items: GtdItem[];
  onAdd: (title: string) => void;
  onToggleDone: (item: GtdItem) => void;
  onRemove: (id: number) => void;
}

export default function TodayPanel({ items, onAdd, onToggleDone, onRemove }: TodayPanelProps) {
  const [text, setText] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  }

  async function openTemplates() {
    if (templatesOpen) {
      setTemplatesOpen(false);
      return;
    }
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      setTemplates(await getTaskTemplates());
    } finally {
      setTemplatesLoading(false);
    }
  }

  function pickTemplate(t: TaskTemplate) {
    onAdd(t.text);
    setTemplatesOpen(false);
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
        <div className={styles.templatesWrap}>
          <button type="button" className={styles.templatesBtn} onClick={openTemplates}>
            из шаблонов
          </button>
          {templatesOpen && (
            <div className={styles.dropdown}>
              {templatesLoading && <div className={styles.dropdownEmpty}>загрузка…</div>}
              {!templatesLoading && templates.length === 0 && (
                <div className={styles.dropdownEmpty}>Шаблонов пока нет</div>
              )}
              {!templatesLoading &&
                templates.map((t) => (
                  <button key={t.id} type="button" className={styles.dropdownItem} onClick={() => pickTemplate(t)}>
                    {t.text}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
      <ul className={styles.list}>
        {items.length === 0 && (
          <li className={styles.empty}>Пусто — возьми что-нибудь из Бэклога (вкладка GTD) или добавь задачу.</li>
        )}
        {items.map((item) => {
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
              {item.status === 'calendar' && item.scheduledDate && (
                <span className={styles.cal}>📅 {item.scheduledDate}</span>
              )}
              <span className={styles.del} onClick={() => onRemove(item.id)}>
                ×
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
