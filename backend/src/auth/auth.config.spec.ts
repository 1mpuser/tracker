import { loadAuthConfig } from './auth.config';

function env(overrides: Record<string, string> = {}) {
  return { ...process.env, ...overrides };
}

describe('loadAuthConfig', () => {
  it('defaults to open signup, no resend, localhost cookies outside production', () => {
    const cfg = loadAuthConfig(env({ NODE_ENV: 'development' }));
    expect(cfg.signupMode).toBe('open');
    expect(cfg.resendApiKey).toBeNull();
    expect(cfg.cookieSecure).toBe(false);
    expect(cfg.appUrl).toBe('');
    expect(cfg.sessionDays).toBe(30);
  });

  const PROD_ENV = {
    NODE_ENV: 'production',
    APP_URL: 'https://tracker.example.com',
    RESEND_API_KEY: 're_xxx',
    MAIL_FROM: 'Трекер <noreply@example.com>',
    APP_ENCRYPTION_KEY: 'base64key000000000000000000000000',
  };

  it('falls back to secure cookies in production', () => {
    expect(loadAuthConfig(env({ ...PROD_ENV })).cookieSecure).toBe(true);
  });

  it('COOKIE_SECURE=false forces insecure cookies even in production', () => {
    expect(loadAuthConfig(env({ ...PROD_ENV, COOKIE_SECURE: 'false' })).cookieSecure).toBe(false);
  });

  it('rejects unknown signup modes', () => {
    expect(() => loadAuthConfig(env({ SIGNUP_MODE: 'nope' }))).toThrow(/SIGNUP_MODE/);
  });

  it('parses allowlist emails lowercased and trimmed', () => {
    const cfg = loadAuthConfig(env({ SIGNUP_MODE: 'allowlist', ALLOWED_EMAILS: ' A@B.c , D@e.f ' }));
    expect(cfg.allowedEmails.has('a@b.c')).toBe(true);
    expect(cfg.allowedEmails.has('d@e.f')).toBe(true);
  });

  it('throws in production without required env vars', () => {
    expect(() => loadAuthConfig(env({ NODE_ENV: 'production', APP_URL: '', RESEND_API_KEY: '', MAIL_FROM: '', APP_ENCRYPTION_KEY: '' }))).toThrow(
      /APP_URL.*RESEND_API_KEY.*MAIL_FROM.*APP_ENCRYPTION_KEY/s,
    );
  });

  it('passes production when all required vars are present', () => {
    const cfg = loadAuthConfig(
      env({
        NODE_ENV: 'production',
        APP_URL: 'https://tracker.example.com',
        RESEND_API_KEY: 're_xxx',
        MAIL_FROM: 'Трекер <noreply@example.com>',
        APP_ENCRYPTION_KEY: 'base64key000000000000000000000000',
      }),
    );
    expect(cfg.appUrl).toBe('https://tracker.example.com');
    expect(cfg.resendApiKey).toBe('re_xxx');
  });
});
