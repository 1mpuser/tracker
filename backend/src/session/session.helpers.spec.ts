import { countPomodoros, dayWindow, parseEvents } from './session.helpers';

function ics(body: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

describe('dayWindow', () => {
  it('returns UTC midnights for the UTC zone', () => {
    const { start, end } = dayWindow('2026-08-04', 'UTC');
    expect(start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('shifts the window by the named zone offset', () => {
    const { start, end } = dayWindow('2026-08-04', 'Europe/Moscow');
    expect(start.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-04T21:00:00.000Z');
  });

  it('handles a month boundary', () => {
    const { start, end } = dayWindow('2026-08-31', 'UTC');
    expect(start.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('parseEvents', () => {
  it('parses a UTC DTSTART/DTEND pair', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'DTEND:20260804T095500Z', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events).toHaveLength(1);
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
    expect(events[0].end.toISOString()).toBe('2026-08-04T09:55:00.000Z');
  });

  it('resolves a TZID-qualified local time', () => {
    const events = parseEvents(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART;TZID=Europe/Moscow:20260804T123000',
          'DTEND;TZID=Europe/Moscow:20260804T130000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      'UTC',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
    expect(events[0].end.toISOString()).toBe('2026-08-04T10:00:00.000Z');
  });

  it('treats a floating time as being in the given zone', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T123000', 'DTEND:20260804T130000', 'END:VEVENT'].join('\r\n')),
      'Europe/Moscow',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
  });

  it('derives the end from DURATION when DTEND is missing', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'DURATION:PT25M', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events[0].end.toISOString()).toBe('2026-08-04T09:55:00.000Z');
  });

  it('skips all-day events', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260804', 'DTEND;VALUE=DATE:20260805', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events).toEqual([]);
  });

  it('skips an event with neither DTEND nor DURATION', () => {
    const events = parseEvents(ics(['BEGIN:VEVENT', 'DTSTART:20260804T093000Z', 'END:VEVENT'].join('\r\n')), 'UTC');
    expect(events).toEqual([]);
  });

  it('parses several VEVENTs from one response', () => {
    const events = parseEvents(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260804T093000Z',
          'DTEND:20260804T095500Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'DTSTART:20260804T113000Z',
          'DTEND:20260804T115500Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      'UTC',
    );
    expect(events).toHaveLength(2);
  });

  it('unfolds RFC 5545 folded lines', () => {
    const events = parseEvents(
      ics(['BEGIN:VEVENT', 'DTSTART:20260804T09', ' 3000Z', 'DTEND:20260804T095500Z', 'END:VEVENT'].join('\r\n')),
      'UTC',
    );
    expect(events[0].start.toISOString()).toBe('2026-08-04T09:30:00.000Z');
  });

  it('returns an empty list for garbage input', () => {
    expect(parseEvents('not an ics at all', 'UTC')).toEqual([]);
  });
});

describe('countPomodoros', () => {
  const window = dayWindow('2026-08-04', 'UTC');
  const evt = (startIso: string, endIso: string) => ({ start: new Date(startIso), end: new Date(endIso) });

  it('counts events at or above the minute threshold', () => {
    const events = [
      evt('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z'),
      evt('2026-08-04T10:00:00Z', '2026-08-04T10:20:00Z'),
    ];
    expect(countPomodoros(events, window, 20)).toBe(2);
  });

  it('drops events shorter than the threshold', () => {
    const events = [evt('2026-08-04T09:00:00Z', '2026-08-04T09:15:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(0);
  });

  it('ignores events outside the window', () => {
    const events = [evt('2026-08-05T09:00:00Z', '2026-08-05T09:30:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(0);
  });

  it('counts an event crossing midnight in both days', () => {
    const events = [evt('2026-08-04T23:50:00Z', '2026-08-05T00:20:00Z')];
    expect(countPomodoros(events, window, 20)).toBe(1);
    expect(countPomodoros(events, dayWindow('2026-08-05', 'UTC'), 20)).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(countPomodoros([], window, 20)).toBe(0);
  });
});
