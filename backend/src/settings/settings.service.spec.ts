import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SettingsService(prisma);
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
