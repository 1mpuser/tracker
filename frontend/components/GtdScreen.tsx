'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { deleteGtdItem, getGtdItems, updateGtdItem } from '@/lib/api';
import { BUCKET_TABS } from '@/lib/gtd';
import { todayLocal } from '@/lib/date';
import InboxProcessor from './InboxProcessor';
import ProjectCard from './ProjectCard';
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

  async function move(id: number, status: GtdStatus) {
    await updateGtdItem(id, { status });
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  async function remove(id: number) {
    await deleteGtdItem(id);
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
    else await reload();
  }

  async function planToday(id: number) {
    await updateGtdItem(id, { plannedDate: todayLocal() });
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  async function unplan(id: number) {
    await updateGtdItem(id, { plannedDate: null });
    await reload();
    if (LAZY.includes(active)) setLazyItems(await getGtdItems(active));
  }

  const visible = LAZY.includes(active) ? lazyItems : items.filter((i) => i.status === active);

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
          {!loading && visible.length === 0 && <div className={styles.empty}>Пусто.</div>}

          {active === 'inbox' ? (
            <InboxProcessor items={visible} onChanged={reload} />
          ) : (
            <ul className={styles.list}>
              {visible.map((item) => (
                <li key={item.id} className={styles.item}>
                  {item.status === 'project' ? (
                    <button type="button" className={styles.titleBtn} onClick={() => setOpenProject(item)}>
                      {item.title}
                    </button>
                  ) : (
                    <span className={styles.title}>{item.title}</span>
                  )}
                  {item.status === 'calendar' && item.scheduledDate && (
                    <span className={styles.meta}>{item.scheduledDate}</span>
                  )}
                  {item.status === 'waiting' && item.waitingFor && (
                    <span className={styles.meta}>→ {item.waitingFor}</span>
                  )}
                  <span className={styles.actions}>
                    {item.status !== 'done' && (
                      <button type="button" onClick={() => move(item.id, 'done')} title="Готово">
                        ✓
                      </button>
                    )}
                    {item.status !== 'archived' && (
                      <button type="button" onClick={() => move(item.id, 'archived')} title="В архив">
                        🗄
                      </button>
                    )}
                    {item.status !== 'inbox' && (
                      <button type="button" onClick={() => move(item.id, 'inbox')} title="Вернуть в Корзину">
                        ↩
                      </button>
                    )}
                    {(item.status === 'backlog' || item.status === 'someday' || item.status === 'calendar') && (
                      item.plannedDate === todayLocal() ? (
                        <button type="button" onClick={() => unplan(item.id)} title="Убрать из сегодня">
                          ☀×
                        </button>
                      ) : (
                        <button type="button" onClick={() => planToday(item.id)} title="В сегодня">
                          ☀
                        </button>
                      )
                    )}
                    <button type="button" onClick={() => remove(item.id)} title="Удалить">
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
