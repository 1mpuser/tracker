export interface EffectiveDue {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM or null
}

export function effectiveDue(item: {
  dueDate: string | null;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
}): EffectiveDue | null {
  // У архивной задачи эффективной даты нет — даже если dueDate остался в базе.
  // Иначе архивирование задачи с дедлайном переписывало бы напоминание со
  // STATUS:NEEDS-ACTION вместо того, чтобы удалить его.
  if (item.status === 'archived') return null;
  if (item.dueDate) return { date: item.dueDate, time: null };
  if (item.status === 'calendar' && item.scheduledDate) {
    return { date: item.scheduledDate, time: item.scheduledTime };
  }
  return null;
}

export function reminderUid(id: number): string {
  return `gtd-rem-${id}`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildReminderIcs(params: {
  uid: string;
  title: string;
  due: EffectiveDue | null;
  priority: boolean;
  completed: boolean;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tracker-gtd//EN',
    'BEGIN:VTODO',
    `UID:${params.uid}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
  ];
  if (params.due) {
    if (params.due.time) {
      const compactDate = params.due.date.replace(/-/g, '');
      const compactTime = params.due.time.replace(':', '') + '00';
      lines.push(`DUE:${compactDate}T${compactTime}`);
    } else {
      lines.push(`DUE;VALUE=DATE:${params.due.date.replace(/-/g, '')}`);
    }
  }
  lines.push(`PRIORITY:${params.priority ? '1' : '0'}`);
  lines.push(`STATUS:${params.completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}
