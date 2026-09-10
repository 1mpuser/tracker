import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let integrations: any;
  let service: SettingsService;
  const userId = 1;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          userId,
          distractionBudget: 60,
          distractionLabel: 'Залипание',
          notificationsEnabled: false,
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 1,
          userId,
          distractionBudget: 90,
          distractionLabel: 'Залипание',
          notificationsEnabled: false,
        }),
      },
    };
    integrations = {
      icloudConfigured: jest.fn().mockResolvedValue(true),
      sessionSyncEnabled: jest.fn().mockResolvedValue(true),
    };
    service = new SettingsService(prisma, integrations);
  });

  it('exposes per-user integration flags on get', async () => {
    expect(await service.get(userId)).toEqual({
      id: 1,
      userId,
      distractionBudget: 60,
      distractionLabel: 'Залипание',
      notificationsEnabled: false,
      icloudEnabled: true,
      sessionSyncEnabled: true,
      obsidianEnabled: false,
    });
    expect(prisma.settings.findUnique).toHaveBeenCalledWith({ where: { userId } });
  });

  it('reports flags as false when the integrations are off', async () => {
    integrations.icloudConfigured.mockResolvedValue(false);
    integrations.sessionSyncEnabled.mockResolvedValue(false);
    const view = await service.get(userId);
    expect(view.icloudEnabled).toBe(false);
    expect(view.sessionSyncEnabled).toBe(false);
  });

  it('keeps the flags on the update response', async () => {
    const result = await service.update(userId, { distractionBudget: 90 });
    expect(result.icloudEnabled).toBe(true);
    expect(result.sessionSyncEnabled).toBe(true);
    expect(result.distractionBudget).toBe(90);
    expect(prisma.settings.update).toHaveBeenCalledWith({ where: { userId }, data: { distractionBudget: 90 } });
  });

  it('passes distractionLabel through on update', async () => {
    prisma.settings.update.mockResolvedValue({
      id: 1,
      userId,
      distractionBudget: 60,
      distractionLabel: 'Шортсы',
      notificationsEnabled: false,
    });
    const result = await service.update(userId, { distractionLabel: 'Шортсы' });
    expect(prisma.settings.update).toHaveBeenCalledWith({
      where: { userId },
      data: { distractionLabel: 'Шортсы' },
    });
    expect(result.distractionLabel).toBe('Шортсы');
  });

  it('creates the row with defaults if it does not exist yet', async () => {
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.settings.create.mockResolvedValue({
      id: 1,
      userId,
      distractionBudget: 60,
      distractionLabel: 'Залипание',
      notificationsEnabled: false,
    });

    const result = await service.get(userId);

    expect(prisma.settings.create).toHaveBeenCalledWith({ data: { userId } });
    expect(result.distractionBudget).toBe(60);
  });

  it('returns the existing row without creating a new one', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId,
      distractionBudget: 90,
      distractionLabel: 'Залипание',
      notificationsEnabled: true,
    });

    const result = await service.get(userId);

    expect(prisma.settings.create).not.toHaveBeenCalled();
    expect(result.distractionBudget).toBe(90);
  });
});
