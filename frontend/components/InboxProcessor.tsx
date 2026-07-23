'use client';

import { useState } from 'react';
import type { GtdItem } from '@/types/api';
import { createGtdItem, updateGtdItem } from '@/lib/api';
import { CLARIFY, CLARIFY_START, type ClarifyOption } from '@/lib/gtd';
import styles from './InboxProcessor.module.css';

interface InboxProcessorProps {
  items: GtdItem[];
  onChanged: () => void | Promise<void>;
}

export default function InboxProcessor({ items, onChanged }: InboxProcessorProps) {
  const [title, setTitle] = useState('');
  // per-item current question key (defaults to CLARIFY_START)
  const [step, setStep] = useState<Record<number, string>>({});

  async function capture() {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createGtdItem(trimmed);
    setTitle('');
    await onChanged();
  }

  async function choose(item: GtdItem, option: ClarifyOption) {
    if (option.next) {
      setStep((s) => ({ ...s, [item.id]: option.next as string }));
      return;
    }
    const route = option.route!;
    const patch: Parameters<typeof updateGtdItem>[1] = { status: route.status };
    if (route.needs === 'date') {
      const value = window.prompt('Дата (YYYY-MM-DD):');
      if (!value) return;
      patch.scheduledDate = value;
    }
    if (route.needs === 'waitingFor') {
      const value = window.prompt('Кому делегировано?');
      patch.waitingFor = value ?? undefined;
    }
    await updateGtdItem(item.id, patch);
    setStep((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
    await onChanged();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.capture}>
        <input
          className={styles.input}
          placeholder="Скинуть мысль в Корзину…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') capture();
          }}
        />
        <button type="button" className={styles.addBtn} onClick={capture}>
          +
        </button>
      </div>

      {items.length === 0 && <div className={styles.empty}>Корзина пуста — красота.</div>}

      <ul className={styles.list}>
        {items.map((item) => {
          const q = CLARIFY[step[item.id] ?? CLARIFY_START];
          return (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemTitle}>{item.title}</div>
              <div className={styles.question}>{q.prompt}</div>
              <div className={styles.options}>
                {q.options.map((o) => (
                  <button key={o.label} type="button" className={styles.optBtn} onClick={() => choose(item, o)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
