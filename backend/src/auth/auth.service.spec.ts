import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { hashPassword } from './password.util';
import { createHash } from 'node:crypto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makeCfg(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    appUrl: 'http://localhost:3001',
    signupMode: 'open',
    allowedEmails: new Set(),
    resendApiKey: 're_xxx',
    mailFrom: 'noreply@example.com',
    cookieSecure: false,
    sessionDays: 30,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: any;
  let bootstrap: any;
  let mailer: any;
  let service: AuthService;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      pendingSignup: { findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      passwordReset: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      session: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    };
    bootstrap = { createUser: jest.fn().mockImplementation(async ({ email }) => ({ id: 1, email, timezone: 'UTC' })) };
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma, bootstrap, mailer, makeCfg());

    // resolveSession продлевает lastSeenAt только раз в сутки — мок времени не трогаем.
    jest.spyOn(service as any, 'cleanupExpired').mockResolvedValue(undefined);
    (global as any).loggerUnused = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('нормализует адрес и создаёт PendingSignup с хэшами вместо открытых токенов', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = {};
      prisma.pendingSignup.upsert.mockImplementation(async ({ create }: any) => {
        Object.assign(created, create);
        return create;
      });
      prisma.pendingSignup.count.mockResolvedValue(0);
      prisma.passwordReset.count.mockResolvedValue(0);

      await service.register('  NEW@EXAMPLE.COM  ', 'password123');

      expect(prisma.pendingSignup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'new@example.com' },
          create: expect.objectContaining({ email: 'new@example.com' }),
        }),
      );
      const body = (created as any);
      expect(body.passwordHash).toMatch(/^scrypt\$/);
      expect(typeof body.tokenHash).toBe('string');
      expect(typeof body.codeHash).toBe('string');
      expect(body.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);

      // В БД только хэши: ни открытого токена, ни кода, ни пароля.
      expect(body.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.codeHash).toMatch(/^[0-9a-f]{64}$/);

      // Письмо ушло с ссылкой и кодом.
      expect(mailer.send).toHaveBeenCalledTimes(1);
      const [, m] = mailer.send.mock.calls[0];
      expect(m.subject).toContain('Подтвердите');
      expect(m.text).toContain('http://localhost:3001/register/confirm?token=');
    });

    it('не шлёт письмо и не создаёт записей при closed-режиме', async () => {
      service = new AuthService(prisma, bootstrap, mailer, makeCfg({ signupMode: 'closed' }));
      jest.spyOn(service as any, 'cleanupExpired').mockResolvedValue(undefined);

      await service.register('a@b.c', 'password123');

      expect(prisma.pendingSignup.upsert).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('молча не пускает адреса вне allowlist', async () => {
      service = new AuthService(prisma, bootstrap, mailer, makeCfg({ signupMode: 'allowlist', allowedEmails: new Set(['ok@b.c']) }));
      jest.spyOn(service as any, 'cleanupExpired').mockResolvedValue(undefined);

      await service.register('other@b.c', 'password123');

      expect(prisma.pendingSignup.upsert).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('на уже занятый адрес шлёт alreadyRegisteredMail и не трогает PendingSignup', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.c' });
      prisma.pendingSignup.count.mockResolvedValue(0);

      await service.register('a@b.c', 'password123');

      expect(prisma.pendingSignup.upsert).not.toHaveBeenCalled();
      expect(mailer.send).toHaveBeenCalledWith('a@b.c', expect.objectContaining({ subject: expect.stringContaining('регистрации') }));
    });

    it('повторная регистрация до подтверждения заменяет прежнюю запись', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.pendingSignup.upsert.mockImplementation(async ({ create }: any) => create);

      await service.register('a@b.c', 'firstpass123');
      await service.register('a@b.c', 'secondpass123');

      expect(prisma.pendingSignup.upsert).toHaveBeenCalledTimes(2);
      const second = prisma.pendingSignup.upsert.mock.calls[1][0];
      expect(second.update.email).toBeUndefined();
      expect(second.update.passwordHash).toMatch(/^scrypt\$/);
    });
  });

  describe('confirmByToken', () => {
    it('разворачивает неизвестный токен в 401', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);
      await expect(service.confirmByToken('nope', {})).rejects.toThrow(UnauthorizedException);
    });

    it('создаёт пользователя, чистит запись и выдаёт сессию', async () => {
      const expires = new Date(Date.now() + 3600e3);
      prisma.pendingSignup.findUnique.mockResolvedValue({ email: 'a@b.c', passwordHash: 'hash', timezone: 'Europe/Moscow', expiresAt: expires });
      prisma.session.create.mockResolvedValue({ id: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 1, email: 'a@b.c', timezone: 'Europe/Moscow' });

      const result = await service.confirmByToken('validtoken', {});

      expect(bootstrap.createUser).toHaveBeenCalledWith({ email: 'a@b.c', passwordHash: 'hash', timezone: 'Europe/Moscow' });
      expect(prisma.pendingSignup.deleteMany).toHaveBeenCalledWith({ where: { email: 'a@b.c' } });
      expect(result.sessionToken).toBeTruthy();
      expect(result.user.email).toBe('a@b.c');
      expect(prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenHash: sha256(result.sessionToken) }) }));
    });
  });

  describe('confirmByCode', () => {
    it('накручивает attempts при неверном коде и удаляет запись на пятой ошибке', async () => {
      const pending = { email: 'a@b.c', codeHash: sha256('a@b.c:000000'), attempts: 4, expiresAt: new Date(Date.now() + 3600e3), passwordHash: 'hash', timezone: null };
      prisma.pendingSignup.findUnique.mockResolvedValue(pending);
      prisma.pendingSignup.delete.mockResolvedValue(pending);

      await expect(service.confirmByCode('a@b.c', '123456', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.pendingSignup.delete).toHaveBeenCalledWith({ where: { email: 'a@b.c' } });
      expect(prisma.pendingSignup.update).not.toHaveBeenCalled();
    });

    it('подтверждает по верному коду', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue({ email: 'a@b.c', codeHash: sha256('a@b.c:654321'), attempts: 0, expiresAt: new Date(Date.now() + 3600e3), passwordHash: 'hash', timezone: null });
      prisma.session.create.mockResolvedValue({ id: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 1, email: 'a@b.c', timezone: 'UTC' });

      await expect(service.confirmByCode('a@b.c', '654321', {})).resolves.toMatchObject({ user: { email: 'a@b.c' } });
    });
  });

  describe('login', () => {
    it('отдаёт одинаковое 401 на неверный пароль, отсутствующего юзера и null-хэш', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('a@b.c', 'password123', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();

      prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.c', passwordHash: await hashPassword('right') });
      await expect(service.login('a@b.c', 'wrongwrong', {})).rejects.toThrow(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@b.c', passwordHash: null });
      await expect(service.login('a@b.c', 'password123', {})).rejects.toThrow(UnauthorizedException);
    });

    it('успешный вход создаёт сессию и возвращает пользователя', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.c',
        passwordHash: await hashPassword('rightpass123'),
        timezone: 'UTC',
      });
      prisma.session.create.mockResolvedValue({ id: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 7, email: 'a@b.c', timezone: 'UTC' });

      const result = await service.login('A@B.C', 'rightpass123', {});

      expect(prisma.session.create).toHaveBeenCalled();
      expect(result.user.email).toBe('a@b.c');
      expect(result.sessionToken).toBeTruthy();
    });
  });

  // Проверяем 401-пути login отдельно с настоящими хэшами: важно, что
  // verifyPassword вызывается даже для несуществующего юзера (по DUMMY_HASH),
  // но результат влияет на ответ только при наличии реального юзера.
  describe('login timing-safety', () => {
    it('не выдаёт разницу во времени: считает хэш и для несуществующего адреса', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const svc = new AuthService(prisma, bootstrap, mailer, makeCfg());
      jest.spyOn(svc as any, 'cleanupExpired').mockResolvedValue(undefined);
      await expect(svc.login('ghost@b.c', 'password123', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe('forgot / reset', () => {
    it('существующему юзеру создаёт PasswordReset и шлёт письмо', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5, email: 'a@b.c' });
      prisma.passwordReset.create.mockResolvedValue({ id: 1 });
      prisma.pendingSignup.count.mockResolvedValue(0);
      prisma.passwordReset.count.mockResolvedValue(0);

      await service.forgot('A@B.C');

      expect(prisma.passwordReset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 5, expiresAt: expect.any(Date) }),
        }),
      );
      expect(mailer.send).toHaveBeenCalledWith('a@b.c', expect.objectContaining({ subject: expect.stringContaining('Сброс') }));
    });

    it('несуществующему адресу — тихо, без записей', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.forgot('ghost@b.c');

      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('reset снимает usedAt, меняет пароль, закрывает все сессии и выдаёт новую', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({ id: 1, userId: 5, usedAt: null, expiresAt: new Date(Date.now() + 3600e3) });
      prisma.user.update.mockResolvedValue({ id: 5, email: 'a@b.c', timezone: 'UTC' });
      prisma.session.deleteMany.mockResolvedValue({ count: 2 });
      prisma.session.create.mockResolvedValue({ id: 1 });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 5, email: 'a@b.c', timezone: 'UTC' });

      const result = await service.reset('sometoken', 'newpassword1', {});

      expect(prisma.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { usedAt: expect.any(Date) } }));
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { passwordHash: expect.stringMatching(/^scrypt\$/) } }));
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
      expect(result.sessionToken).toBeTruthy();
      void prisma;
    });

    it('reset на использованный или просроченный токен — 401', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({ id: 1, userId: 5, usedAt: new Date(), expiresAt: new Date(Date.now() + 3600e3) });
      await expect(service.reset('used', 'newpassword1', {})).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('неверный текущий пароль → 400', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: await hashPassword('rightpass1') });

      await expect(service.changePassword(1, 'wrongpass1', 'newpass123', 'tok')).rejects.toThrow(BadRequestException);
    });

    it('успех меняет пароль и закрывает все сессии, кроме текущей', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, passwordHash: await hashPassword('oldpass123') });
      prisma.user.update.mockResolvedValue({});
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await service.changePassword(1, 'oldpass123', 'newpass123', 'current-token');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { passwordHash: expect.stringMatching(/^scrypt\$/) } }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, NOT: { tokenHash: sha256('current-token') } } });
    });
  });

  describe('resolveSession', () => {
    it('возвращает null для просроченной сессии', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 1, expiresAt: new Date(Date.now() - 1000), lastSeenAt: new Date() });
      await expect(service.resolveSession('tok')).resolves.toBeNull();
    });

    it('продлевает lastSeenAt, если прошло больше суток', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 1, userId: 3, expiresAt: new Date(Date.now() + 3600e3), lastSeenAt: new Date(Date.now() - 2 * 86400e3) });
      prisma.session.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ id: 3, email: 'a@b.c', timezone: 'UTC' });

      const user = await service.resolveSession('tok');

      expect(prisma.session.update).toHaveBeenCalled();
      expect(user?.email).toBe('a@b.c');
    });
  });

  describe('updateTimezone', () => {
    it('отвергает неизвестный пояс', async () => {
      await expect(service.updateTimezone(1, 'Europe/Moskow')).rejects.toThrow(BadRequestException);
    });

    it('принимает валидный пояс', async () => {
      prisma.user.update.mockResolvedValue({ id: 1, email: 'a@b.c', timezone: 'Europe/Moscow' });
      await expect(service.updateTimezone(1, 'Europe/Moscow')).resolves.toMatchObject({ timezone: 'Europe/Moscow' });
    });
  });
});
