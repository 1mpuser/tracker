'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { deleteGtdItem, getGtdItems, updateGtdItem } from '@/lib/api';
import { BUCKET_TABS, sortGtdItems } from '@/lib/gtd';
import { todayLocal } from '@/lib/date';
import InboxProcessor from './InboxProcessor';
import ProjectCard from './ProjectCard';
import GtdItemRow from './GtdItemRow';
import styles from './GtdScreen.module.css';

const LAZY: GtdStatus[] = ['done', 'archived'];

export default function GtdScreen() {
  const [items, setItems] = useState<GtdItem[]>([]);
  const [lazyItems, setLazyItems] = useState<GtdItem[]>([]);
  const [active, setActive] = useState<GtdStatus>('inbox');
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<GtdItem | null>(null);

  const reload = useCallback(async () => {
    setItems(await getGtdItems());
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
    patch: Partial<Pick<GtdItem, 'title' | 'notes' | 'status' | 'plannedDate' | 'dueDate' | 'priority'>>,
  ) {
    await updateGtdItem(id, patch);
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  const visible = sortGtdItems(LAZY.includes(active) ? lazyItems : items.filter((i) => i.status === active));

  return (
    <div className={styles.screen}>
      {new Date().getDay() === 0 && (
        <div className={styles.reviewBanner}>🗓 Воскресный разбор — время для Weekly Review</div>
      )}
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

      {openProject ? (
        <ProjectCard project={openProject} onClose={() => setOpenProject(null)} onChanged={reload} />
      ) : (
        <>
          {loading && <div className={styles.empty}>загрузка…</div>}
          {!loading && active !== 'inbox' && visible.length === 0 && (
            <div className={styles.empty}>Пусто.</div>
          )}

          {active === 'inbox' ? (
            <InboxProcessor items={visible} onChanged={reload} />
          ) : (
            <ul className={styles.list}>
              {visible.map((item) => (
                <GtdItemRow
                  key={item.id}
                  item={item}
                  today={todayLocal()}
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
  );
}
