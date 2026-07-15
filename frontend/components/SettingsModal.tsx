'use client';

import { useEffect, useState } from 'react';
import styles from './SettingsModal.module.css';
import type { Category } from '@/types/api';
import { createCategory, getCategories, updateCategory } from '@/lib/api';
import { transliterate } from '@/lib/transliterate';
import TaskTemplatesTab from './TaskTemplatesTab';

type Tab = 'categories' | 'templates';

interface SettingsModalProps {
  onClose: () => void;
  onCategoriesChanged: () => void;
}

export default function SettingsModal({ onClose, onCategoriesChanged }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function refreshCategories() {
    setCategories(await getCategories());
    onCategoriesChanged();
  }

  async function renameCategory(key: string, label: string) {
    await updateCategory(key, { label });
    await refreshCategories();
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    const target = categories[index + direction];
    const current = categories[index];
    if (!target || !current) return;
    await Promise.all([
      updateCategory(current.key, { order: target.order }),
      updateCategory(target.key, { order: current.order }),
    ]);
    await refreshCategories();
  }

  async function archiveCategory(key: string) {
    await updateCategory(key, { archived: true });
    await refreshCategories();
  }

  async function addCategory() {
    const label = newLabel.trim();
    if (!label) return;
    const key = transliterate(label);
    if (!key) return;
    await createCategory(key, label);
    setNewLabel('');
    await refreshCategories();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'categories' ? styles.tabActive : ''}`}
              onClick={() => setTab('categories')}
            >
              Категории
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'templates' ? styles.tabActive : ''}`}
              onClick={() => setTab('templates')}
            >
              Шаблоны задач
            </button>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {tab === 'categories' && (
          <div className={styles.tabBody}>
            {categories.map((c, i) => (
              <div key={c.key} className={styles.catRow}>
                <input
                  className={styles.catInput}
                  value={c.label}
                  onChange={(e) =>
                    setCategories((prev) => prev.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)))
                  }
                  onBlur={(e) => renameCategory(c.key, e.target.value)}
                />
                <div className={styles.catActions}>
                  <button type="button" onClick={() => moveCategory(i, -1)} disabled={i === 0} aria-label="Вверх">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(i, 1)}
                    disabled={i === categories.length - 1}
                    aria-label="Вниз"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => archiveCategory(c.key)}>
                    архивировать
                  </button>
                </div>
              </div>
            ))}
            <div className={styles.addRow}>
              <input
                placeholder="Новая категория…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCategory();
                }}
              />
              <button type="button" onClick={addCategory}>
                добавить
              </button>
            </div>
          </div>
        )}

        {tab === 'templates' && <TaskTemplatesTab />}
      </div>
    </div>
  );
}
