import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let prisma: any;
  let session: any;
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, youtubeBudget: 60, notificationsEnabled: false }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 1, youtubeBudget: 90, notificationsEnabled: false }),
      },
    };
    session = { isEnabled: jest.fn().mockReturnValue(true) };
    service = new SettingsService(prisma, session);
  });

  it('exposes sessionSyncEnabled from the session service on get', async () => {
    expect(await service.get()).toEqual({
      id: 1,
      youtubeBudget: 60,
      notificationsEnabled: false,
      sessionSyncEnabled: true,
    });
  });

  it('reports the flag as false when the integration is off', async () => {
    session.isEnabled.mockReturnValue(false);
    expect((await service.get()).sessionSyncEnabled).toBe(false);
  });

  it('keeps the flag on the update response', async () => {
    const result = await service.update({ youtubeBudget: 90 });
    expect(result.sessionSyncEnabled).toBe(true);
    expect(result.youtubeBudget).toBe(90);
  });

  it('creates the row with defaults if it does not exist yet', async () => {
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.settings.create.mockResolvedValue({ id: 1, youtubeBudget: 60, notificationsEnabled: false });

    const result = await service.get();

    expect(prisma.settings.create).toHaveBeenCalledWith({ data: { id: 1 } });
    expect(result.youtubeBudget).toBe(60);
  });

  it('returns the existing row without creating a new one', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, youtubeBudget: 90, notificationsEnabled: true });

    const result = await service.get();

    expect(prisma.settings.create).not.toHaveBeenCalled();
    expect(result.youtubeBudget).toBe(90);
  });
});
