import { parseDateParam } from '../common/date.util';

export interface DaySummaryInput {
  date: string;
  pomodoros: number;
  rating: number | null;
  comment: string | null;
  categories: { label: string; done: boolean }[];
}

// Родительный падеж — строка читается как «1 августа 2026».
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatRuDate(dateStr: string): string {
  const date = parseDateParam(dateStr);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${WEEKDAYS[date.getUTCDay()]}`;
}

export function buildDaySummary(day: DaySummaryInput): string {
  const lines: string[] = [`📅 ${formatRuDate(day.date)}`, '', `🍅 Помидорок: ${day.pomodoros}`];

  if (day.rating !== null) {
    lines.push(`⭐ Оценка: ${day.rating}/10`);
  }

  if (day.categories.length > 0) {
    const done = day.categories.filter((c) => c.done).length;
    lines.push('', `Сферы — ${done} / ${day.categories.length}`);
    for (const c of day.categories) {
      lines.push(`${c.done ? '✅' : '❌'} ${escapeHtml(c.label)}`);
    }
  }

  const comment = day.comment?.trim();
  if (comment) {
    lines.push('', `💬 ${escapeHtml(comment)}`);
  }

  return lines.join('\n');
}
