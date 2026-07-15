// Deliberately LOCAL wall-clock time (not UTC) — the spec requires these windows
// to track when the user is actually at their computer, unlike the UTC "today"
// date convention used everywhere else in this app (see lib/date.ts).

export function isMorningWindow(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 && minutes < 21 * 60 + 30;
}

export function isEveningWindow(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 21 * 60 + 30 && minutes < 24 * 60;
}
