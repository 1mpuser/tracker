'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GtdItem } from '@/types/api';
import { createGtdItem, getGtdItems, updateGtdItem } from '@/lib/api';
import { BUCKET_TABS } from '@/lib/gtd';
import styles from './ProjectCard.module.css';

const STATUS_LABELS = Object.fromEntries(BUCKET_TABS.map((b) => [b.status, b.label])) as Record<string, string>;

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

  async function toggleStepDone(step: GtdItem) {
    await updateGtdItem(step.id, { status: step.status === 'done' ? 'backlog' : 'done' });
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
            <button
              type="button"
              className={`${styles.stepCheck} ${c.status === 'done' ? styles.stepCheckDone : ''}`}
              onClick={() => toggleStepDone(c)}
              title="Отметить готово"
            >
              {c.status === 'done' ? '✓' : ''}
            </button>
            <span className={`${styles.stepTitle} ${c.status === 'done' ? styles.stepTitleDone : ''}`}>
              {c.title}
            </span>
            <span className={styles.stepStatus}>{STATUS_LABELS[c.status] ?? c.status}</span>
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
