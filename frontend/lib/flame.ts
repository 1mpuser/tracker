// Maps a streak length to a "flame" intensity tier used by the header streak
// display: the longer the streak, the bigger/brighter the fire.
//   0 — ember (no active streak)
//   1 — short   (1-3 days)
//   2 — growing (4-9 days)
//   3 — long    (10-29 days)
//   4 — roaring (30+ days)
export type FlameTier = 0 | 1 | 2 | 3 | 4;

export function flameTier(length: number): FlameTier {
  if (length <= 0) return 0;
  if (length < 4) return 1;
  if (length < 10) return 2;
  if (length < 30) return 3;
  return 4;
}
