import type { CookieOptions } from 'express';

export interface AuthConfig {
  cookieSecure: boolean;
  sessionDays: number;
}

// Опции cookie сессии общие для AuthController (выдача при входе) и
// SessionGuard (перевыдача при продлении срока) — иначе разойдутся.
export function sessionCookieOptions(cfg: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.sessionDays * 86_400_000,
  };
}

// DI-токен конфига аутентификации: провайдер создаётся фабрикой в AuthModule,
// чтобы loadAuthConfig() отработал при старте (в production без ключа падает сразу).
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

// В production без ключа шифрования бэкенд падает при старте — секреты
// интеграций (APP_ENCRYPTION_KEY проверяется также в common/crypto.util.ts).
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const isProd = env.NODE_ENV === 'production';

  if (isProd && !env.APP_ENCRYPTION_KEY) {
    throw new Error('Нет обязательных переменных окружения в production: APP_ENCRYPTION_KEY');
  }

  const sessionDays = Number(env.SESSION_DAYS ?? 30);
  const cookieSecure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE === 'true' : isProd;

  return {
    cookieSecure,
    sessionDays: Number.isFinite(sessionDays) && sessionDays > 0 ? sessionDays : 30,
  };
}
