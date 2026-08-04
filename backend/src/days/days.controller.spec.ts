import { BadGatewayException, ConflictException } from '@nestjs/common';
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
