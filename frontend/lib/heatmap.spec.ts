import { categoryHeatmapColor, mondayOffset, youtubeHeatmapColor } from './heatmap';

describe('categoryHeatmapColor', () => {
  it('returns the empty panel color for a day with no active categories', () => {
    expect(categoryHeatmapColor(0, 0)).toBe('var(--panel-alt)');
  });
  it('returns the empty panel color when nothing is done yet', () => {
    expect(categoryHeatmapColor(0, 5)).toBe('var(--panel-alt)');
  });
  it('returns solid accent at 100%', () => {
    expect(categoryHeatmapColor(5, 5)).toBe('var(--accent)');
  });
  it('returns a mid-opacity step at 60%', () => {
    expect(categoryHeatmapColor(3, 5)).toBe('rgba(224, 164, 88, 0.5)');
  });
});

describe('youtubeHeatmapColor', () => {
  it('returns the empty panel color when no minutes were logged', () => {
    expect(youtubeHeatmapColor(0, 60)).toBe('var(--panel-alt)');
  });
  it('returns the cool accent2 tone well under budget', () => {
    expect(youtubeHeatmapColor(10, 60)).toBe('var(--accent2-soft)');
  });
  it('returns solid accent between 70% and 100% of budget', () => {
    expect(youtubeHeatmapColor(45, 60)).toBe('var(--accent)');
  });
  it('returns a danger tone just over budget', () => {
    expect(youtubeHeatmapColor(70, 60)).toBe('rgba(217, 100, 90, 0.55)');
  });
  it('returns solid danger far over budget', () => {
    expect(youtubeHeatmapColor(100, 60)).toBe('var(--danger)');
  });
});

describe('mondayOffset', () => {
  it('returns 0 for a Monday', () => {
    expect(mondayOffset('2026-07-13')).toBe(0);
  });
  it('returns 2 for a Wednesday', () => {
    expect(mondayOffset('2026-07-15')).toBe(2);
  });
  it('returns 6 for a Sunday', () => {
    expect(mondayOffset('2026-07-19')).toBe(6);
  });
});
