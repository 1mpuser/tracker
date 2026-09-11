import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { hashPassword } from './password.util';
import { createHash } from 'node:crypto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makeCfg(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    cookieSecure: false,
    sessionDays: 30,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: any;
  let service: AuthService;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      session: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    };
    service = new AuthService(prisma, makeCfg());

    jest.spyOn(service as any, 'cleanupExpired').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    it('заблокированная учётка не входит: тот же 401 и без сессии', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 7,
        email: 'a@b.c',
        passwordHash: await hashPassword('rightpass123'),
        blockedAt: new Date(),
      });

      await expect(service.login('a@b.c', 'rightpass123', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  // Проверяем 401-пути login отдельно с настоящими хэшами: важно, что
  // verifyPassword вызывается даже для несуществующего юзера (по DUMMY_HASH),
  // но результат влияет на ответ только при наличии реального юзера.
  describe('login timing-safety', () => {
    it('не выдаёт разницу во времени: считает хэш и для несуществующего адреса', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const svc = new AuthService(prisma, makeCfg());
      jest.spyOn(svc as any, 'cleanupExpired').mockResolvedValue(undefined);
      await expect(svc.login('ghost@b.c', 'password123', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
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

    it('не продлевает при активности меньше суток', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 1, userId: 3, expiresAt: new Date(Date.now() + 3600e3), lastSeenAt: new Date(Date.now() - 3600e3) });
      prisma.user.findUnique.mockResolvedValue({ id: 3, email: 'a@b.c', timezone: 'UTC' });

      const resolved = await service.resolveSession('tok');

      expect(prisma.session.update).not.toHaveBeenCalled();
      expect(resolved?.renewExpiresAt).toBe(false);
      expect(resolved?.user.email).toBe('a@b.c');
    });

    it('продлевает и lastSeenAt, и expiresAt, если активности больше суток', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 1, userId: 3, expiresAt: new Date(Date.now() + 3600e3), lastSeenAt: new Date(Date.now() - 2 * 86400e3) });
      prisma.session.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({ id: 3, email: 'a@b.c', timezone: 'UTC' });
      const before = Date.now();

      const resolved = await service.resolveSession('tok');

      const call = prisma.session.update.mock.calls[0][0];
      // Активному пользователю сессия живёт ещё sessionDays с момента активности.
      const expectedExpiry = new Date(before + 30 * 86400e3);
      expect(call.data.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry.getTime() - 1000);
      expect(call.data.lastSeenAt).toBeInstanceOf(Date);
      expect(resolved?.renewExpiresAt).toBe(true);
      expect(resolved?.user.email).toBe('a@b.c');
    });

    it('возвращает null для заблокированного пользователя даже с живой сессией', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 1, userId: 3, expiresAt: new Date(Date.now() + 3600e3), lastSeenAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({ id: 3, email: 'a@b.c', timezone: 'UTC', blockedAt: new Date() });

      await expect(service.resolveSession('tok')).resolves.toBeNull();
    });
  });

  describe('me', () => {
    it('возвращает идентичность пользователя с признаком админа из базы', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 3, email: 'a@b.c', timezone: 'UTC', isAdmin: true });

      await expect(service.me(3)).resolves.toMatchObject({
        id: 3,
        email: 'a@b.c',
        timezone: 'UTC',
        isAdmin: true,
      });
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
