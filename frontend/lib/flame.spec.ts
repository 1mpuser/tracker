import { flameTier } from './flame';

describe('flameTier', () => {
  it('returns 0 (ember) for a broken or zero streak', () => {
    expect(flameTier(0)).toBe(0);
    expect(flameTier(-3)).toBe(0);
  });
  it('returns 1 for a short streak (1-3 days)', () => {
    expect(flameTier(1)).toBe(1);
    expect(flameTier(3)).toBe(1);
  });
  it('returns 2 for a growing streak (4-9 days)', () => {
    expect(flameTier(4)).toBe(2);
    expect(flameTier(9)).toBe(2);
  });
  it('returns 3 for a long streak (10-29 days)', () => {
    expect(flameTier(10)).toBe(3);
    expect(flameTier(29)).toBe(3);
  });
  it('returns 4 (roaring) for 30+ days', () => {
    expect(flameTier(30)).toBe(4);
    expect(flameTier(365)).toBe(4);
  });
});
