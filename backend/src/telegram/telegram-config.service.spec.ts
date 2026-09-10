import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramConfigService } from './telegram-config.service';

const VALID = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('TelegramConfigService', () => {
  const userId = 1;
  let prisma: any;
  let telegram: any;
  let service: TelegramConfigService;

  beforeEach(() => {
    prisma = {
      settings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('prefers the db token over env', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env:token';
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
    await expect(service.resolveToken(userId)).resolves.toBe(VALID);
  });

  it('falls back to env token when db has none', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env:token';
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: null });
    await expect(service.resolveToken(userId)).resolves.toBe('env:token');
  });

  it('treats an empty env token as absent', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '';
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: null });
    await expect(service.resolveToken(userId)).resolves.toBeNull();
  });

  it('getBot never returns the full token', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
    telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
    const view = await service.getBot(userId);
    expect(view).toEqual({ configured: true, source: 'db', username: 'tracker_bot', tokenHint: '…AAAA' });
    expect(JSON.stringify(view)).not.toContain(VALID);
  });

  it('rejects a malformed token without calling telegram', async () => {
    await expect(service.setBotToken(userId, 'nope')).rejects.toThrow(BadRequestException);
    expect(telegram.getMe).not.toHaveBeenCalled();
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('rejects a token telegram does not accept and does not save it', async () => {
    telegram.getMe.mockResolvedValue({ ok: false, error: 'Unauthorized' });
    await expect(service.setBotToken(userId, VALID)).rejects.toThrow(BadRequestException);
    expect(prisma.settings.update).not.toHaveBeenCalled();
  });

  it('saves a token that getMe accepts (trimmed)', async () => {
    telegram.getMe.mockResolvedValue({ ok: true, username: 'tracker_bot' });
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
    await service.setBotToken(userId, `  ${VALID}\n`);
    expect(prisma.settings.update).toHaveBeenCalledWith({ where: { userId: 1 }, data: { telegramBotToken: VALID } });
  });

  it('recipients: uses db chats filtered by kind', async () => {
    prisma.telegramChat.findMany.mockResolvedValue([
      { chatId: '-1', daily: true, weekly: false },
      { chatId: '-2', daily: true, weekly: true },
    ]);
    await expect(service.recipients(userId, 'week')).resolves.toEqual(['-2']);
    await expect(service.recipients(userId, 'day')).resolves.toEqual(['-1', '-2']);
  });

  it('recipients: falls back to env chat only when the table is empty', async () => {
    process.env.TELEGRAM_CHAT_ID = '@legacy';
    prisma.telegramChat.findMany.mockResolvedValue([]);
    await expect(service.recipients(userId, 'day')).resolves.toEqual(['@legacy']);
  });

  it('recipients: ignores env chat once any db chat exists, even if disabled for this kind', async () => {
    process.env.TELEGRAM_CHAT_ID = '@legacy';
    prisma.telegramChat.findMany.mockResolvedValue([{ chatId: '-1', daily: false, weekly: true }]);
    await expect(service.recipients(userId, 'day')).resolves.toEqual([]);
  });

  it('createChat maps a unique violation to 409', async () => {
    prisma.telegramChat.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createChat(userId, { title: 'A', chatId: '-1' })).rejects.toThrow(ConflictException);
  });

  it('updateChat and deleteChat throw 404 for a missing chat', async () => {
    prisma.telegramChat.findUnique.mockResolvedValue(null);
    await expect(service.updateChat(userId, 5, { title: 'x' })).rejects.toThrow(NotFoundException);
    await expect(service.deleteChat(userId, 5)).rejects.toThrow(NotFoundException);
  });

  it('discover hides chats that are already added', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
    prisma.telegramChat.findMany.mockResolvedValue([{ chatId: '-1' }]);
    telegram.getUpdatesChats.mockResolvedValue([
      { chatId: '-1', title: 'Уже есть', type: 'group' },
      { chatId: '-2', title: 'Новый', type: 'group' },
    ]);
    await expect(service.discover(userId)).resolves.toEqual([{ chatId: '-2', title: 'Новый', type: 'group' }]);
  });

  it('discover requires a bot token', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: null });
    await expect(service.discover(userId)).rejects.toThrow(ConflictException);
  });

  it('testChat sends the confirmation text and maps failure to 502', async () => {
    prisma.settings.findUnique.mockResolvedValue({ id: 1, telegramBotToken: VALID });
    prisma.telegramChat.findFirst.mockResolvedValue({ id: 5, chatId: '-5' });
    telegram.sendText.mockResolvedValue({ ok: false, error: 'chat not found' });
    await expect(service.testChat(userId, 5)).rejects.toThrow(BadGatewayException);
    expect(telegram.sendText).toHaveBeenCalledWith(VALID, '-5', '✅ Трекер подключён к этому чату');
  });
});
