import { TelegramDeliveryService } from './telegram-delivery.service';

const summary = {
  date: '2026-08-01',
  pomodoros: 7,
  rating: null,
  comment: null,
  categories: [],
};

describe('TelegramDeliveryService', () => {
  let prisma: any;
  let config: any;
  let telegram: any;
  let service: TelegramDeliveryService;

  beforeEach(() => {
    prisma = {
      day: { findUnique: jest.fn().mockResolvedValue({ id: 1, telegramMessageId: null, weeklyTelegramMessageId: null }) },
      telegramPost: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 10, ...data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    config = { resolveToken: jest.fn().mockResolvedValue('T'), recipients: jest.fn().mockResolvedValue(['-1', '-2']) };
    telegram = {
      sendDaySummary: jest.fn().mockResolvedValue({ ok: true, messageId: 77 }),
      sendWeeklySummary: jest.fn().mockResolvedValue({ ok: true, messageId: 88 }),
    };
    service = new TelegramDeliveryService(prisma, config, telegram);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isConfigured requires a token and at least one recipient', async () => {
    await expect(service.isConfigured(1, 'day')).resolves.toBe(true);
    config.resolveToken.mockResolvedValue(null);
    await expect(service.isConfigured(1, 'day')).resolves.toBe(false);
  });

  it('sends the day summary to every daily recipient and records each post', async () => {
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(prisma.telegramPost.create).toHaveBeenCalledWith({ data: { dayId: 1, chatId: '-1', kind: 'day', messageId: 0 } });
    expect(prisma.telegramPost.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { messageId: 77 } });
    expect(telegram.sendDaySummary).toHaveBeenCalledWith('T', '-2', summary);
  });

  it('skips a chat whose slot is already claimed', async () => {
    prisma.telegramPost.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 11, ...data }));
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(telegram.sendDaySummary).toHaveBeenCalledTimes(1);
    expect(telegram.sendDaySummary).toHaveBeenCalledWith('T', '-2', summary);
  });

  it('releases the slot when sending fails so the next close retries', async () => {
    telegram.sendDaySummary.mockResolvedValueOnce({ ok: false, error: 'chat not found' });
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 1, failed: 1, skipped: 0 });
    expect(prisma.telegramPost.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('does nothing without a token', async () => {
    config.resolveToken.mockResolvedValue(null);
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(prisma.telegramPost.create).not.toHaveBeenCalled();
  });

  it('treats a day posted by the legacy single-chat code as already delivered everywhere', async () => {
    prisma.day.findUnique.mockResolvedValue({ id: 1, telegramMessageId: 555, weeklyTelegramMessageId: null });
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(telegram.sendDaySummary).not.toHaveBeenCalled();
  });

  it('weekly: uses weekly recipients and the legacy weekly column', async () => {
    prisma.day.findUnique.mockResolvedValue({ id: 1, telegramMessageId: 555, weeklyTelegramMessageId: null });
    await expect(service.deliverWeek(1, 1, 'text', 'png')).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(config.recipients).toHaveBeenCalledWith(1, 'week');
    expect(telegram.sendWeeklySummary).toHaveBeenCalledWith('T', '-1', 'text', 'png');
  });

  it('a thrown send error still releases the slot and does not break other chats', async () => {
    telegram.sendDaySummary.mockRejectedValueOnce(new Error('boom'));
    await expect(service.deliverDay(1, 1, summary)).resolves.toEqual({ sent: 1, failed: 1, skipped: 0 });
    expect(prisma.telegramPost.delete).toHaveBeenCalledTimes(1);
  });
});
