import { loadAuthConfig } from './auth.config';

function env(overrides: Record<string, string> = {}) {
  return { ...process.env, ...overrides };
}

describe('loadAuthConfig', () => {
  it('defaults to non-secure cookies and 30 session days outside production', () => {
    const cfg = loadAuthConfig(env({ NODE_ENV: 'development' }));
    expect(cfg.cookieSecure).toBe(false);
    expect(cfg.sessionDays).toBe(30);
  });

  const PROD_ENV = {
    NODE_ENV: 'production',
    APP_ENCRYPTION_KEY: 'base64key000000000000000000000000',
  };

  it('falls back to secure cookies in production', () => {
    expect(loadAuthConfig(env({ ...PROD_ENV })).cookieSecure).toBe(true);
  });

  it('COOKIE_SECURE=false forces insecure cookies even in production', () => {
    expect(loadAuthConfig(env({ ...PROD_ENV, COOKIE_SECURE: 'false' })).cookieSecure).toBe(false);
  });

  it('throws in production without APP_ENCRYPTION_KEY', () => {
    expect(() => loadAuthConfig(env({ NODE_ENV: 'production' }))).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it('passes production when APP_ENCRYPTION_KEY is present', () => {
    expect(() => loadAuthConfig(env({ ...PROD_ENV }))).not.toThrow();
  });
});
