import type { ConfirmedLeavePeriod, PeriodBalance, PeriodLeaveType, ProposedLeavePeriod } from '../../../shared/leave'
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

const dayPlural = new Intl.PluralRules('uk-UA')
export function formatLeaveDays(days: number | bigint) {
  const category = dayPlural.select(Number(BigInt(days) % 100n))
  const unit = category === 'one' ? 'день' : category === 'few' ? 'дні' : 'днів'
  return `${days.toLocaleString('uk-UA')} ${unit}`
}

export function allocationDraft(available: PeriodBalance[], drafts: Record<string, string>, days: number) {
  const values = available.map(period => {
    const text = drafts[period.id] || '0'
    const value = Number(text)
    return { periodId: period.id, days: /^\d+$/.test(text) && Number.isSafeInteger(value) ? value : null }
  })
  const invalid = new Set(values.filter((entry, index) => entry.days === null || entry.days > available[index]!.availableDays).map(entry => entry.periodId))
  const total = values.reduce((sum, entry) => sum + (entry.days ?? 0), 0)
  const capacity = available.reduce((sum, period) => Math.min(days, sum + period.availableDays), 0)
  return {
    values: values.flatMap(entry => entry.days !== null && entry.days > 0 ? [{ periodId: entry.periodId, days: entry.days }] : []),
    invalid, total, shortfall: days - capacity, complete: invalid.size === 0 && total === days,
    ignored: Object.entries(drafts).some(([id, value]) => value !== '' && value !== '0' && !available.some(period => period.id === id)),
    message: invalid.size > 0 ? 'Вкажіть ціле число від нуля до доступного залишку.' :
      total > days ? 'Потрібно прибрати ' + formatLeaveDays(total - days) :
      total < days ? 'Залишилося розподілити ' + formatLeaveDays(days - total) : 'Розподіл завершено',
  }
}

export function futureAllocationPeriod(proposals: ProposedLeavePeriod[], saved: ConfirmedLeavePeriod[], throughDate: string) {
  const period = proposals.find(period => period.periodStart > throughDate)
  return period ? saved.find(row => row.leaveType === period.leaveType && row.periodStart === period.periodStart) ?? period : undefined
}
