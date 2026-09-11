import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { hashPassword } from '../auth/password.util';

function makeCtx() {
  const prisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    session: { deleteMany: jest.fn() },
  };
  const bootstrap = { createUser: jest.fn() };
  const service = new AdminService(prisma as any, bootstrap as any);
  return { prisma, bootstrap, service };
}

describe('AdminService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAdmin', () => {
    it('true для админа, false для обычного и несуществующего', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValueOnce({ id: 1, isAdmin: true });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 2, isAdmin: false });
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.isAdmin(1)).resolves.toBe(true);
      await expect(service.isAdmin(2)).resolves.toBe(false);
      await expect(service.isAdmin(3)).resolves.toBe(false);
    });
  });

  describe('create', () => {
    it('нормализует почту, ставит пояс Europe/Moscow по умолчанию и хэширует пароль', async () => {
      const { bootstrap, service } = makeCtx();
      bootstrap.createUser.mockImplementation(async ({ email, passwordHash, timezone }) => ({
        id: 1,
        email,
        timezone,
        passwordHash,
        isAdmin: false,
        blockedAt: null,
        createdAt: new Date(),
      }));

      const view = await service.create({ email: '  NEW@EXAMPLE.COM ', password: 'password123' });

      expect(bootstrap.createUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        passwordHash: expect.stringMatching(/^scrypt\$/),
        timezone: 'Europe/Moscow',
      });
      expect(view.email).toBe('new@example.com');
      expect(view.timezone).toBe('Europe/Moscow');
    });

    it('занятая почта → 409, в том числе когда P2002 прилетел из транзакции', async () => {
      const { bootstrap, service } = makeCtx();
      bootstrap.createUser.mockRejectedValue({ code: 'P2002' });

      await expect(service.create({ email: 'taken@b.c', password: 'password123' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('неизвестный пояс → 400, пользователь не создаётся', async () => {
      const { bootstrap, service } = makeCtx();
      bootstrap.createUser.mockResolvedValue({});

      await expect(
        service.create({ email: 'a@b.c', password: 'password123', timezone: 'Europe/Moskow' }),
      ).rejects.toThrow(BadRequestException);
      expect(bootstrap.createUser).not.toHaveBeenCalled();
    });

    it('прочие ошибки Prisma пробрасываются как есть', async () => {
      const { bootstrap, service } = makeCtx();
      bootstrap.createUser.mockRejectedValue(new Error('boom'));

      await expect(service.create({ email: 'a@b.c', password: 'password123' })).rejects.toThrow('boom');
    });
  });

  describe('changePassword', () => {
    it('меняет пароль и удаляет все сессии учётки', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 5 });
      prisma.user.update.mockResolvedValue({ id: 5 });

      await service.changePassword(5, 'brandnew789');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { passwordHash: expect.stringMatching(/^scrypt\$/) },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
    });

    it('несуществующий id → 404', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword(99, 'brandnew789')).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('block', () => {
    it('ставит blockedAt и удаляет сессии', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 5 });
      prisma.user.update.mockResolvedValue({ id: 5 });
      prisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await service.block(1, 5);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { blockedAt: expect.any(Date) },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
    });

    it('нельзя заблокировать себя → 400, ничего не пишется', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.block(1, 1)).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('несуществующий id → 404', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.block(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unblock', () => {
    it('обнуляет blockedAt', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 5 });
      prisma.user.update.mockResolvedValue({ id: 5 });

      await service.unblock(5);

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { blockedAt: null } });
    });

    it('несуществующий id → 404', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.unblock(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('удаляет пользователя целиком (данные — каскадом)', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 5 });

      await service.remove(1, 5);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('нельзя удалить себя → 400', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.remove(1, 1)).rejects.toThrow(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('несуществующий id → 404', async () => {
      const { prisma, service } = makeCtx();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove(1, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
