import { getDay } from './api';

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
});
