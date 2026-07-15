'use client';

import { useState } from 'react';
import styles from './DailiesPanel.module.css';
import type { CarryCandidate, DailyTaskView, TaskTemplate } from '@/types/api';
import { getCarryCandidates, getTaskTemplates } from '@/lib/api';
import { formatOriginDate } from '@/lib/date';

interface DailiesPanelProps {
  date: string;
  dailies: DailyTaskView[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onCarry: (ids: number[]) => void;
}

export default function DailiesPanel({ date, dailies, onAdd, onToggle, onDelete, onCarry }: DailiesPanelProps) {
  const [text, setText] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryCandidates, setCarryCandidates] = useState<CarryCandidate[]>([]);
  const [carryLoading, setCarryLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

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

  async function openCarry() {
    if (carryOpen) {
      setCarryOpen(false);
      return;
    }
    setCarryOpen(true);
    setCarryLoading(true);
    try {
      setCarryCandidates(await getCarryCandidates(date));
    } finally {
      setCarryLoading(false);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitCarry() {
    onCarry(selectedIds);
    setCarryOpen(false);
    setSelectedIds([]);
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
        <div className={styles.templatesWrap}>
          <button type="button" className={styles.templatesBtn} onClick={openCarry}>
            перенести с прошлых дней
          </button>
          {carryOpen && (
            <div className={styles.dropdown}>
              {carryLoading && <div className={styles.dropdownEmpty}>загрузка…</div>}
              {!carryLoading && carryCandidates.length === 0 && (
                <div className={styles.dropdownEmpty}>Нечего переносить</div>
              )}
              {!carryLoading && carryCandidates.length > 0 && (
                <>
                  {carryCandidates.map((c) => (
                    <label key={c.id} className={styles.carryItem}>
                      <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelected(c.id)} />
                      <span className={styles.carryItemText}>{c.text}</span>
                      <span className={styles.carryItemDate}>{formatOriginDate(c.originDate, date)}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className={styles.carrySubmit}
                    disabled={selectedIds.length === 0}
                    onClick={submitCarry}
                  >
                    Перенести выбранное ({selectedIds.length})
                  </button>
                </>
              )}
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
            {d.carriedFromDate && (
              <span className={styles.carriedBadge}>↻ {formatOriginDate(d.carriedFromDate, date)}</span>
            )}
            <span className={styles.del} onClick={() => onDelete(d.id)}>
              ×
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
