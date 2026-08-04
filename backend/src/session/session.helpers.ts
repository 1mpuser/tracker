export interface CalendarEvent {
  start: Date;
  end: Date;
}

export interface DayWindow {
  start: Date;
  end: Date;
}

// Смещение пояса в миллисекундах для конкретного момента: форматируем момент
// в целевом поясе и сравниваем с тем же набором полей, прочитанным как UTC.
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hour12:false в части сред даёт "24" вместо "00" для полуночи.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - at.getTime();
}

// Локальное время в поясе -> абсолютный момент. Второй проход нужен на границах
// перевода часов: смещение зависит от искомого момента, а не от догадки.
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(firstPass), timeZone));
}

export function dayWindow(date: string, timeZone: string): DayWindow {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone),
    // Date.UTC сам переносит через границу месяца и года.
    end: zonedTimeToUtc(year, month, day + 1, 0, 0, 0, timeZone),
  };
}

function unfold(ics: string): string[] {
  return ics
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of raw.split(';').slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return params;
}

function parseIcsTime(value: string, params: Record<string, string>, timeZone: string): Date | null {
  // События «на весь день» пропускаем: сеанс Session всегда со временем, а
  // сутки длиной 24 часа дали бы ложную помидорку.
  if (params.VALUE === 'DATE') return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // RFC 5545 разрешает закавычивать значение параметра (TZID="Europe/Moscow") —
  // снимаем обрамляющие кавычки, иначе Intl не узнает пояс.
  const tzid = (params.TZID || timeZone).replace(/^"(.*)"$/, '$1');
  // Неизвестный/битый пояс (опечатка, Windows-имя вроде "Russian Standard Time")
  // валит Intl исключением — пусть вызывающий поймает его и пропустит это
  // событие, а не роняет разбор всего календаря.
  return zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, tzid);
}

function parseDurationMs(value: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, d, h, mi, s] = m;
  const ms = ((+(d ?? 0) * 24 + +(h ?? 0)) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
  return ms > 0 ? ms : null;
}

export function parseEvents(ics: string, timeZone: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let start: Date | null = null;
  let end: Date | null = null;
  let durationMs: number | null = null;
  let inEvent = false;
  // Глубина вложенных компонентов внутри VEVENT (например VALARM) — их
  // свойства (в т.ч. DURATION у аларма) не должны перетирать поля события.
  let nestDepth = 0;

  for (const line of unfold(ics)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      start = end = durationMs = null;
      nestDepth = 0;
      continue;
    }
    if (!inEvent) continue;
    if (nestDepth === 0 && line.startsWith('END:VEVENT')) {
      const finish = end ?? (start && durationMs ? new Date(start.getTime() + durationMs) : null);
      // Ни DTEND, ни DURATION — считать нечего, событие пропускаем.
      if (start && finish) events.push({ start, end: finish });
      inEvent = false;
      continue;
    }
    if (line.startsWith('BEGIN:')) {
      nestDepth++;
      continue;
    }
    if (line.startsWith('END:')) {
      if (nestDepth > 0) nestDepth--;
      continue;
    }
    // Свойства вложенного компонента (VALARM и т.п.) к самому событию не относятся.
    if (nestDepth > 0) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const key = name.split(';')[0].toUpperCase();
    try {
      if (key === 'DTSTART') start = parseIcsTime(value, parseParams(name), timeZone);
      else if (key === 'DTEND') end = parseIcsTime(value, parseParams(name), timeZone);
      else if (key === 'DURATION') durationMs = parseDurationMs(value);
    } catch {
      // Битый TZID (опечатка, неизвестный/Windows-пояс) не должен ронять
      // разбор всего календаря — просто не проставляем это поле, событие
      // без валидных start/end будет отфильтровано ниже как обычно.
    }
  }

  return events;
}

export function countPomodoros(events: CalendarEvent[], window: DayWindow, minMinutes: number): number {
  const minMs = minMinutes * 60_000;
  return events.filter(
    (e) =>
      e.end > window.start &&
      e.start < window.end &&
      e.end.getTime() - e.start.getTime() >= minMs,
  ).length;
}
