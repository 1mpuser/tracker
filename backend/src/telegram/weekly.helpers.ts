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

// Порог «зачётного» дня. Должен совпадать с POMODORO_MIN в
// frontend/lib/pomodoro.ts: там по нему красится график, здесь — считается
// строка «В зачёте». Разъедутся — картинка и текст начнут противоречить.
export const POMODORO_MIN = 4;

function dayAndMonth(dateStr: string): string {
  const date = parseDateParam(dateStr);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const year = parseDateParam(weekEnd).getUTCFullYear();
  return `${dayAndMonth(weekStart)} — ${dayAndMonth(weekEnd)} ${year}`;
}

// Контракт: вызывается только для doneCount > 0 — нулевые сферы (untouched)
// в список категорий вообще не попадают, а уходят одной строкой «Не
// тронуты». Поэтому здесь нет и не нужна отдельная ветка для 0: она бы
// вернула ⚠️, что для нетронутой сферы неверно по смыслу.
export function categoryIcon(doneCount: number): string {
  return doneCount >= 5 ? '✅' : '⚠️';
}

// Русское счётное склонение: остаток 11–14 всегда даёт «дням», иначе решает
// последняя цифра. Без этого получалось «по 1 дням».
// Внимание: это только дательный падеж, пригодный ровно для оборота
// «по N дню/дням» (см. строку с рейтингом ниже). Для «за N дней» или
// «N дней подряд» нужна отдельная функция — эта не годится.
export function pluralDays(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'дням';
  return count % 10 === 1 ? 'дню' : 'дням';
}

export function fitsInCaption(text: string): boolean {
  return text.length <= TELEGRAM_CAPTION_LIMIT;
}

export function buildWeekSummary(stats: WeekStats): string {
  const qualifiedDays = stats.days.filter((d) => d.pomodoros >= POMODORO_MIN).length;

  const lines: string[] = [
    `📊 Неделя ${formatWeekRange(stats.weekStart, stats.weekEnd)}`,
    '',
    `🍅 Помидорок: ${stats.totalPomodoros} (в среднем ${stats.avgPomodoros}/день)`,
    // Ставится всегда, даже при нуле: это объяснение раскраске графика,
    // а не похвала, и без него картинка читается как загадка.
    `✅ В зачёте: ${qualifiedDays} из ${DAYS_IN_WEEK} дней`,
  ];

  if (stats.bestDay) {
    const weekdayName = WEEKDAYS_FULL[parseDateParam(stats.bestDay.date).getUTCDay()];
    lines.push(`🔥 Лучший день: ${weekdayName} — ${stats.bestDay.pomodoros}`);
  }

  if (stats.avgRating != null) {
    lines.push(`⭐ Средняя оценка: ${stats.avgRating}/10 (по ${stats.ratedDays} ${pluralDays(stats.ratedDays)})`);
  }

  if (stats.categories.length > 0) {
    lines.push('', 'Сферы за неделю');

    // Нетронутые сферы уезжают в одну спокойную строку: стена из крестиков
    // была главной причиной, по которой сводка читалась как выговор.
    const touched = stats.categories.filter((c) => c.doneCount > 0);
    const untouched = stats.categories.filter((c) => c.doneCount === 0);

    for (const c of touched) {
      lines.push(`${categoryIcon(c.doneCount)} ${escapeHtml(c.label)} ${c.doneCount}/${DAYS_IN_WEEK}`);
    }
    if (untouched.length > 0) {
      lines.push(`Не тронуты: ${untouched.map((c) => escapeHtml(c.label)).join(', ')}`);
    }
  }

  lines.push('', `📺 YouTube: ${stats.youtubeAvgMinutes} мин/день при бюджете ${stats.youtubeBudget}`);

  return lines.join('\n');
}
