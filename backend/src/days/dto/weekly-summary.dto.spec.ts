import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WeeklySummaryDto } from './weekly-summary.dto';

// Крошечный, но настоящий 1×1 PNG — даёт валидную base64-строку с реальной
// сигнатурой PNG, а не просто произвольные символы алфавита base64.
const REAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('WeeklySummaryDto', () => {
  it('accepts an empty body (no chart)', async () => {
    const dto = plainToInstance(WeeklySummaryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a real base64-encoded PNG', async () => {
    const dto = plainToInstance(WeeklySummaryDto, { chartPng: REAL_PNG_BASE64 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects valid base64 that is not a PNG', async () => {
    // "AAAA..." — валидный base64 по алфавиту, но не картинка вовсе.
    const dto = plainToInstance(WeeklySummaryDto, { chartPng: 'AAAA'.repeat(10) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toEqual(expect.objectContaining({ matches: expect.any(String) }));
  });
});
