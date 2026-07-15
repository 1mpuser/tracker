'use client';

import { useState } from 'react';
import styles from './DailiesPanel.module.css';
import type { DailyTaskView, TaskTemplate } from '@/types/api';
import { getTaskTemplates } from '@/lib/api';

interface DailiesPanelProps {
  dailies: DailyTaskView[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function DailiesPanel({ dailies, onAdd, onToggle, onDelete }: DailiesPanelProps) {
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
        {dailies.length === 0 && <li className={styles.empty}>Пока пусто — добавь пару задач на день.</li>}
        {dailies.map((d) => (
          <li key={d.id} className={styles.item}>
            <button
              type="button"
              className={`${styles.check} ${d.done ? styles.checkDone : ''}`}
              onClick={() => onToggle(d.id)}
              aria-label={d.text}
            >
              {d.done ? '✓' : ''}
            </button>
            <span className={`${styles.text} ${d.done ? styles.textDone : ''}`} onClick={() => onToggle(d.id)}>
              {d.text}
            </span>
            <span className={styles.del} onClick={() => onDelete(d.id)}>
              ×
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
