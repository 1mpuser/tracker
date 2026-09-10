export interface AuthConfig {
  appUrl: string;
  signupMode: 'open' | 'allowlist' | 'closed';
  allowedEmails: Set<string>;
  resendApiKey: string | null;
  mailFrom: string | null;
  cookieSecure: boolean;
  sessionDays: number;
}

// DI-токен конфига аутентификации: провайдер создаётся фабрикой в AuthModule,
// чтобы loadAuthConfig() отработал при старте (в production без ключей падает сразу).
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

// В production без ключей и домена бэкенд падает при старте, а не при первой
// регистрации — иначе пароль владельца мог бы сброситься «в никуда».
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const isProd = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL?.trim() ?? '';
  const resendApiKey = env.RESEND_API_KEY?.trim() || null;
  const mailFrom = env.MAIL_FROM?.trim() || null;

  if (isProd) {
    const missing = [
      appUrl ? null : 'APP_URL',
      resendApiKey ? null : 'RESEND_API_KEY',
      mailFrom ? null : 'MAIL_FROM',
      env.APP_ENCRYPTION_KEY ? null : 'APP_ENCRYPTION_KEY',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`Нет обязательных переменных окружения в production: ${missing.join(', ')}`);
    }
  }

  const signupMode = env.SIGNUP_MODE?.trim() || 'open';
  if (signupMode !== 'open' && signupMode !== 'allowlist' && signupMode !== 'closed') {
    throw new Error(`SIGNUP_MODE может быть open, allowlist или closed, а не "${signupMode}"`);
  }

  const allowedEmails = new Set(
    (env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  const sessionDays = Number(env.SESSION_DAYS ?? 30);
  const cookieSecure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE === 'true' : isProd;

  return {
    appUrl,
    signupMode: signupMode as AuthConfig['signupMode'],
    allowedEmails,
    resendApiKey,
    mailFrom,
    cookieSecure,
    sessionDays: Number.isFinite(sessionDays) && sessionDays > 0 ? sessionDays : 30,
  };
}
