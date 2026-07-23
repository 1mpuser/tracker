'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GtdItem } from '@/types/api';
import { createGtdItem, getGtdItems } from '@/lib/api';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  project: GtdItem;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

export default function ProjectCard({ project, onClose, onChanged }: ProjectCardProps) {
  const [children, setChildren] = useState<GtdItem[]>([]);
  const [stepTitle, setStepTitle] = useState('');

  const load = useCallback(async () => {
    const [active, done, archived] = await Promise.all([
      getGtdItems(),
      getGtdItems('done'),
      getGtdItems('archived'),
    ]);
    setChildren([...active, ...done, ...archived].filter((i) => i.parentId === project.id));
  }, [project.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addStep() {
    const trimmed = stepTitle.trim();
    if (!trimmed) return;
    await createGtdItem(trimmed, project.id);
    setStepTitle('');
    await load();
    await onChanged();
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>{project.title}</span>
        <button type="button" className={styles.close} onClick={onClose}>
          ← назад
        </button>
      </div>

      {project.notes && <div className={styles.notes}>{project.notes}</div>}

      <div className={styles.subhead}>Шаги</div>
      <ul className={styles.list}>
        {children.length === 0 && <li className={styles.empty}>Шагов пока нет.</li>}
        {children.map((c) => (
          <li key={c.id} className={styles.step}>
            <span className={styles.stepTitle}>{c.title}</span>
            <span className={styles.stepStatus}>{c.status}</span>
          </li>
        ))}
      </ul>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Новый шаг (уйдёт в Корзину)…"
          value={stepTitle}
          onChange={(e) => setStepTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addStep();
          }}
        />
        <button type="button" className={styles.addBtn} onClick={addStep}>
          +
        </button>
      </div>
    </div>
  );
}
