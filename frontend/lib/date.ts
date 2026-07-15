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

export function todayUTC(): string {
  const now = new Date();
  return formatUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

export function formatDisplayDate(dateStr: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseUTC(dateStr));
}
