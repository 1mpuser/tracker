import { categoryHeatmapColor, mondayOffset, pomodoroHeatmapColor, thresholdHeatmapColor, youtubeHeatmapColor } from './heatmap';

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
  it('returns the muted steel tone well under budget', () => {
    expect(youtubeHeatmapColor(10, 60)).toBe('var(--yt-soft)');
  });
  it('returns solid steel between 70% and 100% of budget', () => {
    expect(youtubeHeatmapColor(45, 60)).toBe('var(--yt)');
  });
  it('returns a danger tone just over budget', () => {
    expect(youtubeHeatmapColor(70, 60)).toBe('rgba(217, 100, 90, 0.55)');
  });
  it('returns solid danger far over budget', () => {
    expect(youtubeHeatmapColor(100, 60)).toBe('var(--danger)');
  });
});

describe('thresholdHeatmapColor', () => {
  it('returns the empty panel color below the threshold', () => {
    expect(thresholdHeatmapColor(1, 2)).toBe('var(--panel-alt)');
  });
  it('returns solid accent at the threshold', () => {
    expect(thresholdHeatmapColor(2, 2)).toBe('var(--accent)');
  });
  it('returns solid accent above the threshold', () => {
    expect(thresholdHeatmapColor(5, 2)).toBe('var(--accent)');
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

describe('pomodoroHeatmapColor', () => {
  it('returns the empty panel color for zero', () => {
    expect(pomodoroHeatmapColor(0, 4, 8)).toBe('var(--panel-alt)');
  });
  it('returns the soft red tint for a single pomodoro', () => {
    expect(pomodoroHeatmapColor(1, 4, 8)).toBe('var(--pom-soft)');
  });
  it('returns the bordo tone below the minimum', () => {
    expect(pomodoroHeatmapColor(3, 4, 8)).toBe('var(--pom-deep)');
  });
  it('returns tomato red at the minimum', () => {
    expect(pomodoroHeatmapColor(4, 4, 8)).toBe('var(--pom)');
  });
  it('stays tomato red just below the optimum', () => {
    expect(pomodoroHeatmapColor(7, 4, 8)).toBe('var(--pom)');
  });
  it('returns bright red at the optimum', () => {
    expect(pomodoroHeatmapColor(8, 4, 8)).toBe('var(--pom-hot)');
  });
});
