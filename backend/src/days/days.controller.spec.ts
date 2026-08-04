import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { DaysController } from './days.controller';

describe('DaysController.syncSessionPomodoros', () => {
  let controller: DaysController;
  let daysService: any;
  let session: any;

  beforeEach(() => {
    daysService = { setPomodoros: jest.fn().mockResolvedValue({ date: '2026-08-04', pomodoros: 3 }) };
    session = { isEnabled: jest.fn().mockReturnValue(true), syncDate: jest.fn().mockResolvedValue(3) };
    controller = new DaysController(daysService, session);
  });

  it('rejects with 409 when the Session integration is disabled, without touching syncDate or the counter', async () => {
    session.isEnabled.mockReturnValue(false);

    await expect(controller.syncSessionPomodoros('2026-08-04')).rejects.toThrow(ConflictException);

    expect(session.syncDate).not.toHaveBeenCalled();
    expect(daysService.setPomodoros).not.toHaveBeenCalled();
  });

  it('rejects with 502 when syncDate cannot read the calendar, without writing a zero', async () => {
    session.syncDate.mockResolvedValue(null);

    await expect(controller.syncSessionPomodoros('2026-08-04')).rejects.toThrow(BadGatewayException);

    // Инвариант фичи: ошибка чтения не должна обнулить счётчик.
    expect(daysService.setPomodoros).not.toHaveBeenCalled();
  });

  it('writes the synced count and returns the resulting DayView', async () => {
    const result = await controller.syncSessionPomodoros('2026-08-04');

    expect(daysService.setPomodoros).toHaveBeenCalledWith('2026-08-04', 3);
    expect(result).toEqual({ date: '2026-08-04', pomodoros: 3 });
  });

  it('treats a calendar answer of zero as a valid count, not an error', async () => {
    session.syncDate.mockResolvedValue(0);

    await controller.syncSessionPomodoros('2026-08-04');

    expect(daysService.setPomodoros).toHaveBeenCalledWith('2026-08-04', 0);
  });
});

describe('DaysController.postWeeklySummary', () => {
  let daysService: any;
  let controller: DaysController;

  beforeEach(() => {
    daysService = { postWeeklySummary: jest.fn().mockResolvedValue({ posted: true, withChart: true }) };
    controller = new DaysController(daysService, { isEnabled: jest.fn(), syncDate: jest.fn() } as any);
  });

  it('rejects a date that is not a sunday', async () => {
    // 2026-08-03 — понедельник
    await expect(controller.postWeeklySummary('2026-08-03', {})).rejects.toThrow(BadRequestException);
    expect(daysService.postWeeklySummary).not.toHaveBeenCalled();
  });

  it('posts for a sunday and passes the chart through', async () => {
    const result = await controller.postWeeklySummary('2026-08-02', { chartPng: 'AAAA' });

    expect(daysService.postWeeklySummary).toHaveBeenCalledWith('2026-08-02', 'AAAA');
    expect(result).toEqual({ posted: true, withChart: true });
  });

  it('passes null when no chart was supplied', async () => {
    await controller.postWeeklySummary('2026-08-02', {});

    expect(daysService.postWeeklySummary).toHaveBeenCalledWith('2026-08-02', null);
  });

  it('reports an already-posted week without throwing', async () => {
    daysService.postWeeklySummary.mockResolvedValue({ posted: false, withChart: false, reason: 'already-posted' });

    const result = await controller.postWeeklySummary('2026-08-02', {});

    expect(result).toEqual({ posted: false, reason: 'already-posted' });
  });

  it('turns a send failure into 502', async () => {
    daysService.postWeeklySummary.mockResolvedValue({ posted: false, withChart: true, reason: 'send-failed' });

    await expect(controller.postWeeklySummary('2026-08-02', {})).rejects.toThrow(BadGatewayException);
  });
});
