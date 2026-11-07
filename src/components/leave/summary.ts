import type { PeriodBalance, PeriodLeaveType, ProposedLeavePeriod } from '../../../shared/leave'
export function balanceSummary(type: PeriodLeaveType, balances: PeriodBalance[], proposals: ProposedLeavePeriod[]) {
  const saved = balances.filter(period => period.leaveType === type)
  const incomplete = proposals.some(period => period.leaveType === type && !saved.some(row => row.periodStart === period.periodStart))
  return { count: saved.length, incomplete, entered: saved.reduce((n, p) => n + BigInt(p.confirmedDays), 0n),
    accounted: saved.reduce((n, p) => n + BigInt(p.usedDays), 0n), remaining: saved.reduce((n, p) => n + BigInt(p.availableDays), 0n) }
}

export function allocationMessage(days: number, total: number, valid: boolean, manual: boolean) {
  if (!valid || !Number.isFinite(total)) return 'Перевірте кількість днів у розподілі.'
  if (total === days) return days + (manual ? ' днів – збережений або ручний розподіл' : ' днів розподілено автоматично')
  return 'Розподілено ' + total + ' із ' + days + ' днів. ' + (total < days ? 'Потрібно розподілити ще ' + (days-total) : 'Приберіть зайві ' + (total-days))
}
