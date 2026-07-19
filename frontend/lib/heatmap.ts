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
  // Under budget stays calm steel; over budget escalates bordo -> red -> hottest.
  if (minutes <= 0) return 'var(--panel-alt)';
  const pct = budget > 0 ? (minutes / budget) * 100 : 0;
  if (pct > 180) return 'var(--pom-hot)'; // far over — hottest red
  if (pct > 140) return 'var(--pom)'; // well over — red
  if (pct > 100) return 'var(--pom-deep)'; // just over budget — bordo
  if (pct >= 60) return 'var(--yt)'; // nearing budget — steel
  return 'var(--yt-soft)'; // comfortably under — faint steel
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
