import { BadRequestException } from '@nestjs/common';

export function parseDateParam(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  if (formatDate(date) !== dateStr) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// «Сегодня» в часовом поясе пользователя: единственный источник «какого дня
// сейчас» после Task 3.1. Контейнер всегда в UTC, поэтому Date#getUTCDay()
// на бэкенде бесполезен для пользователя в другом поясе.
export function todayFor(timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parseDateParam(parts);
}

/** Понедельник той недели, в которую попадает date. Неделя в проекте — пн–вс. */
export function mondayOf(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}
