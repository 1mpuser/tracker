import { closedDays, isDayClosed } from './routines.helpers';

describe('isDayClosed', () => {
  it('меньше дневной нормы — день не закрыт', () => {
    expect(isDayClosed(1, 2)).toBe(false);
  });

  it('ровно дневная норма — закрыт', () => {
    expect(isDayClosed(2, 2)).toBe(true);
  });

  it('перевыполнение закрывает день', () => {
    expect(isDayClosed(5, 2)).toBe(true);
  });

  it('ноль отметок — не закрыт', () => {
    expect(isDayClosed(0, 2)).toBe(false);
  });

  it('норма 1 — одна отметка закрывает день', () => {
    expect(isDayClosed(1, 1)).toBe(true);
  });
});

describe('closedDays', () => {
  it('считает только закрытые дни, а не отметки', () => {
    // три дня по одной отметке при норме 2 раза в день — ни одного закрытого дня
    expect(closedDays([{ count: 1 }, { count: 1 }, { count: 1 }], 2)).toBe(0);
  });

  it('перевыполненный день остаётся одним днём', () => {
    expect(closedDays([{ count: 5 }], 2)).toBe(1);
  });

  it('смешанные дни', () => {
    expect(closedDays([{ count: 2 }, { count: 1 }, { count: 3 }], 2)).toBe(2);
  });

  it('при норме 1 считает все дни с отметками', () => {
    expect(closedDays([{ count: 1 }, { count: 1 }], 1)).toBe(2);
  });

  it('пустой список даёт ноль', () => {
    expect(closedDays([], 2)).toBe(0);
  });
});
