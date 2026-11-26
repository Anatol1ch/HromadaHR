import type { ConfirmedLeavePeriod, EmployeeLeaveRight, LeavePeriodAttentionItem, PeriodLeaveType } from './leave.js'
import type { OmsServiceLeaveProjection } from './service-leave-calculations.js'
import { proposedPeriods, serviceLeaveProposals } from './leave-periods.js'

export interface LeavePeriodAttentionFacts {
  employeeId: string
  hireDate: string
  employeeType: 'official' | 'staff'
  serviceLeaveStart: string | null
  rights: EmployeeLeaveRight[]
  periods: ConfirmedLeavePeriod[]
  serviceProjection: OmsServiceLeaveProjection | null
}

const rightStatus = (facts: LeavePeriodAttentionFacts, type: PeriodLeaveType) =>
  facts.rights.find(right => right.leaveType === type)?.status ?? 'unknown'

/** Derived, read-only attention. Future periods and speculative day counts are excluded. */
export function leavePeriodAttentionForEmployee(facts: LeavePeriodAttentionFacts, today: string): LeavePeriodAttentionItem[] {
  const items: LeavePeriodAttentionItem[] = []
  const annualStatus = rightStatus(facts, 'annual_main')
  if (annualStatus !== 'no_right') {
    const current = proposedPeriods('annual_main', facts.hireDate, today)
      .find(period => period.periodStart <= today && period.periodEnd >= today)
    const saved = current && facts.periods.some(period => period.leaveType === 'annual_main' &&
      period.periodStart === current.periodStart && period.periodEnd === current.periodEnd)
    if (current && !saved) {
      if (current.accountingBasis === 'confirmed_entitlement' && current.suggestedDays !== undefined) {
        items.push({ employeeId: facts.employeeId, leaveType: 'annual_main', periodStart: current.periodStart,
          periodEnd: current.periodEnd, kind: 'needs_confirmation', suggestedDays: current.suggestedDays })
      } else if (current.accountingBasis === 'initial_balance') {
        items.push({ employeeId: facts.employeeId, leaveType: 'annual_main', periodStart: current.periodStart,
          periodEnd: current.periodEnd, kind: 'review_data', reviewReason: 'initial_balance', suggestedDays: null })
      }
    }
  }

  const childrenStatus = rightStatus(facts, 'children_social_additional')
  if (childrenStatus !== 'no_right') {
    const currentYear = today.slice(0, 4)
    const current = proposedPeriods('children_social_additional', facts.hireDate, today)
      .find(period => period.periodStart === `${currentYear}-01-01`)
    const saved = current && facts.periods.some(period => period.leaveType === 'children_social_additional' &&
      period.periodStart === current.periodStart && period.periodEnd === current.periodEnd)
    if (current && !saved) {
      if (childrenStatus === 'unknown') {
        items.push({ employeeId: facts.employeeId, leaveType: 'children_social_additional', periodStart: current.periodStart,
          periodEnd: current.periodEnd, kind: 'review_data', reviewReason: 'right', suggestedDays: null })
      } else if (current.accountingBasis === 'initial_balance') {
        items.push({ employeeId: facts.employeeId, leaveType: 'children_social_additional', periodStart: current.periodStart,
          periodEnd: current.periodEnd, kind: 'review_data', reviewReason: 'initial_balance', suggestedDays: null })
      } else {
        items.push({ employeeId: facts.employeeId, leaveType: 'children_social_additional', periodStart: current.periodStart,
          periodEnd: current.periodEnd, kind: 'needs_confirmation', suggestedDays: null })
      }
    }
  }

  if (facts.employeeType !== 'official' || rightStatus(facts, 'oms_service_additional') === 'no_right') return items
  const servicePeriods = facts.periods.filter(period => period.leaveType === 'oms_service_additional')
  const proposed = facts.serviceLeaveStart
    ? serviceLeaveProposals(facts.serviceLeaveStart, today, servicePeriods)
      .find(period => period.periodStart <= today && period.periodEnd >= today)
    : undefined
  const status = rightStatus(facts, 'oms_service_additional')
  const projection = facts.serviceProjection

  if (status === 'unknown') {
    if (proposed) items.push({ employeeId: facts.employeeId, leaveType: 'oms_service_additional',
      periodStart: proposed.periodStart, periodEnd: proposed.periodEnd, kind: 'review_data', reviewReason: 'right', suggestedDays: null })
    return items
  }
  if (status !== 'has_right') return items
  if (!facts.serviceLeaveStart) {
    items.push({ employeeId: facts.employeeId, leaveType: 'oms_service_additional', periodStart: null, periodEnd: null,
      kind: 'review_data', reviewReason: 'service_data', suggestedDays: null })
    return items
  }
  if (!proposed) return items
  if (proposed.accountingBasis === 'initial_balance') {
    items.push({ employeeId: facts.employeeId, leaveType: 'oms_service_additional', periodStart: proposed.periodStart,
      periodEnd: proposed.periodEnd, kind: 'review_data', reviewReason: 'initial_balance', suggestedDays: null })
    return items
  }
  if (!projection || projection.status !== 'calculated' || projection.calculation.status !== 'calculated' ||
      projection.recommendedDays === null) {
    items.push({ employeeId: facts.employeeId, leaveType: 'oms_service_additional', periodStart: proposed.periodStart,
      periodEnd: proposed.periodEnd, kind: 'review_data', reviewReason: 'service_data', suggestedDays: null })
  } else if (projection.recommendedDays > 0) {
    items.push({ employeeId: facts.employeeId, leaveType: 'oms_service_additional', periodStart: proposed.periodStart,
      periodEnd: proposed.periodEnd, kind: 'needs_confirmation', suggestedDays: projection.recommendedDays })
  }
  return items
}
