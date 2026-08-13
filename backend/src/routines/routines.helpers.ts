/**
 * День закрыт, когда набрана дневная норма. Перевыполнение закрывает день,
 * но не даёт двух дней: неделя меряется в днях, а не в отметках.
 */
export function isDayClosed(count: number, timesPerDay: number): boolean {
  return count >= timesPerDay;
}

export function closedDays(logs: { count: number }[], timesPerDay: number): number {
  return logs.filter((l) => isDayClosed(l.count, timesPerDay)).length;
}
