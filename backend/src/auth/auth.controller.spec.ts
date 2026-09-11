import { AuthController } from './auth.controller';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

function makeCfg(): AuthConfig {
  return {
    cookieSecure: false,
    sessionDays: 30,
  };
}

describe('AuthController', () => {
  let auth: any;
  let controller: AuthController;
  let cfg: AuthConfig;

  beforeEach(() => {
    auth = {
      login: jest.fn(),
      updateTimezone: jest.fn(),
      changePassword: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
    };
    cfg = makeCfg();
    controller = new AuthController(auth, cfg);
  });

  function resMock() {
    return { cookie: jest.fn(), clearCookie: jest.fn() };
  }
  const user = { id: 1, email: 'a@b.c', timezone: 'UTC' };

  it('login ставит HttpOnly cookie sid и возвращает {user}', async () => {
    auth.login.mockResolvedValue({ sessionToken: 'tok', user });
    const res = resMock() as any;

    const result = await controller.login({ email: 'a@b.c', password: 'password123' } as any, {} as any, res);

    expect(result).toEqual({ user });
    expect(res.cookie).toHaveBeenCalledWith(
      'sid',
      'tok',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' }),
    );
  });

  it('logout чистит cookie и удаляет сессию по токену из куки', async () => {
    const res = resMock() as any;
    const req = { cookies: { sid: 'secrettoken' } } as any;

    await controller.logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('sid', { path: '/' });
    expect(auth.logout).toHaveBeenCalledWith('secrettoken');
  });

  it('logout-all закрывает все сессии пользователя и чистит cookie', async () => {
    const res = resMock() as any;

    await controller.logoutAll(user, res);

    expect(auth.logoutAll).toHaveBeenCalledWith(1);
    expect(res.clearCookie).toHaveBeenCalledWith('sid', { path: '/' });
  });

  it('PATCH me обновляет часовой пояс', async () => {
    auth.updateTimezone.mockResolvedValue({ ...user, timezone: 'Europe/Moscow' });
    const result = await controller.updateMe(user, { timezone: 'Europe/Moscow' });
    expect(auth.updateTimezone).toHaveBeenCalledWith(1, 'Europe/Moscow');
    expect(result.user.timezone).toBe('Europe/Moscow');
  });
});
