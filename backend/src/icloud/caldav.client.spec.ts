jest.mock('tsdav', () => ({
  DAVClient: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockRejectedValue(new Error('Unauthorized for app-specific-password')),
    fetchCalendars: jest.fn().mockRejectedValue(new Error('discovery broke on app-specific-password')),
  })),
}));

import { CalDavClient } from './caldav.client';

describe('CalDavClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ICLOUD_APPLE_ID = 'me@example.com';
    process.env.ICLOUD_APP_PASSWORD = 'app-specific-password';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('never leaks the app password when login fails', async () => {
    const client = new CalDavClient();
    const warn = jest.spyOn((client as any).logger, 'warn').mockImplementation(() => undefined);
    const result = await client.getClient();
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });

  it('never leaks the app password when calendar discovery fails', async () => {
    const client = new CalDavClient();
    const warn = jest.spyOn((client as any).logger, 'warn').mockImplementation(() => undefined);
    // login должен пройти на этот раз, чтобы дойти до fetchCalendars.
    (client as any).client = { fetchCalendars: jest.fn().mockRejectedValue(new Error('broke on app-specific-password')) };
    const result = await client.findCalendar('Session');
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('app-specific-password');
  });
});
