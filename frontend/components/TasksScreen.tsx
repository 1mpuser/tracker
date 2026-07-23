'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TaskOverviewItem } from '@/types/api';
import { getAllTasks } from '@/lib/api';
import { formatDisplayDate, formatOriginDate } from '@/lib/date';
import styles from './TasksScreen.module.css';

type Filter = 'all' | 'pending' | 'done';

interface TasksScreenProps {
  onSelectDate: (date: string) => void;
  refreshKey: number;
}

interface DayGroup {
  date: string;
  total: number;
  done: number;
  tasks: TaskOverviewItem[];
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'pending', label: 'Невыполненные' },
  { key: 'done', label: 'Выполненные' },
];

export default function TasksScreen({ onSelectDate, refreshKey }: TasksScreenProps) {
  const [items, setItems] = useState<TaskOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    getAllTasks()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const groups = useMemo<DayGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const byDate = new Map<string, DayGroup>();
    for (const item of items) {
      let group = byDate.get(item.date);
      if (!group) {
        group = { date: item.date, total: 0, done: 0, tasks: [] };
        byDate.set(item.date, group);
      }
      // Дневные счётчики считают ВСЕ задачи дня, независимо от активного фильтра,
      // чтобы "2/4" не врало при выбранном фильтре/поиске.
      group.total += 1;
      if (item.done) group.done += 1;

      if (filter === 'pending' && item.done) continue;
      if (filter === 'done' && !item.done) continue;
      if (q && !item.text.toLowerCase().includes(q)) continue;
      group.tasks.push(item);
    }
    // items приходят уже отсортированными (date desc / order asc), Map хранит порядок вставки.
    return Array.from(byDate.values()).filter((g) => g.tasks.length > 0);
  }, [items, filter, query]);

  if (loading) {
    return <div className={styles.loading}>загрузка…</div>;
  }

  const hasAnyTasks = items.length > 0;

  return (
    <div className={styles.screen}>
      <div className={styles.controls}>
        <h2 className={styles.heading}>Все задачи</h2>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.filterBtn} ${filter === f.key ? styles.filterActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className={styles.search}
          type="text"
          placeholder="Поиск…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!hasAnyTasks && <div className={styles.empty}>Задач пока нет.</div>}
      {hasAnyTasks && groups.length === 0 && <div className={styles.empty}>Ничего не найдено.</div>}

      <div className={styles.groups}>
        {groups.map((group) => (
          <section key={group.date} className={styles.group}>
            <button type="button" className={styles.dayHeader} onClick={() => onSelectDate(group.date)}>
              <span className={styles.dayDate}>{formatDisplayDate(group.date)}</span>
              <span className={styles.dayCount}>
                {group.done}/{group.total}
              </span>
            </button>
            <ul className={styles.list}>
              {group.tasks.map((task) => (
                <li key={task.id} className={styles.item}>
                  <span className={`${styles.glyph} ${task.done ? styles.glyphDone : ''}`}>
                    {task.done ? '✓' : '☐'}
                  </span>
                  <span className={`${styles.text} ${task.done ? styles.textDone : ''}`}>{task.text}</span>
                  {task.carriedFromDate && (
                    <span className={styles.carriedBadge}>↻ {formatOriginDate(task.carriedFromDate, task.date)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
