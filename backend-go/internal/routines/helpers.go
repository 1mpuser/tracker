// Package routines — перенос RoutinesService из backend/src/routines.
package routines

// IsDayClosed — день закрыт, когда набрана дневная норма. Перевыполнение
// закрывает день, но не даёт двух дней: неделя меряется в днях, не в отметках.
func IsDayClosed(count, timesPerDay int) bool {
	return count >= timesPerDay
}

// ClosedDays считает закрытые дни (не отметки).
func ClosedDays(logs []int, timesPerDay int) int {
	closed := 0
	for _, c := range logs {
		if IsDayClosed(c, timesPerDay) {
			closed++
		}
	}
	return closed
}
