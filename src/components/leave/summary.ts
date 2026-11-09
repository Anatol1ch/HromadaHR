import type { PeriodBalance, PeriodLeaveType, ProposedLeavePeriod } from '../../../shared/leave'
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

export function allocationMessage(days: number, total: number, valid: boolean, manual: boolean) {
  if (!valid || !Number.isFinite(total)) return 'Перевірте кількість днів у розподілі.'
  if (total === days) return days + (manual ? ' днів – збережений або ручний розподіл' : ' днів розподілено автоматично')
  return 'Розподілено ' + total + ' із ' + days + ' днів. ' + (total < days ? 'Потрібно розподілити ще ' + (days-total) : 'Приберіть зайві ' + (total-days))
}
