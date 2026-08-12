'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GtdItem } from '@/types/api';
import { createGtdItem, getGtdItems, updateGtdItem } from '@/lib/api';
import { BUCKET_TABS, nextActionId } from '@/lib/gtd';
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
  const [notesDraft, setNotesDraft] = useState(project.notes ?? '');
  const [criteriaDraft, setCriteriaDraft] = useState(project.acceptanceCriteria ?? '');
  const [discussDraft, setDiscussDraft] = useState(project.discussWith ?? '');

  // Deps intentionally omit the field values (react-hooks/exhaustive-deps) —
  // resyncing on every project prop change would clobber in-progress typing;
  // this only needs to reset when a *different* project is opened.
  useEffect(() => {
    setNotesDraft(project.notes ?? '');
    setCriteriaDraft(project.acceptanceCriteria ?? '');
    setDiscussDraft(project.discussWith ?? '');
  }, [project.id]);

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

  async function saveNotes() {
    if (notesDraft.trim() === (project.notes ?? '')) return;
    try {
      await updateGtdItem(project.id, { notes: notesDraft.trim() || null });
      await onChanged();
    } catch (e) {
      console.error('Failed to save project notes', e);
    }
  }

  async function saveCriteria() {
    if (criteriaDraft.trim() === (project.acceptanceCriteria ?? '')) return;
    try {
      await updateGtdItem(project.id, { acceptanceCriteria: criteriaDraft.trim() || null });
      await onChanged();
    } catch (e) {
      console.error('Failed to save project acceptance criteria', e);
    }
  }

  async function saveDiscussWith() {
    if (discussDraft.trim() === (project.discussWith ?? '')) return;
    try {
      await updateGtdItem(project.id, { discussWith: discussDraft.trim() || null });
      await onChanged();
    } catch (e) {
      console.error('Failed to save project discussWith', e);
    }
  }

  const nextId = nextActionId(children);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>{project.title}</span>
        <button type="button" className={styles.close} onClick={onClose}>
          ← назад
        </button>
      </div>

      <label className={styles.fieldLabel}>
        Заметки
        <textarea
          className={styles.fieldInput}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={saveNotes}
          maxLength={4000}
          placeholder="Свободные заметки по проекту…"
        />
      </label>

      <label className={styles.fieldLabel}>
        Критерии окончания
        <textarea
          className={styles.fieldInput}
          value={criteriaDraft}
          onChange={(e) => setCriteriaDraft(e.target.value)}
          onBlur={saveCriteria}
          maxLength={4000}
          placeholder="Когда проект считается завершённым…"
        />
      </label>

      <label className={styles.fieldLabel}>
        С кем обсудить
        <input
          className={styles.fieldInputSingle}
          value={discussDraft}
          onChange={(e) => setDiscussDraft(e.target.value)}
          onBlur={saveDiscussWith}
          maxLength={200}
          placeholder="Имя/роль…"
        />
      </label>

      <div className={styles.subhead}>Шаги</div>
      <ul className={styles.list}>
        {children.length === 0 && <li className={styles.empty}>Шагов пока нет.</li>}
        {children.map((c) => (
          <li key={c.id} className={`${styles.step} ${c.id === nextId ? styles.stepNext : ''}`}>
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
            {c.id === nextId && <span className={styles.nextBadge}>Следующее</span>}
            <span className={styles.stepStatus}>{STATUS_LABELS[c.status] ?? c.status}</span>
          </li>
        ))}
      </ul>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Новый шаг (уйдёт в разбор)…"
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
