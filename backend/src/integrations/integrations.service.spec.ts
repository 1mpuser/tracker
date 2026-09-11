import { BadRequestException, ConflictException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { isEncrypted } from '../common/crypto.util';
import { CalDavClient, ICloudCredentials } from '../icloud/caldav.client';

jest.mock('../icloud/caldav.client', () => ({
  CalDavClient: jest.fn().mockImplementation(() => ({
    getClient: jest.fn(),
    findCalendar: jest.fn(),
    forget: jest.fn(),
  })),
}));

const { CalDavClient: MockCalDav } = require('../icloud/caldav.client') as { CalDavClient: jest.Mock };

describe('IntegrationsService', () => {
  let prisma: any;
  let caldav: any;
  let service: IntegrationsService;
  const userId = 1;
  const creds: ICloudCredentials = { appleId: 'me@example.com', appPassword: 'aaaa-bbbb-cccc' };

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          userId,
          icloudAppleId: null,
          icloudAppPasswordEnc: null,
          icloudRemindersList: 'GTD',
          sessionCalendarName: null,
          sessionMinMinutes: 20,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    caldav = {
      getClient: jest.fn().mockResolvedValue({}),
      findCalendar: jest.fn().mockResolvedValue({ url: 'https://x/' }),
      forget: jest.fn(),
    };
    (MockCalDav as any).mockImplementation(() => caldav);
    service = new IntegrationsService(prisma, caldav as unknown as CalDavClient);
  });

  it('setICloud: неверный логин → 400, settings.update не вызван', async () => {
    caldav.getClient.mockResolvedValue(null);
    await expect(service.setICloud(userId, creds)).rejects.toThrow(BadRequestException);
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('setICloud: нет списка → 400 с понятным текстом', async () => {
    caldav.findCalendar.mockResolvedValue(null);
    await expect(service.setICloud(userId, creds)).rejects.toThrow(/нет списка/);
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('setICloud: успех сохраняет пароль зашифрованным, getICloud без пароля', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId,
      icloudAppleId: 'me@example.com',
      icloudAppPasswordEnc: (() => {
        const { encryptSecret } = require('../common/crypto.util');
        return encryptSecret('x', (service as any).encKey);
      })(),
      icloudRemindersList: 'GTD',
    });
    const result = await service.setICloud(userId, creds);

    const call = prisma.settings.update.mock.calls[0][0];
    expect(call.where).toEqual({ userId });
    expect(isEncrypted(call.data.icloudAppPasswordEnc)).toBe(true);
    expect(call.data.icloudAppleId).toBe('me@example.com');
    expect(call.data.icloudRemindersList).toBe('GTD');

    expect(JSON.stringify(result)).not.toContain('aaaa-bbbb-cccc');
    expect(result.configured).toBe(true);
    expect(result.appleId).toBe('me@example.com');
    expect(caldav.forget).toHaveBeenCalledWith(userId);
  });

  it('icloudCredentials расшифровывает пароль и возвращает в ICloudService', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId,
      icloudAppleId: 'me@example.com',
      icloudAppPasswordEnc: (() => {
        const { encryptSecret } = require('../common/crypto.util');
        return encryptSecret('aaaa-bbbb-cccc', (service as any).encKey);
      })(),
      icloudRemindersList: 'GTD',
    });

    await expect(service.icloudCredentials(userId)).resolves.toEqual(creds);
  });

  it('нерасшифровываемый секрет (сменённый APP_ENCRYPTION_KEY): null, не бросает, интеграции считаются ненастроенными', async () => {
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    // Чужой ключ: расшифровка упадёт на проверке GCM-тега.
    const { encryptSecret } = require('../common/crypto.util');
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId,
      icloudAppleId: 'me@example.com',
      icloudAppPasswordEnc: encryptSecret('aaaa-bbbb-cccc', Buffer.alloc(32, 1).toString('base64')),
      icloudRemindersList: 'GTD',
      sessionCalendarName: 'Focus',
      sessionMinMinutes: 20,
    });

    await expect(service.icloudCredentials(userId)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('aaaa-bbbb-cccc');

    // GET /settings видит iCloud и Session ненастроенными.
    await expect(service.getICloud(userId)).resolves.toMatchObject({ configured: false });
    await expect(service.getSession(userId)).resolves.toMatchObject({ configured: false, icloudConfigured: false });
  });

  it('clearICloud также выключает Session', async () => {
    prisma.settings.update.mockResolvedValue({});
    await service.clearICloud(userId);
    const call = prisma.settings.update.mock.calls[0][0];
    expect(call.data.sessionCalendarName).toBeNull();
    expect(call.data.icloudAppleId).toBeNull();
  });

  it('setSession без iCloud — 409', async () => {
    await expect(service.setSession(userId, { calendarName: 'Focus' })).rejects.toThrow(ConflictException);
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('setSession с календарём сохраняет имя и minMinutes', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId,
      icloudAppleId: 'me@example.com',
      icloudAppPasswordEnc: (() => {
        const { encryptSecret } = require('../common/crypto.util');
        return encryptSecret('aaaa-bbbb-cccc', (service as any).encKey);
      })(),
      icloudRemindersList: 'GTD',
      sessionCalendarName: null,
      sessionMinMinutes: 20,
    });

    await service.setSession(userId, { calendarName: 'Focus', minMinutes: 10 });

    const call = prisma.settings.update.mock.calls[0][0];
    expect(call.data.sessionCalendarName).toBe('Focus');
    expect(call.data.sessionMinMinutes).toBe(10);
    expect(caldav.findCalendar).toHaveBeenCalledWith(userId, creds, 'Focus');
  });

  it('sessionSyncEnabled требует и календарь, и учётку', async () => {
    expect(await service.sessionSyncEnabled(userId)).toBe(false);
  });
});
