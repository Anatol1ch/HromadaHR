import { isPeriodLeave, type ConfirmedLeavePeriod, type LeaveRecord, type LeaveType, type PeriodBalance, type PeriodLeaveType, type ProposedLeavePeriod } from '../../../shared/leave.ts'
import { calendarDays } from '../../../shared/leave-calculations.ts'
export function balanceSummary(type: PeriodLeaveType, balances: PeriodBalance[], proposals: ProposedLeavePeriod[]) {
  const saved = balances.filter(period => period.leaveType === type)
  const incomplete = proposals.some(period => period.leaveType === type && !saved.some(row => row.periodStart === period.periodStart))
  const positive = saved.filter(period => period.availableDays > 0)
  const oldestPositive = positive.reduce<PeriodBalance | null>((oldest, period) =>
    !oldest || period.periodStart < oldest.periodStart ? period : oldest, null)
  return { count: saved.length, incomplete, positiveCount: positive.length, oldestPositive,
    entered: saved.reduce((n, p) => n + BigInt(p.confirmedDays), 0n),
    accounted: saved.reduce((n, p) => n + BigInt(p.usedDays), 0n), remaining: saved.reduce((n, p) => n + BigInt(p.availableDays), 0n) }
}

/** Child leave needs an explicit current-year choice; proposals never represent confirmed days. */
export function leaveOverviewProposals(type: LeaveType, status: 'has_right' | 'no_right' | 'unknown',
  proposals: ProposedLeavePeriod[], throughDate: string, today: string) {
  const matching = proposals.filter(period => period.leaveType === type && period.periodStart <= throughDate)
  if (type !== 'children_social_additional') return matching
  if (status !== 'has_right') return []
  const currentYearStart = `${today.slice(0, 4)}-01-01`
  return matching.filter(period => period.periodStart === currentYearStart)
}

export function leaveOverviewAccounting(type: LeaveType, balances: PeriodBalance[], proposals: ProposedLeavePeriod[], records: LeaveRecord[]) {
  const activeRecords = records.filter(record => record.leaveType === type && record.status === 'active')
  if (isPeriodLeave(type)) return { kind: 'period' as const, summary: balanceSummary(type, balances, proposals),
    registeredCount: activeRecords.length, recordedUsage: activeRecords.reduce((sum, record) => sum + BigInt(record.usedDays), 0n) }
  return { kind: 'event' as const, registeredCount: activeRecords.length,
    usedDays: activeRecords.reduce((sum, record) => sum + BigInt(record.usedDays), 0n) }
}

export type LeaveOverviewMetric = { value: string; kind: 'value' | 'missing' | 'unknown' | 'not-applicable'; emphasis?: boolean; detail?: string[] }

export function leaveOverviewHasAccountedData(accounting: ReturnType<typeof leaveOverviewAccounting>) {
  return accounting.kind === 'period'
    ? accounting.summary.count > 0 || accounting.registeredCount > 0 || accounting.recordedUsage > 0n
    : accounting.registeredCount > 0 || accounting.usedDays > 0n
}

export function leaveOverviewCompactNoRight(status: 'has_right' | 'no_right' | 'unknown', accounting: ReturnType<typeof leaveOverviewAccounting>) {
  return status === 'no_right' && !leaveOverviewHasAccountedData(accounting)
}

export function leaveOverviewMetrics(accounting: ReturnType<typeof leaveOverviewAccounting>): LeaveOverviewMetric[] {
  if (accounting.kind === 'period') {
    if (!accounting.summary.count) {
      const hasRecordedUsage = accounting.registeredCount > 0
      const value = hasRecordedUsage
        ? `— / ${formatLeaveDayCount(accounting.recordedUsage)}`
        : accounting.summary.incomplete ? 'Дані неповні' : 'Періоди не внесено'
      return [
        { value, kind: hasRecordedUsage ? 'value' : 'missing', detail: hasRecordedUsage ? ['Використано'] : undefined },
        { value: '—', kind: 'unknown' },
      ]
    }
    return [
      { value: `${formatLeaveDayCount(accounting.summary.entered)} / ${formatLeaveDayCount(accounting.summary.accounted)}`, kind: 'value',
        detail: accounting.summary.incomplete ? ['Дані неповні'] : undefined },
      accounting.summary.incomplete
        ? { value: '—', kind: 'unknown' }
        : { value: formatLeaveDayCount(accounting.summary.remaining), kind: 'value', emphasis: true },
    ]
  }
  return [
    { value: formatLeaveDayCount(accounting.usedDays), kind: 'value', detail: ['Використано'] },
    { value: '—', kind: 'not-applicable' },
  ]
}

export function specialLeaveAnnualAvailability(type: 'veteran_special_leave' | 'chernobyl_special_leave',
  status: 'has_right' | 'no_right' | 'unknown', records: LeaveRecord[], employeeId: string, year: string, excludeRecordId?: string) {
  const limit = type === 'veteran_special_leave' ? 14 : 16
  const active = records.filter(record => record.employeeId === employeeId && record.leaveType === type &&
    record.status === 'active' && record.startDate.slice(0, 4) === year && record.id !== excludeRecordId)
  if (active.length > 1) return { kind: 'review' as const, limit, usedDays: null }
  if (active.length === 1) {
    const record = active[0]!
    if (record.usedDays !== limit || calendarDays(record.startDate, record.endDate) !== limit) {
      return { kind: 'review' as const, limit, usedDays: null }
    }
    return { kind: 'used' as const, limit, usedDays: record.usedDays }
  }
  return status === 'has_right' ? { kind: 'available' as const, limit, usedDays: 0 }
    : status === 'no_right' ? { kind: 'no_right' as const, limit, usedDays: null }
      : { kind: 'unknown' as const, limit, usedDays: null }
}

export function specialLeaveAnnualMetrics(type: 'veteran_special_leave' | 'chernobyl_special_leave',
  status: 'has_right' | 'no_right' | 'unknown', records: LeaveRecord[], employeeId: string, year: string): LeaveOverviewMetric[] {
  const availability = specialLeaveAnnualAvailability(type, status, records, employeeId, year)
  const priorUsage = records.filter(record => record.employeeId === employeeId && record.leaveType === type &&
    record.status === 'active' && record.startDate.slice(0, 4) < year)
    .reduce((sum, record) => sum + BigInt(record.usedDays), 0n)
  const priorUsageText = priorUsage > 0n ? `Раніше використано ${formatLeaveDayCount(priorUsage)} к. дн.` : null
  if (availability.kind === 'available') return [
    { value: String(availability.limit), kind: 'value', detail: [`Норматив за ${year} рік`, ...(priorUsageText ? [priorUsageText] : [])] },
    { value: `Доступно ${availability.limit}`, kind: 'value', emphasis: true },
  ]
  if (availability.kind === 'used') return [
    { value: `Використано ${availability.usedDays}`, kind: 'value', detail: [`За ${year} рік`] },
    { value: 'Використано', kind: 'value' },
  ]
  if (availability.kind === 'review') return [
    { value: 'Потребує перевірки', kind: 'unknown' },
    { value: '—', kind: 'unknown' },
  ]
  if (priorUsageText) return [{ value: priorUsageText, kind: 'value' },
    { value: '—', kind: availability.kind === 'unknown' ? 'unknown' : 'not-applicable' }]
  return [
    { value: '—', kind: availability.kind === 'unknown' ? 'unknown' : 'not-applicable' },
    { value: '—', kind: availability.kind === 'unknown' ? 'unknown' : 'not-applicable' },
  ]
}

const dayPlural = new Intl.PluralRules('uk-UA')
export function formatLeaveDays(days: number | bigint) {
  const category = dayPlural.select(Number(BigInt(days) % 100n))
  const unit = category === 'one' ? 'день' : category === 'few' ? 'дні' : 'днів'
  return `${days.toLocaleString('uk-UA')} ${unit}`
}

export function formatLeaveDayCount(days: number | bigint) {
  return BigInt(days).toLocaleString('uk-UA')
}

const leaveCountPlural = new Intl.PluralRules('uk-UA')
export function formatLeaveCount(count: number) {
  const label = leaveCountPlural.select(count) === 'one' ? 'відпустка' : leaveCountPlural.select(count) === 'few' ? 'відпустки' : 'відпусток'
  return `${count.toLocaleString('uk-UA')} ${label}`
}

export function allocationDraft(available: PeriodBalance[], drafts: Record<string, string>, days: number, requireAvailableDrafts = false) {
  const values = available.map(period => {
    const text = drafts[period.id] || '0'
    const value = Number(text)
    return { periodId: period.id, days: /^\d+$/.test(text) && Number.isSafeInteger(value) ? value : null }
  })
  const invalid = new Set(values.filter((entry, index) => entry.days === null || entry.days > available[index]!.availableDays).map(entry => entry.periodId))
  const total = values.reduce((sum, entry) => sum + (entry.days ?? 0), 0)
  const capacity = available.reduce((sum, period) => Math.min(days, sum + period.availableDays), 0)
  const ignored = Object.entries(drafts).some(([id, value]) => value !== '' && value !== '0' && !available.some(period => period.id === id))
  return {
    values: values.flatMap(entry => entry.days !== null && entry.days > 0 ? [{ periodId: entry.periodId, days: entry.days }] : []),
    invalid, total, shortfall: days - capacity, complete: invalid.size === 0 && total === days && (!requireAvailableDrafts || !ignored),
    ignored,
    message: invalid.size > 0 ? 'Вкажіть ціле число від нуля до доступного залишку.' :
      requireAvailableDrafts && ignored ? 'Перевірте недоступні списання.' :
      total > days ? 'Потрібно прибрати ' + formatLeaveDays(total - days) :
      total < days ? 'Залишилося розподілити ' + formatLeaveDays(days - total) : 'Розподіл завершено',
  }
}

export function futureAllocationPeriod(proposals: ProposedLeavePeriod[], saved: ConfirmedLeavePeriod[], throughDate: string) {
  const period = proposals.find(period => period.periodStart > throughDate)
  return period ? saved.find(row => row.leaveType === period.leaveType && row.periodStart === period.periodStart) ?? period : undefined
}
