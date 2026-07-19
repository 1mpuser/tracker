import { parseUTC } from './date';

export function categoryHeatmapColor(completed: number, total: number): string {
  if (total <= 0) return 'var(--panel-alt)';
  const ratio = completed / total;
  if (ratio >= 1) return 'var(--accent)';
  if (ratio >= 0.8) return 'rgba(224, 164, 88, 0.72)';
  if (ratio >= 0.6) return 'rgba(224, 164, 88, 0.5)';
  if (ratio >= 0.4) return 'rgba(224, 164, 88, 0.3)';
  if (ratio > 0) return 'var(--accent-soft)';
  return 'var(--panel-alt)';
}

export function youtubeHeatmapColor(minutes: number, budget: number): string {
  if (minutes <= 0) return 'var(--panel-alt)';
  const pct = budget > 0 ? (minutes / budget) * 100 : 0;
  if (pct > 150) return 'var(--danger)';
  if (pct > 100) return 'rgba(217, 100, 90, 0.55)';
  if (pct >= 70) return 'var(--yt)';
  if (pct >= 40) return 'rgba(109, 122, 140, 0.55)';
  return 'var(--yt-soft)';
}

export function mondayOffset(dateStr: string): number {
  const day = parseUTC(dateStr).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export function thresholdHeatmapColor(completed: number, threshold: number): string {
  return completed >= threshold ? 'var(--accent)' : 'var(--panel-alt)';
}

export function pomodoroHeatmapColor(count: number, min: number, opt: number): string {
  // Red ramp: 0 grey ember -> 1 soft -> 2..min-1 bordo -> min..opt-1 tomato -> >=opt bright.
  if (count <= 0) return 'var(--panel-alt)';
  if (count >= opt) return 'var(--pom-hot)';
  if (count >= min) return 'var(--pom)';
  if (count >= 2) return 'var(--pom-deep)';
  return 'var(--pom-soft)';
}
