'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { deleteGtdItem, getGtdItems, updateGtdItem } from '@/lib/api';
import { BUCKET_TABS, sortGtdItems } from '@/lib/gtd';
import { todayLocal } from '@/lib/date';
import InboxProcessor from './InboxProcessor';
import ProjectCard from './ProjectCard';
import GtdItemRow from './GtdItemRow';
import WeeklyReview from './WeeklyReview';
import styles from './GtdScreen.module.css';

const LAZY: GtdStatus[] = ['done', 'archived'];

export default function GtdScreen() {
  const [items, setItems] = useState<GtdItem[]>([]);
  const [lazyItems, setLazyItems] = useState<GtdItem[]>([]);
  const [active, setActive] = useState<GtdStatus>('inbox');
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<GtdItem | null>(null);
  const [query, setQuery] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  // Only one row's "⋯" menu can be open at a time — lifted here so opening
  // a new row's menu closes whichever other row's menu was open before.
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const fresh = await getGtdItems();
    setItems(fresh);
    setOpenProject((prev) => (prev ? fresh.find((i) => i.id === prev.id) ?? null : prev));
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    if (LAZY.includes(active)) {
      getGtdItems(active).then(setLazyItems);
    }
  }, [active]);

  const counts = useMemo(() => {
    const c = {} as Record<GtdStatus, number>;
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);

  async function remove(id: number) {
    await deleteGtdItem(id);
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
    else await reload();
  }

  async function onUpdate(
    id: number,
    patch: Partial<
      Pick<
        GtdItem,
        | 'title'
        | 'notes'
        | 'status'
        | 'plannedDate'
        | 'dueDate'
        | 'priority'
        | 'scheduledDate'
        | 'scheduledTime'
        | 'acceptanceCriteria'
        | 'discussWith'
      >
    >,
  ) {
    await updateGtdItem(id, patch);
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  const visible = sortGtdItems(LAZY.includes(active) ? lazyItems : items.filter((i) => i.status === active));
  const filtered =
    active === 'inbox'
      ? visible
      : visible.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));

  const emptyMessage = (() => {
    if (query.trim()) return 'Ничего не найдено.';
    switch (active) {
      case 'backlog':
        return 'Бэклог недели пуст — разбери входящие или добавь задачу.';
      case 'calendar':
        return 'Пока ничего не запланировано.';
      case 'project':
        return 'Нет активных проектов.';
      case 'waiting':
        return 'Никого не ждём.';
      case 'someday':
        return 'Пока ничего не отложено на потом.';
      case 'reference':
        return 'Заметок пока нет.';
      default:
        return 'Здесь пока пусто.';
    }
  })();

  return (
    <div className={styles.screen}>
      {new Date().getDay() === 0 && (
        <button type="button" className={styles.reviewBanner} onClick={() => setReviewOpen(true)}>
          🗓 Воскресный разбор — время для Weekly Review
        </button>
      )}
      <div className={styles.bucketsRow}>
        <nav className={styles.buckets}>
          {BUCKET_TABS.map((b) => (
            <button
              key={b.status}
              type="button"
              className={`${styles.bucket} ${active === b.status ? styles.bucketActive : ''}`}
              onClick={() => setActive(b.status)}
            >
              {b.label}
              {counts[b.status] ? <span className={styles.badge}>{counts[b.status]}</span> : null}
            </button>
          ))}
        </nav>
        <button type="button" className={styles.reviewButton} onClick={() => setReviewOpen(true)}>
          Разбор недели
        </button>
      </div>

      {reviewOpen && (
        <WeeklyReview
          onClose={() => setReviewOpen(false)}
          onGoToBucket={(s) => {
            setActive(s);
            setReviewOpen(false);
          }}
        />
      )}

      {openProject ? (
        <ProjectCard project={openProject} onClose={() => setOpenProject(null)} onChanged={reload} />
      ) : (
        <div className={styles.container}>
          {loading && <div className={styles.empty}>загрузка…</div>}

          {active === 'inbox' ? (
            <InboxProcessor items={visible} onChanged={reload} />
          ) : (
            <>
              <input
                className={styles.search}
                placeholder="Поиск по названию…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!loading && filtered.length === 0 && <div className={styles.empty}>{emptyMessage}</div>}
              {!loading && filtered.length > 0 && (
                <ul className={styles.list}>
                  {filtered.map((item) => (
                    <GtdItemRow
                      key={item.id}
                      item={item}
                      today={todayLocal()}
                      isMenuOpen={openMenuId === item.id}
                      onMenuOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                      onOpenProject={setOpenProject}
                      onUpdate={onUpdate}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
