import { parseDateParam } from '../common/date.util';
import { POMODORO_MIN } from './weekly.helpers';

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

// Строка помидорок в том же языке, что недельная сводка: день либо в зачёте,
// либо видно, сколько не хватило. При нуле — только число: напоминать про
// недостачу в день, который толком не начался, незачем.
function pomodoroLine(pomodoros: number): string {
  if (pomodoros >= POMODORO_MIN) return `🍅 Помидорок: ${pomodoros} — день в зачёте`;
  if (pomodoros > 0) return `🍅 Помидорок: ${pomodoros} — до зачёта не хватило ${POMODORO_MIN - pomodoros}`;
  return `🍅 Помидорок: ${pomodoros}`;
}

export function buildDaySummary(day: DaySummaryInput): string {
  const lines: string[] = [`📅 ${formatRuDate(day.date)}`, '', pomodoroLine(day.pomodoros)];

  if (day.rating != null) {
    lines.push(`⭐ Оценка: ${day.rating}/10`);
  }

  if (day.categories.length > 0) {
    const done = day.categories.filter((c) => c.done);
    const untouched = day.categories.filter((c) => !c.done);

    // Ни одной закрытой — весь блок схлопывается в одну строку. Счётчик
    // «0 / 6» и список крестиков ровно ничего не добавляли, кроме упрёка.
    if (done.length === 0) {
      lines.push('', 'Сферы не тронуты');
    } else {
      lines.push('', `Сферы — ${done.length} / ${day.categories.length}`);
      for (const c of done) {
        lines.push(`✅ ${escapeHtml(c.label)}`);
      }
      if (untouched.length > 0) {
        lines.push(`Не тронуты: ${untouched.map((c) => escapeHtml(c.label)).join(', ')}`);
      }
    }
  }

  const comment = day.comment?.trim();
  if (comment) {
    lines.push('', `💬 ${escapeHtml(comment)}`);
  }

  return lines.join('\n');
}
