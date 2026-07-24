'use client';

import { useEffect, useRef, useState } from 'react';
import { RU_MONTHS, RU_WEEKDAYS_SHORT, getMonthGrid } from '@/lib/calendar';
import { formatRuDate, parseUTC, todayLocal } from '@/lib/date';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  value: string | null; // YYYY-MM-DD
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
}

export default function DatePicker({ value, onChange, placeholder = 'Выбрать дату', allowClear }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const anchor = value ? parseUTC(value) : parseUTC(todayLocal());
  const [viewYear, setViewYear] = useState(anchor.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getUTCMonth());

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
      const base = value ? parseUTC(value) : parseUTC(todayLocal());
      setViewYear(base.getUTCFullYear());
      setViewMonth(base.getUTCMonth());
    }
    setOpen((v) => !v);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  const grid = getMonthGrid(viewYear, viewMonth);
  const today = todayLocal();

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button ref={triggerRef} type="button" className={styles.trigger} onClick={toggleOpen}>
        {value ? formatRuDate(value) : <span className={styles.placeholder}>{placeholder}</span>}
      </button>

      {open && (
        <div className={`${styles.popover} ${openUp ? styles.popoverUp : ''}`}>
          <div className={styles.header}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Предыдущий месяц">
              ‹
            </button>
            <span className={styles.monthLabel}>
              {RU_MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Следующий месяц">
              ›
            </button>
          </div>

          <div className={styles.weekdays}>
            {RU_WEEKDAYS_SHORT.map((w) => (
              <span key={w} className={styles.weekday}>
                {w}
              </span>
            ))}
          </div>

          <div className={styles.grid}>
            {grid.map((cell) => (
              <button
                key={cell.date}
                type="button"
                className={`${styles.day} ${cell.inMonth ? '' : styles.dayOutside} ${cell.date === value ? styles.daySelected : ''} ${cell.date === today ? styles.dayToday : ''}`}
                onClick={() => pick(cell.date)}
              >
                {cell.day}
              </button>
            ))}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.footerBtn} onClick={() => pick(today)}>
              Сегодня
            </button>
            {allowClear && value && (
              <button
                type="button"
                className={styles.footerBtn}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
