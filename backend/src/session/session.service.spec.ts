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
  const user = { id: 1, email: 'a@b.c', timezone: 'UTC' };
  let caldav: any;
  let integrations: any;
  let client: any;
  let service: SessionService;

  beforeEach(() => {
    client = { fetchCalendarObjects: jest.fn().mockResolvedValue([]) };
    caldav = {
      getClient: jest.fn().mockResolvedValue(client),
      findCalendar: jest.fn().mockResolvedValue({ url: 'https://caldav.icloud.com/cal/' }),
    };
    integrations = {
      getSession: jest.fn().mockResolvedValue({
        configured: true,
        calendarName: 'Session',
        minMinutes: 20,
        icloudConfigured: true,
      }),
      icloudCredentials: jest.fn().mockResolvedValue({
        appleId: 'me@example.com',
        appPassword: 'app-specific-password',
      }),
    };
    service = new SessionService(caldav, integrations);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is disabled when the calendar name is empty', async () => {
    integrations.getSession.mockResolvedValue({ calendarName: null, minMinutes: 20 });
    expect(await service.isEnabledFor(user)).toBe(false);
    expect(await service.syncDate(user, '2026-08-04')).toBeNull();
    expect(caldav.findCalendar).not.toHaveBeenCalled();
  });

  it('is disabled without iCloud credentials', async () => {
    integrations.icloudCredentials.mockResolvedValue(null);
    expect(await service.isEnabledFor(user)).toBe(false);
    expect(await service.syncDate(user, '2026-08-04')).toBeNull();
  });

  it('returns null when the calendar is not found', async () => {
    caldav.findCalendar.mockResolvedValue(null);
    expect(await service.syncDate(user, '2026-08-04')).toBeNull();
  });

  it('returns null when the CalDAV request throws', async () => {
    client.fetchCalendarObjects.mockRejectedValue(new Error('network down'));
    expect(await service.syncDate(user, '2026-08-04')).toBeNull();
  });

  it('returns 0 when the calendar answers with no events', async () => {
    expect(await service.syncDate(user, '2026-08-04')).toBe(0);
  });

  it('counts qualifying events from the calendar response', async () => {
    client.fetchCalendarObjects.mockResolvedValue([
      { data: icsEvent('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z') },
      { data: icsEvent('2026-08-04T10:00:00Z', '2026-08-04T10:30:00Z') },
      { data: icsEvent('2026-08-04T11:00:00Z', '2026-08-04T11:10:00Z') },
    ]);
    expect(await service.syncDate(user, '2026-08-04')).toBe(2);
  });

  it('asks the calendar for the requested day window in the user timezone', async () => {
    await service.syncDate(user, '2026-08-04');
    expect(client.fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: { start: '2026-08-04T00:00:00.000Z', end: '2026-08-05T00:00:00.000Z' },
      }),
    );
  });

  it('uses the user timezone (not env TZ) for day windows', async () => {
    const moscow = { id: 2, email: 'm@b.c', timezone: 'Europe/Moscow' };
    await service.syncDate(moscow, '2026-08-04');
    expect(client.fetchCalendarObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        timeRange: { start: '2026-08-03T21:00:00.000Z', end: '2026-08-04T21:00:00.000Z' },
      }),
    );
  });

  it('reads minMinutes from the user settings', async () => {
    integrations.getSession.mockResolvedValue({ calendarName: 'Session', minMinutes: 30 });
    client.fetchCalendarObjects.mockResolvedValue([
      { data: icsEvent('2026-08-04T09:00:00Z', '2026-08-04T09:25:00Z') },
    ]);
    // 25 минут ≥ 30 не набирает помидорку — было бы 1 при дефолтных 20.
    expect(await service.syncDate(user, '2026-08-04')).toBe(0);
  });

  it('never leaks the app password into the log message', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    client.fetchCalendarObjects.mockRejectedValue(new Error('failed for app-specific-password'));
    await service.syncDate(user, '2026-08-04');
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });
});
