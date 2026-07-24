'use client';

import { useState } from 'react';
import type { GtdItem } from '@/types/api';
import { createGtdItem, updateGtdItem } from '@/lib/api';
import { CLARIFY, CLARIFY_START, type ClarifyOption, type ClarifyRoute } from '@/lib/gtd';
import styles from './InboxProcessor.module.css';

interface InboxProcessorProps {
  items: GtdItem[];
  onChanged: () => void | Promise<void>;
}

export default function InboxProcessor({ items, onChanged }: InboxProcessorProps) {
  const [title, setTitle] = useState('');
  // per-item current question key (defaults to CLARIFY_START)
  const [step, setStep] = useState<Record<number, string>>({});
  // per-item pending route awaiting an inline date pick
  const [datePick, setDatePick] = useState<Record<number, ClarifyRoute>>({});
  const [dateValue, setDateValue] = useState<Record<number, string>>({});

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
    if (route.needs === 'date') {
      setDatePick((s) => ({ ...s, [item.id]: route }));
      return;
    }
    const patch: Parameters<typeof updateGtdItem>[1] = { status: route.status };
    if (route.needs === 'waitingFor') {
      const value = window.prompt('Кому делегировано?');
      if (!value) return;
      patch.waitingFor = value;
    }
    await updateGtdItem(item.id, patch);
    setStep((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
    await onChanged();
  }

  async function confirmDate(item: GtdItem) {
    const route = datePick[item.id];
    const value = dateValue[item.id];
    if (!route || !value) return;
    await updateGtdItem(item.id, { status: route.status, scheduledDate: value });
    setDatePick((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
    setDateValue((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
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
              {datePick[item.id] && (
                <div className={styles.datePick}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dateValue[item.id] ?? ''}
                    onChange={(e) => setDateValue((s) => ({ ...s, [item.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={!dateValue[item.id]}
                    onClick={() => confirmDate(item)}
                  >
                    OK
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
