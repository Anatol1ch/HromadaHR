export interface DayAllocation { periodId: string; days: number }
export function calendarDays(start: string, end: string): number {
  const first = Date.parse(start + 'T00:00:00Z')
  const last = Date.parse(end + 'T00:00:00Z')
  return Math.floor((last - first) / 86400000) + 1
}
export function fifoAllocation(periods: { id: string; availableDays: number; periodStart: string }[], days: number) {
  let shortfall = days
  const allocations: DayAllocation[] = []
  for (const period of [...periods].sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.id.localeCompare(b.id))) {
    const used = Math.min(period.availableDays, shortfall)
    if (used > 0) allocations.push({ periodId: period.id, days: used })
    shortfall -= used
    if (!shortfall) break
  }
  return { allocations, shortfall }
}
