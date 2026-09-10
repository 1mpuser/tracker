import { AuthController } from './auth.controller';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

function makeCfg(): AuthConfig {
  return {
    appUrl: 'http://localhost:3001',
    signupMode: 'open',
    allowedEmails: new Set(),
    resendApiKey: null,
    mailFrom: 'noreply@example.com',
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
      register: jest.fn(),
      confirmByToken: jest.fn(),
      confirmByCode: jest.fn(),
      resendConfirmation: jest.fn(),
      login: jest.fn(),
      forgot: jest.fn(),
      reset: jest.fn(),
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

  it('confirm по токену вызывает confirmByToken', async () => {
    auth.confirmByToken.mockResolvedValue({ sessionToken: 'tok', user });
    const res = resMock() as any;

    await controller.confirm({ token: 'xyz' } as any, {} as any, res);

    expect(auth.confirmByToken).toHaveBeenCalledWith('xyz', { userAgent: undefined });
    expect(res.cookie).toHaveBeenCalled();
  });

  it('confirm по email+code вызывает confirmByCode', async () => {
    auth.confirmByCode.mockResolvedValue({ sessionToken: 'tok', user });
    const res = resMock() as any;

    await controller.confirm({ email: 'a@b.c', code: '123456' } as any, {} as any, res);

    expect(auth.confirmByCode).toHaveBeenCalledWith('a@b.c', '123456', { userAgent: undefined });
  });

  it('register/resend/forgot отвечают 204 и делегируют в сервис', async () => {
    await controller.register({ email: 'a@b.c', password: 'password123', timezone: 'UTC' } as any);
    expect(auth.register).toHaveBeenCalledWith('a@b.c', 'password123', 'UTC');

    await controller.resend({ email: 'a@b.c' } as any);
    expect(auth.resendConfirmation).toHaveBeenCalledWith('a@b.c');

    await controller.forgot({ email: 'a@b.c' } as any);
    expect(auth.forgot).toHaveBeenCalledWith('a@b.c');
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
