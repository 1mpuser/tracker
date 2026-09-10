import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let session: any;
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
    session = { isEnabled: jest.fn().mockReturnValue(true) };
    service = new SettingsService(prisma, session);
  });

  it('exposes sessionSyncEnabled from the session service on get', async () => {
    expect(await service.get(userId)).toEqual({
      id: 1,
      userId,
      distractionBudget: 60,
      distractionLabel: 'Залипание',
      notificationsEnabled: false,
      sessionSyncEnabled: true,
    });
    expect(prisma.settings.findUnique).toHaveBeenCalledWith({ where: { userId } });
  });

  it('reports the flag as false when the integration is off', async () => {
    session.isEnabled.mockReturnValue(false);
    expect((await service.get(userId)).sessionSyncEnabled).toBe(false);
  });

  it('keeps the flag on the update response', async () => {
    const result = await service.update(userId, { distractionBudget: 90 });
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
