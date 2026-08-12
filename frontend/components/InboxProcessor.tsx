'use client';

import { useState } from 'react';
import type { GtdItem, GtdStatus } from '@/types/api';
import { createGtdItem, updateGtdItem } from '@/lib/api';
import { CLARIFY, CLARIFY_START, findSimilar, overdueItems, type ClarifyOption, type ClarifyRoute } from '@/lib/gtd';
import { formatRuDate } from '@/lib/date';
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
  // id просроченной задачи, для которой открыт выбор новой даты
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');

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

  async function resolveOverdue(item: GtdItem, action: 'backlog' | 'archive') {
    await updateGtdItem(
      item.id,
      action === 'backlog'
        ? { status: 'backlog', scheduledDate: null, scheduledTime: null }
        : { status: 'archived' },
    );
    await onChanged();
  }

  async function confirmReschedule(item: GtdItem) {
    if (!rescheduleValue) return;
    await updateGtdItem(item.id, { status: 'calendar', scheduledDate: rescheduleValue });
    setRescheduleId(null);
    setRescheduleValue('');
    await onChanged();
  }

  const similar = findSimilar(title, allItems);
  const overdue = overdueItems(allItems, today);

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

      {items.length === 0 && overdue.length > 0 && (
        <div className={styles.overdueBlock}>
          <div className={styles.overdueTitle}>Просроченные</div>
          {overdue.map((item) => (
            <div key={item.id} className={styles.item}>
              <div className={styles.itemTitle}>{item.title}</div>
              <div className={styles.question}>
                Дата {formatRuDate(item.scheduledDate as string)} прошла. Что с ней?
              </div>
              <div className={styles.options}>
                <button
                  type="button"
                  className={styles.optBtn}
                  onClick={() => setRescheduleId(rescheduleId === item.id ? null : item.id)}
                >
                  Новая дата
                </button>
                <button type="button" className={styles.optBtn} onClick={() => resolveOverdue(item, 'backlog')}>
                  В бэклог недели
                </button>
                <button type="button" className={styles.optBtn} onClick={() => resolveOverdue(item, 'archive')}>
                  Архив
                </button>
              </div>
              {rescheduleId === item.id && (
                <div className={styles.datePick}>
                  <DatePicker
                    value={rescheduleValue || null}
                    onChange={(v) => setRescheduleValue(v ?? '')}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={!rescheduleValue}
                    onClick={() => confirmReschedule(item)}
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
