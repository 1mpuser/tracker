'use client';

import { useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { createGtdItem, updateGtdItem } from '@/lib/api';
import { CLARIFY, CLARIFY_START, findSimilar, type ClarifyOption, type ClarifyRoute } from '@/lib/gtd';
import DatePicker from './DatePicker';
import styles from './InboxProcessor.module.css';

interface InboxProcessorProps {
  items: GtdItem[];
  allItems: GtdItem[];
  today: string;
  onChanged: () => void | Promise<void>;
  onOpenBucket: (status: GtdStatus) => void;
}

export default function InboxProcessor({ items, allItems, today, onChanged, onOpenBucket }: InboxProcessorProps) {
  const [title, setTitle] = useState('');
  // per-item current question key (defaults to CLARIFY_START)
  const [step, setStep] = useState<Record<number, string>>({});
  // per-item pending route awaiting an inline date pick
  const [datePick, setDatePick] = useState<Record<number, ClarifyRoute>>({});
  const [dateValue, setDateValue] = useState<Record<number, string>>({});
  const [timeValue, setTimeValue] = useState<Record<number, string>>({});
  // per-item pending route awaiting an inline "who is this waiting on" name
  const [waitingPick, setWaitingPick] = useState<Record<number, ClarifyRoute>>({});
  const [waitingValue, setWaitingValue] = useState<Record<number, string>>({});

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
    if (route.needs === 'waitingFor') {
      setWaitingPick((s) => ({ ...s, [item.id]: route }));
      return;
    }
    await updateGtdItem(item.id, { status: route.status });
    setStep((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
    await onChanged();
  }

  async function confirmWaiting(item: GtdItem) {
    const route = waitingPick[item.id];
    const value = (waitingValue[item.id] ?? '').trim();
    if (!route || !value) return;
    await updateGtdItem(item.id, { status: route.status, waitingFor: value });
    setWaitingPick((s) => {
      const next = { ...s };
      delete next[item.id];
      return next;
    });
    setWaitingValue((s) => {
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

  async function confirmDate(item: GtdItem) {
    const route = datePick[item.id];
    const value = dateValue[item.id];
    if (!route || !value) return;
    await updateGtdItem(item.id, {
      status: route.status,
      scheduledDate: value,
      scheduledTime: timeValue[item.id] || null,
    });
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
    setTimeValue((s) => {
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

  const similar = findSimilar(title, allItems);

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

      {similar.length > 0 && (
        <div className={styles.similar}>
          Похоже, уже есть:
          {similar.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.similarBtn}
              onClick={() => onOpenBucket(s.status)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

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
                  <DatePicker
                    value={dateValue[item.id] ?? null}
                    onChange={(v) => setDateValue((s) => ({ ...s, [item.id]: v ?? '' }))}
                  />
                  <input
                    type="time"
                    className={styles.dateInput}
                    value={timeValue[item.id] ?? ''}
                    onChange={(e) => setTimeValue((s) => ({ ...s, [item.id]: e.target.value }))}
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
              {waitingPick[item.id] && (
                <div className={styles.datePick}>
                  <input
                    className={styles.dateInput}
                    placeholder="Кому делегировано?"
                    value={waitingValue[item.id] ?? ''}
                    onChange={(e) => setWaitingValue((s) => ({ ...s, [item.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmWaiting(item);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={!(waitingValue[item.id] ?? '').trim()}
                    onClick={() => confirmWaiting(item)}
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
