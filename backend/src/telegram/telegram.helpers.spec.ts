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
        '🍅 Помидорок: 7 — день в зачёте',
        '⭐ Оценка: 8/10',
        '',
        'Сферы — 2 / 3',
        '✅ Спорт',
        '✅ Английский',
        'Не тронуты: Медитация',
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

function makeDay(overrides: Partial<Parameters<typeof buildDaySummary>[0]> = {}) {
  return {
    date: '2026-08-05',
    pomodoros: 0,
    rating: null,
    comment: null,
    categories: [] as { label: string; done: boolean }[],
    ...overrides,
  };
}

describe('buildDaySummary pomodoro line', () => {
  it('marks a day that reached the minimum', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 6 }))).toContain('🍅 Помидорок: 6 — день в зачёте');
  });

  it('marks exactly the minimum as qualified', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 4 }))).toContain('🍅 Помидорок: 4 — день в зачёте');
  });

  it('says how many are missing below the minimum', () => {
    expect(buildDaySummary(makeDay({ pomodoros: 3 }))).toContain('🍅 Помидорок: 3 — до зачёта не хватило 1');
    expect(buildDaySummary(makeDay({ pomodoros: 1 }))).toContain('🍅 Помидорок: 1 — до зачёта не хватило 3');
  });

  it('does not nag on a day with nothing at all', () => {
    const text = buildDaySummary(makeDay({ pomodoros: 0 }));

    expect(text).toContain('🍅 Помидорок: 0');
    expect(text).not.toContain('не хватило');
    expect(text).not.toContain('зачёт');
  });
});

describe('buildDaySummary spheres', () => {
  it('lists only the closed spheres with a counter', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: true },
          { label: 'Финансы', done: false },
          { label: 'Обучение', done: true },
        ],
      }),
    );

    expect(text).toContain('Сферы — 2 / 3');
    expect(text).toContain('✅ Спорт');
    expect(text).toContain('✅ Обучение');
    expect(text).not.toContain('❌');
  });

  it('collapses untouched spheres into one line', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: true },
          { label: 'Финансы', done: false },
          { label: 'Проекты', done: false },
        ],
      }),
    );

    expect(text).toContain('Не тронуты: Финансы, Проекты');
  });

  it('omits the untouched line when everything is closed', () => {
    const text = buildDaySummary(makeDay({ categories: [{ label: 'Спорт', done: true }] }));

    expect(text).not.toContain('Не тронуты');
  });

  it('collapses the whole block when nothing is closed', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт', done: false },
          { label: 'Финансы', done: false },
        ],
      }),
    );

    expect(text).toContain('Сферы не тронуты');
    expect(text).not.toContain('Не тронуты:');
    expect(text).not.toContain('Сферы —');
    expect(text).not.toContain('❌');
  });

  it('omits the block entirely when there are no categories', () => {
    expect(buildDaySummary(makeDay({ categories: [] }))).not.toContain('Сферы');
  });

  it('escapes html in both the closed list and the untouched line', () => {
    const text = buildDaySummary(
      makeDay({
        categories: [
          { label: 'Спорт <b>', done: true },
          { label: 'Финансы <i>', done: false },
        ],
      }),
    );

    expect(text).toContain('Спорт &lt;b&gt;');
    expect(text).toContain('Финансы &lt;i&gt;');
    expect(text).not.toContain('<b>');
    expect(text).not.toContain('<i>');
  });
});

describe('buildDaySummary rating and comment', () => {
  it('keeps printing the rating and the comment when set', () => {
    const text = buildDaySummary(makeDay({ rating: 8, comment: 'Разобрал бэклог' }));

    expect(text).toContain('⭐ Оценка: 8/10');
    expect(text).toContain('💬 Разобрал бэклог');
  });

  it('omits both when unset', () => {
    const text = buildDaySummary(makeDay());

    expect(text).not.toContain('Оценка');
    expect(text).not.toContain('💬');
  });
});
