export function parseUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function formatUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Deliberately LOCAL wall-clock date, not UTC — "what day is it" should track
// the user's own calendar, same reasoning as the local time windows in
// notifications.ts. Every other function in this file stays UTC since they
// only transform an already-known date string, not "now".
export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseUTC(dateStr));
}

function formatDayMonth(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    parseUTC(dateStr),
  );
}

export function formatOriginDate(originDate: string, targetDate: string): string {
  const diffDays = Math.round((parseUTC(targetDate).getTime() - parseUTC(originDate).getTime()) / 86_400_000);
  if (diffDays === 1) return 'вчера';
  if (diffDays === 2) return 'позавчера';
  return `с ${formatDayMonth(originDate)}`;
}
