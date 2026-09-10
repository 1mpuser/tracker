import { UserBootstrapService } from './user-bootstrap.service';
import { DEFAULT_CATEGORIES } from './default-categories';

describe('UserBootstrapService', () => {
  it('creates a user, settings and default categories in one go', async () => {
    const created: any[] = [];
    const prisma = {
      user: { create: jest.fn().mockImplementation(({ data }) => ({ id: 1, ...data })) },
      settings: { create: jest.fn().mockImplementation(({ data }) => ({ id: 1, ...data })) },
      category: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          created.push(...data);
          return { count: data.length };
        }),
      },
    };
    const service = new UserBootstrapService(prisma as any);

    const user = await service.createUser({ email: ' NEW@EXAMPLE.COM ' });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: ' NEW@EXAMPLE.COM ', passwordHash: null, timezone: 'UTC' },
    });
    expect(prisma.settings.create).toHaveBeenCalledWith({
      data: { userId: 1, distractionBudget: 60 },
    });
    expect(created).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(created.every((c) => c.userId === 1)).toBe(true);
    expect(user.id).toBe(1);
  });

  it('uses the env default distraction budget when set', async () => {
    process.env.DISTRACTION_BUDGET_DEFAULT = '90';
    const prisma = {
      user: { create: jest.fn().mockImplementation(({ data }) => ({ id: 2, ...data })) },
      settings: { create: jest.fn().mockImplementation(({ data }) => ({ id: 1, ...data })) },
      category: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new UserBootstrapService(prisma as any);

    await service.createUser({ email: 'a@b.c' });

    expect(prisma.settings.create).toHaveBeenCalledWith({
      data: { userId: 2, distractionBudget: 90 },
    });
    delete process.env.DISTRACTION_BUDGET_DEFAULT;
  });
});
