import type { WeekStats } from '../stats/stats.service';
import { parseDateParam } from '../common/date.util';
import { escapeHtml } from './telegram.helpers';

// Telegram обрезает подпись к фото на 1024 символах — за пределом сводка
// уезжает отдельным сообщением, а не теряет хвост.
export const TELEGRAM_CAPTION_LIMIT = 1024;

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Индексация как у Date#getUTCDay(): 0 — воскресенье.
const WEEKDAYS_FULL = [
  'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
];

const DAYS_IN_WEEK = 7;

function dayAndMonth(dateStr: string): string {
  const date = parseDateParam(dateStr);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const year = parseDateParam(weekEnd).getUTCFullYear();
  return `${dayAndMonth(weekStart)} — ${dayAndMonth(weekEnd)} ${year}`;
}

export function categoryIcon(doneCount: number): string {
  if (doneCount >= 5) return '✅';
  if (doneCount >= 2) return '⚠️';
  return '❌';
}

export function fitsInCaption(text: string): boolean {
  return text.length <= TELEGRAM_CAPTION_LIMIT;
}

export function buildWeekSummary(stats: WeekStats): string {
  const lines: string[] = [
    `📊 Неделя ${formatWeekRange(stats.weekStart, stats.weekEnd)}`,
    '',
    `🍅 Помидорок: ${stats.totalPomodoros} (в среднем ${stats.avgPomodoros}/день)`,
  ];

  if (stats.bestDay) {
    const weekdayName = WEEKDAYS_FULL[parseDateParam(stats.bestDay.date).getUTCDay()];
    lines.push(`🔥 Лучший день: ${weekdayName} — ${stats.bestDay.pomodoros}`);
  }

  if (stats.avgRating != null) {
    lines.push(`⭐ Средняя оценка: ${stats.avgRating}/10 (по ${stats.ratedDays} дням)`);
  }

  if (stats.categories.length > 0) {
    lines.push('', 'Сферы за неделю');
    for (const c of stats.categories) {
      lines.push(`${categoryIcon(c.doneCount)} ${escapeHtml(c.label)} ${c.doneCount}/${DAYS_IN_WEEK}`);
    }
  }

  lines.push('', `📺 YouTube: ${stats.youtubeAvgMinutes} мин/день при бюджете ${stats.youtubeBudget}`);

  return lines.join('\n');
}
