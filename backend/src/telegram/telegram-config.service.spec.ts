import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramConfigService } from './telegram-config.service';
import { encryptSecret, isEncrypted } from '../common/crypto.util';

const VALID = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('TelegramConfigService', () => {
  let prisma: any;
  let telegram: any;
  let service: TelegramConfigService;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, userId: 1, telegramBotToken: null }),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramChat: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    telegram = {
      getMe: jest.fn(),
      sendText: jest.fn(),
      getUpdatesChats: jest.fn(),
    };
    service = new TelegramConfigService(prisma, telegram);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('resolveToken returns null when nothing is set', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, userId: 1, telegramBotToken: null });
    await expect(service.resolveToken(1)).resolves.toBeNull();
  });

  it('resolveToken decrypts an encrypted token', async () => {
    process.env.APP_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    service = new TelegramConfigService(prisma, telegram);
    const stored = encryptSecret(VALID, process.env.APP_ENCRYPTION_KEY);
    prisma.settings.findUnique.mockResolvedValue({ id: 1, userId: 1, telegramBotToken: stored });
    await expect(service.resolveToken(1)).resolves.toBe(VALID);
  });

  it('getBot never returns the full token', async () => {
    const stored = encryptSecret(VALID, (service as any).encKey);
    prisma.settings.findUnique.mockResolvedValue({ id: 1, userId: 1, telegramBotToken: stored });
    telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
    const view = await service.getBot(1);
    expect(view).toEqual({ configured: true, source: 'db', username: 'tracker_bot', tokenHint: '…AAAA' });
    expect(JSON.stringify(view)).not.toContain(VALID);
  });

  it('rejects a malformed token without calling telegram', async () => {
    await expect(service.setBotToken(1, 'nope')).rejects.toThrow(BadRequestException);
    expect(telegram.getMe).not.toHaveBeenCalled();
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('rejects a token telegram does not accept and does not save it', async () => {
    telegram.getMe.mockResolvedValue({ ok: false, error: 'Unauthorized' });
    await expect(service.setBotToken(1, VALID)).rejects.toThrow(BadRequestException);
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('saves a token that getMe accepts, encrypted (trimmed)', async () => {
    telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
    await service.setBotToken(1, `  ${VALID}\n`);
    const call = prisma.settings.update.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 1 });
    expect(isEncrypted(call.data.telegramBotToken)).toBe(true);
    expect(call.data.telegramBotToken).not.toContain(VALID);
  });

  it('recipients: uses db chats filtered by kind', async () => {
    prisma.telegramChat.findMany.mockResolvedValue([
      { chatId: '-1', daily: true, weekly: false },
      { chatId: '-2', daily: true, weekly: true },
    ]);
    await expect(service.recipients(1, 'week')).resolves.toEqual(['-2']);
    await expect(service.recipients(1, 'day')).resolves.toEqual(['-1', '-2']);
  });

  it('recipients: ignores env TELEGRAM_CHAT_ID entirely', async () => {
    process.env.TELEGRAM_CHAT_ID = '@legacy';
    prisma.telegramChat.findMany.mockResolvedValue([]);
    await expect(service.recipients(1, 'day')).resolves.toEqual([]);
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('createChat maps a unique violation to 409', async () => {
    prisma.telegramChat.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createChat(1, { title: 'A', chatId: '-1' })).rejects.toThrow(ConflictException);
  });

  it('updateChat and deleteChat throw 404 for a missing chat', async () => {
    prisma.telegramChat.findFirst.mockResolvedValue(null);
    await expect(service.updateChat(1, 5, { title: 'x' })).rejects.toThrow(NotFoundException);
    await expect(service.deleteChat(1, 5)).rejects.toThrow(NotFoundException);
  });

  it('discover hides chats that are already added', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId: 1,
      telegramBotToken: encryptSecret(VALID, (service as any).encKey),
    });
    prisma.telegramChat.findMany.mockResolvedValue([{ chatId: '-1' }]);
    telegram.getUpdatesChats.mockResolvedValue([
      { chatId: '-1', title: 'Уже есть', type: 'group' },
      { chatId: '-2', title: 'Новый', type: 'group' },
    ]);
    await expect(service.discover(1)).resolves.toEqual([{ chatId: '-2', title: 'Новый', type: 'group' }]);
  });

  it('discover requires a bot token', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, userId: 1, telegramBotToken: null });
    await expect(service.discover(1)).rejects.toThrow(ConflictException);
  });

  it('testChat sends the confirmation text and maps failure to 502', async () => {
    prisma.settings.findUnique.mockResolvedValue({
      id: 1,
      userId: 1,
      telegramBotToken: encryptSecret(VALID, (service as any).encKey),
    });
    prisma.telegramChat.findFirst.mockResolvedValue({ id: 5, chatId: '-5' });
    telegram.sendText.mockResolvedValue({ ok: false, error: 'chat not found' });
    await expect(service.testChat(1, 5)).rejects.toThrow(BadGatewayException);
    expect(telegram.sendText).toHaveBeenCalledWith(VALID, '-5', '✅ Трекер подключён к этому чату');
  });

  it('onModuleInit encrypts plaintext tokens left from the single-user era', async () => {
    prisma.settings.findMany.mockResolvedValue([
      { id: 1, userId: 7, telegramBotToken: '123456:PLAINTEXTTOKEN' },
      { id: 2, userId: 8, telegramBotToken: null },
    ]);
    prisma.settings.update.mockResolvedValue({});

    await service.onModuleInit();

    expect(prisma.settings.update).toHaveBeenCalledTimes(1);
    const call = prisma.settings.update.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 7 });
    expect(isEncrypted(call.data.telegramBotToken)).toBe(true);
  });
});
