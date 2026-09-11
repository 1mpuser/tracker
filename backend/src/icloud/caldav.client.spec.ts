import { DAVClient } from 'tsdav';
import { CalDavClient } from './caldav.client';

const creds = { appleId: 'me@example.com', appPassword: 'app-specific-password' };

describe('CalDavClient', () => {
  let loginSpy: jest.SpyInstance;
  let fetchCalendarsSpy: jest.SpyInstance;

  beforeEach(() => {
    loginSpy = jest.spyOn(DAVClient.prototype, 'login').mockResolvedValue(undefined as never);
    fetchCalendarsSpy = jest.spyOn(DAVClient.prototype, 'fetchCalendars').mockResolvedValue([] as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never leaks the app password when login fails', async () => {
    loginSpy.mockRejectedValue(new Error('Unauthorized for app-specific-password'));
    const client = new CalDavClient();
    const warn = jest.spyOn((client as any).logger, 'warn').mockImplementation(() => undefined);

    const result = await client.getClient(1, creds);

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });

  it('never leaks the app password when calendar discovery fails', async () => {
    fetchCalendarsSpy.mockRejectedValue(new Error('broke on app-specific-password'));
    const client = new CalDavClient();
    const warn = jest.spyOn((client as any).logger, 'warn').mockImplementation(() => undefined);

    const result = await client.findCalendar(1, creds, 'Session');

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });

  it('caches a client per user per credential fingerprint and reuses it', async () => {
    const c1 = new CalDavClient();
    await c1.getClient(1, creds);
    await c1.getClient(1, creds);
    expect(loginSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed login and retries next call', async () => {
    loginSpy.mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(undefined as never);
    const c1 = new CalDavClient();

    await c1.getClient(1, creds);
    const second = await c1.getClient(1, creds);

    expect(second).toBeTruthy();
    expect(loginSpy).toHaveBeenCalledTimes(2);
  });

  it('drops the cached client after changing credentials', async () => {
    const c1 = new CalDavClient();
    await c1.getClient(1, creds);
    await c1.getClient(1, { appleId: 'me@example.com', appPassword: 'new-app-password' });
    expect(loginSpy).toHaveBeenCalledTimes(2);
  });

  it('forget clears the user cache', async () => {
    const c1 = new CalDavClient();
    await c1.getClient(1, creds);
    c1.forget(1);
    await c1.getClient(1, creds);
    expect(loginSpy).toHaveBeenCalledTimes(2);
  });

  it('finds a calendar by displayName per user', async () => {
    fetchCalendarsSpy.mockResolvedValue([{ displayName: 'Session', url: 'https://example/x' }] as never);
    const c1 = new CalDavClient();
    const cal = await c1.findCalendar(1, creds, 'Session');
    expect(cal?.displayName).toBe('Session');
  });

  it('смена Apple ID не подхватывает кэш календарей старой учётки', async () => {
    fetchCalendarsSpy.mockResolvedValue([{ displayName: 'GTD', url: 'https://example/old' }] as never);
    const c1 = new CalDavClient();
    await c1.findCalendar(1, creds, 'GTD');

    fetchCalendarsSpy.mockResolvedValue([{ displayName: 'GTD', url: 'https://example/new' }] as never);
    const cal = await c1.findCalendar(1, { appleId: 'other@example.com', appPassword: 'app-specific-password' }, 'GTD');

    expect(cal?.url).toBe('https://example/new');
    expect(fetchCalendarsSpy).toHaveBeenCalledTimes(2);
  });

  it('forget сбрасывает кэш календарей по префиксу userId, невзирая на отпечаток в ключе', async () => {
    fetchCalendarsSpy.mockResolvedValue([{ displayName: 'GTD', url: 'https://example/x' }] as never);
    const c1 = new CalDavClient();
    await c1.findCalendar(1, creds, 'GTD');

    c1.forget(1);
    fetchCalendarsSpy.mockClear();

    const cal = await c1.findCalendar(1, creds, 'GTD');
    expect(cal?.url).toBe('https://example/x');
    expect(fetchCalendarsSpy).toHaveBeenCalledTimes(1);
  });
});
