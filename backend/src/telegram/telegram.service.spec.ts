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
