import { UserBootstrapService } from './user-bootstrap.service';
import { DEFAULT_CATEGORIES } from './default-categories';

// Строим мок-Prisma, у которого $transaction прогоняет колбэк на том же наборе
// «табличных» моков, что и сам клиент — так тест проверяет ровно то, что
// транзакция обращается к tx.user/tx.settings/tx.category, а не к prisma.*.
function makePrisma() {
  const tables = {
    user: { create: jest.fn() },
    settings: { create: jest.fn() },
    category: { createMany: jest.fn() },
  };
  const prisma = {
    ...tables,
    $transaction: jest.fn((cb: (tx: typeof tables) => unknown) => cb(tables)),
  };
  return { prisma, tables };
}

describe('UserBootstrapService', () => {
  it('creates a user, settings and default categories in one transaction', async () => {
    const { prisma, tables } = makePrisma();
    tables.user.create.mockImplementation(({ data }) => ({ id: 1, ...data }));
    tables.settings.create.mockImplementation(({ data }) => ({ id: 1, ...data }));
    tables.category.createMany.mockImplementation(({ data }) => {
      return { count: data.length };
    });
    const service = new UserBootstrapService(prisma as any);

    const user = await service.createUser({ email: 'a@b.c' });

    expect(tables.user.create).toHaveBeenCalledWith({
      data: { email: 'a@b.c', passwordHash: null, timezone: 'UTC' },
    });
    expect(tables.settings.create).toHaveBeenCalledWith({
      data: { userId: 1, distractionBudget: 60 },
    });
    const args = tables.category.createMany.mock.calls[0][0];
    expect(args.data).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(args.data.every((c: any) => c.userId === 1)).toBe(true);
    expect(user.id).toBe(1);
  });

  it('uses the env default distraction budget when set', async () => {
    process.env.DISTRACTION_BUDGET_DEFAULT = '90';
    const { prisma, tables } = makePrisma();
    tables.user.create.mockImplementation(({ data }) => ({ id: 2, ...data }));
    tables.settings.create.mockImplementation(({ data }) => ({ id: 1, ...data }));
    tables.category.createMany.mockResolvedValue({ count: 0 });
    const service = new UserBootstrapService(prisma as any);

    await service.createUser({ email: 'a@b.c' });

    expect(tables.settings.create).toHaveBeenCalledWith({
      data: { userId: 2, distractionBudget: 90 },
    });
    delete process.env.DISTRACTION_BUDGET_DEFAULT;
  });

  it('откатывает создание при занятой почте (P2002 падает из транзакции)', async () => {
    const { prisma, tables } = makePrisma();
    tables.user.create.mockRejectedValue({ code: 'P2002' });
    const service = new UserBootstrapService(prisma as any);

    await expect(service.createUser({ email: 'taken@b.c' })).rejects.toMatchObject({ code: 'P2002' });
    // Настройки и сферы для упавшего создания не записываются.
    expect(tables.settings.create).not.toHaveBeenCalled();
    expect(tables.category.createMany).not.toHaveBeenCalled();
  });
});
