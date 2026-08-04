import { createGtdItem, getDay, getGtdItems, getWeekStats, planForToday, postWeeklySummary, syncSessionPomodoros, updateGtdItem, updatePomodoros } from './api';

describe('api request helper', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds the request URL from NEXT_PUBLIC_API_URL and parses JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-07-15' }),
    }) as unknown as typeof fetch;

    const result = await getDay('2026-07-15');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-07-15',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(result).toEqual({ date: '2026-07-15' });
  });

  it('throws a descriptive error on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    }) as unknown as typeof fetch;

    await expect(getDay('2026-02-30')).rejects.toThrow('404');
  });

  it('sends a PATCH to the pomodoros endpoint with the given body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-07-18', pomodoros: 1 }),
    }) as unknown as typeof fetch;

    await updatePomodoros('2026-07-18', { delta: 1 });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-07-18/pomodoros',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ delta: 1 }) }),
    );
  });

  it('creates a today gtd item via POST /gtd/items/today', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }) as unknown as typeof fetch;

    await planForToday('Сделать презу', '2026-07-23');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/gtd/items/today',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Сделать презу', date: '2026-07-23' }) }),
    );
  });

  it('fetches gtd items, optionally filtered by status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }) as unknown as typeof fetch;

    await getGtdItems('backlog');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/gtd/items?status=backlog',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
  });

  it('creates a gtd item via POST /gtd/items', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }) as unknown as typeof fetch;

    await createGtdItem('Новая мысль', 7);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/gtd/items',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Новая мысль', parentId: 7 }) }),
    );
  });

  it('patches a gtd item via PATCH /gtd/items/:id', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }) as unknown as typeof fetch;

    await updateGtdItem(1, { status: 'calendar', scheduledDate: '2026-07-30' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/gtd/items/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'calendar', scheduledDate: '2026-07-30' }) }),
    );
  });

  it('posts to the session sync endpoint and returns the updated day', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ date: '2026-08-04', pomodoros: 5 }),
    }) as unknown as typeof fetch;

    const result = await syncSessionPomodoros('2026-08-04');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-04/pomodoros/sync-session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ date: '2026-08-04', pomodoros: 5 });
  });

  it('requests week stats for the given end date', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ weekStart: '2026-07-27' }),
    }) as unknown as typeof fetch;

    await getWeekStats('2026-08-02');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3001/stats/week?end=2026-08-02');
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('posts the weekly summary with the chart payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posted: true, withChart: true }),
    }) as unknown as typeof fetch;

    const result = await postWeeklySummary('2026-08-02', 'AAAA');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-02/weekly-summary',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ chartPng: 'AAAA' }) }),
    );
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('omits the chart field entirely when there is no image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posted: true, withChart: false }),
    }) as unknown as typeof fetch;

    await postWeeklySummary('2026-08-02', null);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/days/2026-08-02/weekly-summary',
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
  });
});
