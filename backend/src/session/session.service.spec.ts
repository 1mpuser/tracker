import { SessionService } from './session.service';

function icsEvent(startIso: string, endIso: string): string {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    `DTSTART:${stamp(new Date(startIso).toISOString())}`,
    `DTEND:${stamp(new Date(endIso).toISOString())}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('SessionService', () => {
  const originalEnv = { ...process.env };
  let caldav: any;
  let client: any;
  let service: SessionService;

  beforeEach(() => {
    process.env.ICLOUD_APPLE_ID = 'me@example.com';
    process.env.ICLOUD_APP_PASSWORD = 'app-specific-password';
    process.env.SESSION_CALENDAR_NAME = 'Session';
    process.env.SESSION_MIN_MINUTES = '20';
    process.env.TZ = 'UTC';
    client = { fetchCalendarObjects: jest.fn().mockResolvedValue([]) };
    caldav = {
      hasCredentials: jest.fn().mockReturnValue(true),
      getClient: jest.fn().mockResolvedValue(client),
      findCalendar: jest.fn().mockResolvedValue({ url: 'https://caldav.icloud.com/cal/' }),
    };
    service = new SessionService(caldav);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is disabled when the calendar name is empty', async () => {
    process.env.SESSION_CALENDAR_NAME = '';
    expect(service.isEnabled()).toBe(false);
    expect(await service.syncDate('2026-08-04')).toBeNull();
    expect(caldav.findCalendar).not.toHaveBeenCalled();
  });

  it('is disabled without iCloud credentials', () => {
    caldav.hasCredentials.mockReturnValue(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('returns null when the calendar is not found', async () => {
    caldav.findCalendar.mockResolvedValue(null);
    expect(await service.syncDate('2026-08-04')).toBeNull();
  });

  it('returns null when the CalDAV request throws', async () => {
    client.fetchCalendarObjects.mockRejectedValue(new Error('network down'));
    expect(await service.syncDate('2026-08-04')).toBeNull();
  });

  it('returns 0 when the calendar answers with no events', async () => {
    expect(await service.syncDate('2026-08-04')).toBe(0);
  });

  it('counts qualifying events from the calendar response', async () => {
    client.fetchCalendarObjects.mockResolvedValue([
      { data: icsEvent('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z') },
      { data: icsEvent('2026-08-04T10:00:00Z', '2026-08-04T10:30:00Z') },
      { data: icsEvent('2026-08-04T11:00:00Z', '2026-08-04T11:10:00Z') },
    ]);
    expect(await service.syncDate('2026-08-04')).toBe(2);
  });

  it('asks the calendar for the requested day window', async () => {
    await service.syncDate('2026-08-04');
    expect(client.fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: { start: '2026-08-04T00:00:00.000Z', end: '2026-08-05T00:00:00.000Z' },
      }),
    );
  });

  it('falls back to UTC and warns when TZ is misspelled instead of failing the sync', async () => {
    process.env.TZ = 'Europe/Moskow';
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    client.fetchCalendarObjects.mockResolvedValue([
      { data: icsEvent('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z') },
    ]);
    expect(await service.syncDate('2026-08-04')).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Europe/Moskow'));
    expect(client.fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: { start: '2026-08-04T00:00:00.000Z', end: '2026-08-05T00:00:00.000Z' },
      }),
    );
  });

  it('never leaks the app password into the log message', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    client.fetchCalendarObjects.mockRejectedValue(new Error('failed for app-specific-password'));
    await service.syncDate('2026-08-04');
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });
});
