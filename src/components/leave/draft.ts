import type { ConfirmedLeavePeriod, LeavePeriodInput, ProposedLeavePeriod } from '../../../shared/leave'
import { parseDateInput } from '../../lib/dates.ts'

export const cutoff = '2027-01-01'
export type Period = ConfirmedLeavePeriod | ProposedLeavePeriod
export type Draft = { period: Period; days: string } |
  { id: number; start: string; end: string; startIso: string; endIso: string; days: string }

export function historicalBalancePeriods(periods: Period[]) {
  return periods.filter(period => period.status === 'confirmed' || period.accountingBasis === 'initial_balance')
}

export function hasNewEntitlement(changes: LeavePeriodInput[], periods: Period[]) {
  return changes.some(change => change.accountingBasis === 'confirmed_entitlement' &&
    !periods.some(period => period.status === 'confirmed' && period.leaveType === change.leaveType && period.periodStart === change.periodStart))
}

export function buildChanges(rows: Draft[]): LeavePeriodInput[] {
  const changes: LeavePeriodInput[] = []
  const starts = new Set(rows.flatMap(row => 'period' in row &&
    (row.period.status === 'confirmed' || row.days.trim()) ? [row.period.periodStart] : []))
  for (const row of rows) {
    const period = 'period' in row ? row.period : null
    const saved = period?.status === 'confirmed' ? period : null
    const days = row.days.trim()
    if (!days && !saved && ('period' in row || (!row.start && !row.end))) continue
    if (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days))) {
      throw new Error(saved && !days ? 'Щоб вилучити підтвердження, скористайтеся окремою дією в таблиці.' :
        'Введіть цілу невід’ємну кількість днів у допустимому діапазоні.')
    }
    const confirmedDays = Number(days)
    if (saved?.confirmedDays === confirmedDays) continue
    const start = 'start' in row ? parseDateInput(row.start) : row.period.periodStart
    const end = 'end' in row ? parseDateInput(row.end) : row.period.periodEnd
    if (!start || !end || start > end) throw new Error('Перевірте початок і завершення облікового періоду.')
    if (!period) {
      if (starts.has(start)) throw new Error('Період із таким початком уже є в таблиці.')
      starts.add(start)
    }
    changes.push({
      leaveType: period?.leaveType ?? 'oms_service_additional',
      periodStart: start, periodEnd: end, confirmedDays,
      accountingBasis: period?.accountingBasis ?? (start < cutoff ? 'initial_balance' : 'confirmed_entitlement'),
      referenceEntitlementDays: saved?.referenceEntitlementDays ?? null,
    })
  }
  if (changes.length > 200) throw new Error('За один раз можна зберегти до 200 періодів.')
  return changes
}
