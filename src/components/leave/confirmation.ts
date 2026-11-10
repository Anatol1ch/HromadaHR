import { isPeriodLeave, type ConfirmedLeavePeriod, type LeaveRecord, type LeaveRegistration } from '../../../shared/leave.ts'
import { isCalendarDate } from '../../../shared/leave-periods.ts'

type Period = Pick<ConfirmedLeavePeriod, 'id' | 'employeeId' | 'leaveType' | 'periodStart' | 'periodEnd' | 'status'>

export function confirmationPeriods(input: LeaveRegistration, periods: Period[]) {
  if (!isPeriodLeave(input.leaveType)) return input.allocations.length ? null : []
  const byId = new Map(periods.map(period => [period.id, period]))
  const rows = []
  for (const allocation of input.allocations) {
    const period = byId.get(allocation.periodId)
    if (!period || period.status !== 'confirmed' || period.employeeId !== input.employeeId || period.leaveType !== input.leaveType ||
      !isCalendarDate(period.periodStart) || !isCalendarDate(period.periodEnd) || period.periodStart > period.periodEnd ||
      !Number.isSafeInteger(allocation.days) || allocation.days <= 0) return null
    rows.push({ ...allocation, start: period.periodStart, end: period.periodEnd })
    byId.delete(period.id)
  }
  return rows.reduce((sum, row) => sum + row.days, 0) === input.usedDays ? rows : null
}

export type ConfirmationPeriod = NonNullable<ReturnType<typeof confirmationPeriods>>[number]

export function confirmationChanges(input: LeaveRegistration, original: LeaveRecord) {
  const allocations = (rows: LeaveRegistration['allocations']) =>
    JSON.stringify([...rows].sort((a, b) => a.periodId.localeCompare(b.periodId)).map(row => [row.periodId, row.days]))
  return [
    input.leaveType !== original.leaveType && 'Вид відпустки',
    (input.startDate !== original.startDate || input.endDate !== original.endDate) && 'Дати',
    input.usedDays !== original.usedDays && 'Тривалість',
    allocations(input.allocations) !== allocations(original.allocations) && 'Розподіл днів',
    (input.orderNumber !== original.orderNumber || input.orderDate !== original.orderDate) && 'Розпорядження',
    (input.grantBasis ?? null) !== original.grantBasis && 'Підстава надання',
    input.durationExplanation !== original.durationExplanation && 'Пояснення тривалості',
  ].filter(value => value !== false)
}
