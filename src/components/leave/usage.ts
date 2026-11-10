import { specialLeaveLimit, type LeaveRecord, type LeaveType } from '../../../shared/leave.ts'

export function sortedLeaveYears(years: string[]) {
  return [...new Set(years)].sort()
}

export function accountingYears(records: LeaveRecord[], employeeId: string, currentYear: string) {
  const years = Array.from({ length: Number(currentYear) - 2027 + 2 }, (_, index) => String(2027 + index))
  return sortedLeaveYears([...years,
    ...records.filter(record => record.employeeId === employeeId).map(record => record.startDate.slice(0, 4))]
    .filter(year => year >= '2027'))
}

/** Full registered durations attributed once to the start year, not calendar-day splitting. */
export function annualUsage(records: LeaveRecord[], employeeId: string, type: LeaveType, year: string) {
  const history = records.filter(record => record.employeeId === employeeId && record.leaveType === type && record.startDate.slice(0, 4) === year)
  const active = history.filter(record => record.status === 'active')
  const limit = specialLeaveLimit(type)
  return { history, activeCount: active.length, cancelledCount: history.length - active.length, days: active.reduce((sum, record) => sum + record.usedDays, 0), limit,
    alreadyGranted: limit !== null && active.length > 0 }
}

export function matchesEmployeeName(name: string, query: string) {
  const normalized = name.toLocaleLowerCase('uk-UA')
  return query.trim().toLocaleLowerCase('uk-UA').split(/\s+/).every(word => normalized.includes(word))
}
