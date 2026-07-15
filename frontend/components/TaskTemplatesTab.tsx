'use client';

import { useEffect, useState } from 'react';
import styles from './TaskTemplatesTab.module.css';
import type { TaskTemplate } from '@/types/api';
import { createTaskTemplate, deleteTaskTemplate, getTaskTemplates } from '@/lib/api';

export default function TaskTemplatesTab() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    getTaskTemplates().then(setTemplates);
  }, []);

  async function refresh() {
    setTemplates(await getTaskTemplates());
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    await createTaskTemplate(trimmed);
    setText('');
    await refresh();
  }

  async function remove(id: number) {
    await deleteTaskTemplate(id);
    await refresh();
  }

  return (
    <div className={styles.tabBody}>
      {templates.map((t) => (
        <div key={t.id} className={styles.row}>
          <span className={styles.text}>{t.text}</span>
          <button type="button" className={styles.del} onClick={() => remove(t.id)}>
            удалить
          </button>
        </div>
      ))}
      {templates.length === 0 && <div className={styles.empty}>Шаблонов пока нет</div>}
      <div className={styles.addRow}>
        <input
          placeholder="Новый шаблон…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button type="button" onClick={add}>
          добавить
        </button>
      </div>
    </div>
  );
}
