import { TelegramService } from './telegram.service';

const day = {
  date: '2026-08-01',
  pomodoros: 7,
  rating: 8,
  comment: null,
  categories: [{ label: 'Спорт', done: true }],
};

function setupFetch(): jest.Mock {
  const fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe('TelegramService.getMe', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = setupFetch();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the bot username', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { username: 'my_tracker_bot' } }) });
    await expect(service.getMe('123:ABC')).resolves.toEqual({ ok: true, username: 'my_tracker_bot' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/bot123:ABC/getMe');
  });

  it('reports telegram rejection', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '{"description":"Unauthorized"}' });
    const result = await service.getMe('123:ABC');
    expect(result.ok).toBe(false);
  });

  it('never leaks the token into the error', async () => {
    fetchMock.mockRejectedValue(new TypeError('bad url https://api.telegram.org/bot123:ABC/getMe'));
    const result = await service.getMe('123:ABC');
    expect(result).toEqual({ ok: false, error: expect.not.stringContaining('123:ABC') });
  });
});

describe('TelegramService.getUpdatesChats', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = setupFetch();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collects unique chats from messages, channel posts and membership updates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          { message: { chat: { id: 111, type: 'private', first_name: 'Аня', last_name: 'К' } } },
          { message: { chat: { id: 111, type: 'private', first_name: 'Аня', last_name: 'К' } } },
          { channel_post: { chat: { id: -1001, type: 'channel', title: 'Мой канал' } } },
          { my_chat_member: { chat: { id: -222, type: 'group', title: 'Вдвоём' } } },
        ],
      }),
    });
    await expect(service.getUpdatesChats('123:ABC')).resolves.toEqual([
      { chatId: '111', title: 'Аня К', type: 'private' },
      { chatId: '-1001', title: 'Мой канал', type: 'channel' },
      { chatId: '-222', title: 'Вдвоём', type: 'group' },
    ]);
  });

  it('returns an empty list on failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(service.getUpdatesChats('123:ABC')).resolves.toEqual([]);
  });
});

describe('TelegramService.sendDaySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = setupFetch();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to sendMessage and returns the message id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) });

    await expect(service.sendDaySummary('123:ABC', '@my_channel', day)).resolves.toEqual({ ok: true, messageId: 42 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('@my_channel');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('📅 1 августа 2026, суббота');
    expect(body.text).toContain('🍅 Помидорок: 7');
  });

  it('reports ok:false on a non-2xx response without throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request: chat not found' });

    const result = await service.sendDaySummary('123:ABC', '@my_channel', day);
    expect(result.ok).toBe(false);
  });

  it('reports ok:false when telegram replies ok:false in a 200 body', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: false, description: 'blocked' }) });

    const result = await service.sendDaySummary('123:ABC', '@my_channel', day);
    expect(result.ok).toBe(false);
  });

  it('reports ok:false when fetch itself throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.sendDaySummary('123:ABC', '@my_channel', day);
    expect(result.ok).toBe(false);
  });

  it('redacts the bot token from the logged error message', async () => {
    const warnSpy = service['logger'].warn as jest.Mock;
    fetchMock.mockRejectedValue(
      new TypeError('Failed to parse URL from https://api.telegram.org/bot123:ABC/sendMessage'),
    );

    await service.sendDaySummary('123:ABC', '@my_channel', day);

    const loggedMessage = warnSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain('123:ABC');
    expect(loggedMessage).toContain('<redacted>');
  });
});

describe('TelegramService.sendWeeklySummary', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;
  // 1x1 прозрачный PNG — достаточно, чтобы проверить путь с картинкой.
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) });
    (global as any).fetch = fetchMock;
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a photo with the text as caption when a chart is given', async () => {
    const result = await service.sendWeeklySummary('123:ABC', '@my_channel', 'текст сводки', pngBase64);

    expect(result).toEqual({ ok: true, messageId: 77 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
  });

  it('falls back to a text message when no chart is given', async () => {
    const result = await service.sendWeeklySummary('123:ABC', '@my_channel', 'текст сводки', null);

    expect(result).toEqual({ ok: true, messageId: 77 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
  });

  it('sends photo and text separately when the caption is too long', async () => {
    await service.sendWeeklySummary('123:ABC', '@my_channel', 'x'.repeat(1025), pngBase64);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendPhoto');
    expect(fetchMock.mock.calls[1][0]).toContain('/sendMessage');
  });

  it('reports ok:false when telegram rejects the post', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });

    const result = await service.sendWeeklySummary('123:ABC', '@my_channel', 'текст', pngBase64);
    expect(result.ok).toBe(false);
  });

  it('never leaks the bot token into the log message', async () => {
    fetchMock.mockRejectedValue(new Error('failed for token 123:ABC'));
    const warn = service['logger'].warn as jest.Mock;

    await service.sendWeeklySummary('123:ABC', '@my_channel', 'текст', pngBase64);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('123:ABC');
  });

  it('still returns the photo id when the follow-up caption text fails to send', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' });
    const warn = service['logger'].warn as jest.Mock;

    const result = await service.sendWeeklySummary('123:ABC', '@my_channel', 'x'.repeat(1025), pngBase64);

    expect(result).toEqual({ ok: true, messageId: 77 });
    expect(warn).toHaveBeenCalled();
  });

  it('still returns the photo id when the follow-up caption text throws', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) })
      .mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await service.sendWeeklySummary('123:ABC', '@my_channel', 'x'.repeat(1025), pngBase64);

    expect(result).toEqual({ ok: true, messageId: 77 });
  });
});

describe('TelegramService legacy env wrappers', () => {
  let service: TelegramService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new TelegramService();
    fetchMock = setupFetch();
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '@my_channel';
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    jest.restoreAllMocks();
  });

  it('isConfigured is false without a bot token', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured is false without a chat id', () => {
    delete process.env.TELEGRAM_CHAT_ID;
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured is true when both are set', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('postDaySummary does nothing without creds', async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    await expect(service.postDaySummary(day)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('postDaySummary posts and returns the message id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 42 } }) });
    await expect(service.postDaySummary(day)).resolves.toBe(42);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
  });

  it('postWeeklySummary returns null when not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(service.postWeeklySummary('текст')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
