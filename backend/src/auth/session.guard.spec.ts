import { UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

function makeCfg(): AuthConfig {
  return { cookieSecure: false, sessionDays: 30 };
}

function makeContext(req: any, res: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any;
}

describe('SessionGuard', () => {
  let auth: any;
  let reflector: any;
  let guard: SessionGuard;

  beforeEach(() => {
    auth = { resolveSession: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    guard = new SessionGuard(auth, reflector, makeCfg());
  });

  it('пропускает @Public() без куки и без обращения к сессии', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(makeContext({}, {}))).resolves.toBe(true);
    expect(auth.resolveSession).not.toHaveBeenCalled();
  });

  it('без куки sid — 401', async () => {
    await expect(guard.canActivate(makeContext({ cookies: {} }, {}))).rejects.toThrow(UnauthorizedException);
  });

  it('разрешает сессию, кладёт пользователя и не трогает cookie, если срок не продлевался', async () => {
    auth.resolveSession.mockResolvedValue({ user: { id: 1, email: 'a@b.c', timezone: 'UTC' }, renewExpiresAt: false });
    const res = { cookie: jest.fn() };
    const req: any = { cookies: { sid: 'tok' } };

    await expect(guard.canActivate(makeContext(req, res))).resolves.toBe(true);

    expect(req.user).toEqual({ id: 1, email: 'a@b.c', timezone: 'UTC' });
    expect(req.sessionToken).toBe('tok');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('при продлении срока перевыставляет cookie sid с общими опциями', async () => {
    auth.resolveSession.mockResolvedValue({ user: { id: 1, email: 'a@b.c', timezone: 'UTC' }, renewExpiresAt: true });
    const res = { cookie: jest.fn() };
    const req: any = { cookies: { sid: 'tok' } };

    await expect(guard.canActivate(makeContext(req, res))).resolves.toBe(true);

    expect(res.cookie).toHaveBeenCalledWith('sid', 'tok', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86_400_000,
    });
  });

  it('неразрешённая сессия — 401', async () => {
    auth.resolveSession.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext({ cookies: { sid: 'nope' } }, {}))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
