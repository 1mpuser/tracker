import { buildReminderIcs, effectiveDue, reminderUid } from './icloud.helpers';

describe('effectiveDue', () => {
  it('uses dueDate when set, regardless of status', () => {
    expect(
      effectiveDue({ dueDate: '2026-08-01', status: 'backlog', scheduledDate: null, scheduledTime: null }),
    ).toEqual({ date: '2026-08-01', time: null });
  });

  it('falls back to scheduledDate/scheduledTime when status is calendar and no dueDate', () => {
    expect(
      effectiveDue({ dueDate: null, status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '14:30' }),
    ).toEqual({ date: '2026-08-02', time: '14:30' });
  });

  it('returns null when status is calendar but no scheduledDate somehow', () => {
    expect(effectiveDue({ dueDate: null, status: 'calendar', scheduledDate: null, scheduledTime: null })).toBeNull();
  });

  it('returns null when neither dueDate nor calendar-with-scheduledDate applies', () => {
    expect(
      effectiveDue({ dueDate: null, status: 'someday', scheduledDate: '2026-08-02', scheduledTime: null }),
    ).toBeNull();
  });

  it('prefers dueDate over scheduledDate when both are present', () => {
    expect(
      effectiveDue({ dueDate: '2026-08-01', status: 'calendar', scheduledDate: '2026-08-02', scheduledTime: '09:00' }),
    ).toEqual({ date: '2026-08-01', time: null });
  });
});

describe('reminderUid', () => {
  it('builds a deterministic id-based uid', () => {
    expect(reminderUid(42)).toBe('gtd-rem-42');
  });
});

describe('buildReminderIcs', () => {
  it('includes a date-only DUE when time is null', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-1',
      title: 'Позвонить в банк',
      due: { date: '2026-08-01', time: null },
      priority: false,
      completed: false,
    });
    expect(ics).toContain('UID:gtd-rem-1');
    expect(ics).toContain('SUMMARY:Позвонить в банк');
    expect(ics).toContain('DUE;VALUE=DATE:20260801');
    expect(ics).toContain('STATUS:NEEDS-ACTION');
  });

  it('includes a date+time DUE when time is set', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-2',
      title: 'Встреча',
      due: { date: '2026-08-01', time: '14:30' },
      priority: true,
      completed: false,
    });
    expect(ics).toContain('DUE:20260801T143000');
    expect(ics).toContain('PRIORITY:1');
  });

  it('marks completed items as STATUS:COMPLETED', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-3',
      title: 'Сделано',
      due: { date: '2026-08-01', time: null },
      priority: false,
      completed: true,
    });
    expect(ics).toContain('STATUS:COMPLETED');
  });

  it('omits DUE entirely when due is null', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-4',
      title: 'Без даты',
      due: null,
      priority: false,
      completed: false,
    });
    expect(ics).not.toContain('DUE');
  });

  it('escapes commas, semicolons and backslashes in the title', () => {
    const ics = buildReminderIcs({
      uid: 'gtd-rem-5',
      title: 'A, B; C\\D',
      due: null,
      priority: false,
      completed: false,
    });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D');
  });
});
