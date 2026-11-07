import { specialLeaveLimit, type LeaveRecord, type LeaveType } from '../../../shared/leave.ts'

/** Full registered durations attributed once to the start year, not calendar-day splitting. */
export function annualUsage(records: LeaveRecord[], employeeId: string, type: LeaveType, year: string) {
  const history = records.filter(record => record.employeeId === employeeId && record.leaveType === type && record.startDate.slice(0, 4) === year)
  const active = history.filter(record => record.status === 'active')
  const limit = specialLeaveLimit(type)
  return { history, activeCount: active.length, days: active.reduce((sum, record) => sum + record.usedDays, 0), limit,
    alreadyGranted: limit !== null && active.length > 0 }
}

export function matchesEmployeeName(name: string, query: string) {
  const normalized = name.toLocaleLowerCase('uk-UA')
  return query.trim().toLocaleLowerCase('uk-UA').split(/\s+/).every(word => normalized.includes(word))
}
