import { TelegramService } from './telegram.service';

const day = {
  date: '2026-08-01',
  pomodoros: 7,
  rating: 8,
  comment: null,
  categories: [{ label: 'Спорт', done: true }],
};

describe('TelegramService.postDaySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '@my_channel';
    // Сервис глотает ошибки через logger.warn — глушим, чтобы вывод тестов был чистым.
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    jest.restoreAllMocks();
  });

  it('does nothing without a bot token', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without a chat id', async () => {
    delete process.env.TELEGRAM_CHAT_ID;

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when an env var is present but empty', async () => {
    process.env.TELEGRAM_CHAT_ID = '';

    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to sendMessage and returns the message id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });

    await expect(service.postDaySummary(day)).resolves.toBe(42);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('@my_channel');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('📅 1 августа 2026, суббота');
    expect(body.text).toContain('🍅 Помидорок: 7');
  });

  it('returns null on a non-2xx response without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request: chat not found',
    });

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });

  it('returns null when telegram replies ok:false in a 200 body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, description: 'blocked' }),
    });

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });

  it('returns null when fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.postDaySummary(day)).resolves.toBeNull();
  });

  it('redacts the bot token from the logged error message', async () => {
    const warnSpy = service['logger'].warn as jest.Mock;
    fetchMock.mockRejectedValue(
      new TypeError('Failed to parse URL from https://api.telegram.org/bot123:ABC/sendMessage'),
    );

    await service.postDaySummary(day);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = warnSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain('123:ABC');
    expect(loggedMessage).toContain('<redacted>');
  });
});

describe('TelegramService.postWeeklySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;
  // 1x1 прозрачный PNG — достаточно, чтобы проверить путь с картинкой.
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 77 } }),
    });
    (global as any).fetch = fetchMock;
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '@my_channel';
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    jest.restoreAllMocks();
  });

  it('does nothing without telegram configured', async () => {
    delete process.env.TELEGRAM_CHAT_ID;

    await expect(service.postWeeklySummary('текст', pngBase64)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a photo with the text as caption when a chart is given', async () => {
    const result = await service.postWeeklySummary('текст сводки', pngBase64);

    expect(result).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
  });

  it('falls back to a text message when no chart is given', async () => {
    const result = await service.postWeeklySummary('текст сводки', null);

    expect(result).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
  });

  it('sends photo and text separately when the caption is too long', async () => {
    await service.postWeeklySummary('x'.repeat(1025), pngBase64);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
    expect(fetchMock.mock.calls[1][0]).toContain('/sendMessage');
  });

  it('returns null when telegram rejects the post', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });

    await expect(service.postWeeklySummary('текст', pngBase64)).resolves.toBeNull();
  });

  it('never leaks the bot token into the log message', async () => {
    fetchMock.mockRejectedValue(new Error('failed for token 123:ABC'));
    const warn = service['logger'].warn as jest.Mock;

    await service.postWeeklySummary('текст', pngBase64);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('123:ABC');
  });

  it('still returns the photo id when the follow-up caption text fails to send', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' });
    const warn = service['logger'].warn as jest.Mock;

    const result = await service.postWeeklySummary('x'.repeat(1025), pngBase64);

    expect(result).toBe(77);
    expect(warn).toHaveBeenCalled();
  });

  it('still returns the photo id when the follow-up caption text throws', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) })
      .mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await service.postWeeklySummary('x'.repeat(1025), pngBase64);

    expect(result).toBe(77);
  });
});
