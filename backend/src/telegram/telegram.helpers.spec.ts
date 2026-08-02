import { buildDaySummary, escapeHtml, formatRuDate } from './telegram.helpers';

describe('escapeHtml', () => {
  it('escapes the three characters Telegram HTML mode cares about', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('escapes the ampersand first so entities are not double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves plain Cyrillic text untouched', () => {
    expect(escapeHtml('Спорт и чтение')).toBe('Спорт и чтение');
  });
});

describe('formatRuDate', () => {
  it('formats a date as day, genitive month, year, weekday', () => {
    expect(formatRuDate('2026-08-01')).toBe('1 августа 2026, суббота');
  });

  it('does not shift by a day on a month boundary', () => {
    expect(formatRuDate('2026-02-01')).toBe('1 февраля 2026, воскресенье');
    expect(formatRuDate('2026-01-31')).toBe('31 января 2026, суббота');
  });

  it('handles the last day of the year', () => {
    expect(formatRuDate('2026-12-31')).toBe('31 декабря 2026, четверг');
  });
});

describe('buildDaySummary', () => {
  const base = {
    date: '2026-08-01',
    pomodoros: 7,
    rating: 8,
    comment: 'Тяжёлое утро, но вытянул вечер',
    categories: [
      { label: 'Спорт', done: true },
      { label: 'Английский', done: true },
      { label: 'Медитация', done: false },
    ],
  };

  it('renders a full day', () => {
    expect(buildDaySummary(base)).toBe(
      [
        '📅 1 августа 2026, суббота',
        '',
        '🍅 Помидорок: 7',
        '⭐ Оценка: 8/10',
        '',
        'Сферы — 2 / 3',
        '✅ Спорт',
        '✅ Английский',
        '❌ Медитация',
        '',
        '💬 Тяжёлое утро, но вытянул вечер',
      ].join('\n'),
    );
  });

  it('omits the rating line when rating is null', () => {
    expect(buildDaySummary({ ...base, rating: null })).not.toContain('Оценка');
  });

  it('omits the rating line when rating is undefined (loose null check, not strict)', () => {
    expect(buildDaySummary({ ...base, rating: undefined as unknown as null })).not.toContain('Оценка');
  });

  it('omits the comment line when comment is null or blank', () => {
    expect(buildDaySummary({ ...base, comment: null })).not.toContain('💬');
    expect(buildDaySummary({ ...base, comment: '   ' })).not.toContain('💬');
  });

  it('trims the comment', () => {
    expect(buildDaySummary({ ...base, comment: '  ок  ' })).toContain('💬 ок');
  });

  it('always prints the pomodoro line, even at zero', () => {
    expect(buildDaySummary({ ...base, pomodoros: 0 })).toContain('🍅 Помидорок: 0');
  });

  it('omits the spheres block entirely when there are no active categories', () => {
    const result = buildDaySummary({ ...base, categories: [] });
    expect(result).not.toContain('Сферы');
    expect(result).not.toContain('✅');
  });

  it('counts all categories as done when they all are', () => {
    const result = buildDaySummary({
      ...base,
      categories: [
        { label: 'Спорт', done: true },
        { label: 'Код', done: true },
      ],
    });
    expect(result).toContain('Сферы — 2 / 2');
    expect(result).not.toContain('❌');
  });

  it('escapes html-significant characters in category labels and comment', () => {
    const result = buildDaySummary({
      ...base,
      categories: [{ label: 'Код <всё>', done: true }],
      comment: 'a & b',
    });
    expect(result).toContain('✅ Код &lt;всё&gt;');
    expect(result).toContain('💬 a &amp; b');
  });
});
