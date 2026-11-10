import type { ConfirmedLeavePeriod, LeaveApi, LeavePeriodInput, ProposedLeavePeriod } from '../../../shared/leave'
import { formatDateInput, parseDateInput } from '../../lib/dates.ts'
import { shiftDays, shiftMonths } from '../../lib/calendar.ts'
import { serviceLeaveProposals } from '../../../shared/leave-periods.ts'

export const cutoff = '2027-01-01'
export type Period = ConfirmedLeavePeriod | ProposedLeavePeriod
type ManualDraft = { id: number; start: string; end: string; startIso: string; endIso: string; days: string; endEdited?: boolean }
export type Draft = { period: Period; days: string } | ManualDraft

const periodKey = (period: Period) => period.periodStart + '/' + period.periodEnd

export function serviceDraftRows(rows: Draft[], start: string | null, throughDate: string, manual: ProposedLeavePeriod[], historicalOnly: boolean) {
  const confirmed = rows.flatMap(row => 'period' in row && row.period.status === 'confirmed' ? [row.period] : [])
  const proposals = new Map(serviceLeaveProposals(start, throughDate, confirmed).map(period => [period.periodStart, period]))
  for (const period of manual) {
    if (!proposals.has(period.periodStart) &&
      !confirmed.some(saved => saved.periodStart <= period.periodEnd && saved.periodEnd >= period.periodStart)) proposals.set(period.periodStart, period)
  }
  const proposed = [...proposals.values()].filter(period => !historicalOnly || period.periodStart < cutoff)
  const byKey = new Map(proposed.map(period => [periodKey(period), period]))
  const retained = rows.filter(row => !('period' in row) || row.period.status === 'confirmed' || row.days.trim() || byKey.has(periodKey(row.period)))
  const present = new Set(retained.flatMap(row => 'period' in row ? [periodKey(row.period)] : []))
  const combined: Draft[] = [...retained, ...proposed.filter(period => !present.has(periodKey(period))).map(period => ({ period, days: '' }))]
  combined.sort((a, b) => ('period' in a ? a.period.periodStart : '9999').localeCompare('period' in b ? b.period.periodStart : '9999'))
  const detached = new Set(combined.filter(row => 'period' in row && row.period.status === 'proposed' && !byKey.has(periodKey(row.period))))
  return { rows: combined, detached }
}

export async function saveBalanceDraft(api: Pick<LeaveApi, 'saveServiceLeaveStart' | 'savePeriods'>, employeeId: string, date: string | null | undefined, changes: LeavePeriodInput[]) {
  let savedDate: string | null | undefined
  if (date !== undefined) {
    try {
      const result = await api.saveServiceLeaveStart(employeeId, date)
      if (!result.ok) return { failed: 'date' as const, code: result.error.code }
      savedDate = result.data
    } catch { return { failed: 'date' as const } }
  }
  if (changes.length) {
    try {
      const result = await api.savePeriods(employeeId, changes)
      if (!result.ok) return { failed: 'days' as const, code: result.error.code, savedDate }
    } catch { return { failed: 'days' as const, savedDate } }
  }
  return { savedDate }
}

export function suggestedPeriodEnd(start: string) {
  return start && start.slice(0, 4) !== '9999' ? shiftDays(shiftMonths(start, 12), -1) : ''
}

export function setManualStart(row: ManualDraft, startIso: string): ManualDraft {
  if (row.endEdited) return { ...row, startIso }
  const endIso = suggestedPeriodEnd(startIso)
  return { ...row, startIso, endIso, end: formatDateInput(endIso) }
}

export function historicalBalancePeriods(periods: Period[]) {
  return periods.filter(period => period.status === 'confirmed' || period.accountingBasis === 'initial_balance')
}

export function hasNewEntitlement(changes: LeavePeriodInput[], periods: Period[]) {
  return changes.some(change => change.accountingBasis === 'confirmed_entitlement' &&
    !periods.some(period => period.status === 'confirmed' && period.leaveType === change.leaveType && period.periodStart === change.periodStart))
}

export class BalanceDraftError extends Error {
  readonly row: number
  constructor(message: string, row: number) {
    super(message)
    this.row = row
  }
}

export function buildChanges(rows: Draft[]): LeavePeriodInput[] {
  const changes: LeavePeriodInput[] = []
  const ranges: { periodStart: string; periodEnd: string }[] = rows.flatMap(row => 'period' in row && row.period.leaveType === 'oms_service_additional' &&
    (row.period.status === 'confirmed' || row.days.trim()) ? [row.period] : [])
  const starts = new Set(rows.flatMap(row => 'period' in row &&
    (row.period.status === 'confirmed' || row.days.trim()) ? [row.period.periodStart] : []))
  for (const [index, row] of rows.entries()) {
    const period = 'period' in row ? row.period : null
    const saved = period?.status === 'confirmed' ? period : null
    const days = row.days.trim()
    if (!days && !saved && ('period' in row || (!row.start && !row.end))) continue
    if (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days))) {
      throw new BalanceDraftError(saved && !days ? 'Щоб вилучити підтвердження, скористайтеся окремою дією в таблиці.' :
        'Введіть цілу невід’ємну кількість днів у допустимому діапазоні.', index)
    }
    const confirmedDays = Number(days)
    if (saved?.confirmedDays === confirmedDays) continue
    const start = 'start' in row ? parseDateInput(row.start) : row.period.periodStart
    const end = 'end' in row ? parseDateInput(row.end) : row.period.periodEnd
    if (!start || !end || start > end) throw new BalanceDraftError('Перевірте початок і завершення облікового періоду.', index)
    if (!period) {
      if (starts.has(start)) throw new BalanceDraftError('Період із таким початком уже є в таблиці.', index)
      if (ranges.some(range => range.periodStart <= end && start <= range.periodEnd)) {
        throw new BalanceDraftError('Цей період перекриває інший обліковий період.', index)
      }
      starts.add(start)
      ranges.push({ periodStart: start, periodEnd: end })
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
