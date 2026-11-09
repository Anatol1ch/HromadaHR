import type { LeaveAccountingBasis, PeriodLeaveType, ProposedLeavePeriod } from '../../shared/leave.js'

export const ELECTRONIC_ACCOUNTING_START = '2027-01-01'

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') return false
  const date = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function dateParts(value: string) {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) }
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addCalendarYear(value: string) {
  const { year, month, day } = dateParts(value)
  if (year >= 9999) return null
  return formatDate(year + 1, month, Math.min(day, daysInMonth(year + 1, month)))
}

function previousDate(value: string) {
  const date = new Date(value + 'T00:00:00.000Z')
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function accountingBasisForPeriod(periodStart: string): LeaveAccountingBasis {
  return periodStart < ELECTRONIC_ACCOUNTING_START ? 'initial_balance' : 'confirmed_entitlement'
}

export function proposedPeriods(leaveType: PeriodLeaveType, hireDate: string, throughDate: string): ProposedLeavePeriod[] {
  if (!isCalendarDate(hireDate) || !isCalendarDate(throughDate) || (throughDate < hireDate && leaveType !== 'oms_service_additional')) return []
  const result: ProposedLeavePeriod[] = []
  if (leaveType === 'children_social_additional') {
    const firstYear = Number(hireDate.slice(0, 4))
    const lastYear = Number(throughDate.slice(0, 4))
    for (let year = firstYear; year <= lastYear; year++) {
      const periodStart = formatDate(year, 1, 1)
      result.push({ leaveType, periodStart, periodEnd: formatDate(year, 12, 31),
        accountingBasis: accountingBasisForPeriod(periodStart), status: 'proposed' })
    }
    return result
  }
  let start = hireDate
  while (start <= throughDate) {
    if (result.length === 200) return result
    const nextStart = addCalendarYear(start)
    if (!nextStart) break
    result.push({ leaveType, periodStart: start, periodEnd: previousDate(nextStart),
      accountingBasis: accountingBasisForPeriod(start), status: 'proposed' })
    start = nextStart
  }
  // One unconfirmed next working year; the anniversary policy stays unchanged.
  const futureEnd = addCalendarYear(start)
  if (futureEnd) result.push({ leaveType, periodStart: start, periodEnd: previousDate(futureEnd),
    accountingBasis: accountingBasisForPeriod(start), status: 'proposed' })
  return result
}

export function isCanonicalPeriod(leaveType: PeriodLeaveType, hireDate: string, periodStart: string, periodEnd: string) {
  if (!isCalendarDate(hireDate) || !isCalendarDate(periodStart) || !isCalendarDate(periodEnd)) return false
  if (leaveType === 'oms_service_additional') return periodStart <= periodEnd
  if (leaveType === 'children_social_additional') {
    return periodStart === `${periodStart.slice(0, 4)}-01-01` && periodEnd === `${periodStart.slice(0, 4)}-12-31`
  }
  if (leaveType !== 'annual_main' || periodStart < hireDate) return false
  let start = hireDate
  while (start < periodStart) {
    const next = addCalendarYear(start)
    if (!next || next <= start) return false
    start = next
  }
  const next = addCalendarYear(start)
  return start === periodStart && !!next && previousDate(next) === periodEnd
}
