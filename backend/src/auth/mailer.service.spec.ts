import { MailerService } from './mailer.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

function makeCfg(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    appUrl: 'http://localhost:3001',
    signupMode: 'open',
    allowedEmails: new Set(),
    resendApiKey: null,
    mailFrom: 'Трекер <noreply@example.com>',
    cookieSecure: false,
    sessionDays: 30,
    ...overrides,
  };
}

const mail = { subject: 'Тема', html: '<b>html</b>', text: 'text' };

describe('MailerService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
    delete process.env.NODE_ENV;
  });

  it('logs the message instead of sending when there is no key (non-production)', async () => {
    const service = new MailerService(makeCfg({ resendApiKey: null }));
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

    await service.send('a@b.c', mail);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('a@b.c'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('text'));
  });

  it('posts to Resend with the bearer key', async () => {
    const service = new MailerService(makeCfg({ resendApiKey: 're_secret' }));
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await service.send('a@b.c', mail);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer re_secret' }),
        body: JSON.stringify({
          from: 'Трекер <noreply@example.com>',
          to: ['a@b.c'],
          subject: 'Тема',
          html: '<b>html</b>',
          text: 'text',
        }),
      }),
    );
  });

  it('throws on Resend error without leaking the key', async () => {
    const service = new MailerService(makeCfg({ resendApiKey: 're_secret' }));
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized re_secret' });

    await expect(service.send('a@b.c', mail)).rejects.toThrow(/401/);
    await expect(service.send('a@b.c', mail)).rejects.not.toThrow(/re_secret/);
    try {
      await service.send('a@b.c', mail);
    } catch (e) {
      expect(String(e)).not.toContain('re_secret');
    }
  });
});
