import type { LeaveType } from '../../../shared/leave'
import type { AccountingView } from './LeaveTypeNavigation'

export type LeaveDestination = { section: 'balances'; type?: LeaveType } | { section: 'rights' }
export type LeaveNavigationIntent = LeaveDestination & { employeeId: string }
export type LeaveSection = 'journal' | LeaveDestination['section']

export function initialLeaveNavigation(intent?: LeaveNavigationIntent): {
  selected: string; section: LeaveSection; accountingView: AccountingView
} {
  return {
    selected: intent?.employeeId ?? '',
    section: intent?.section ?? 'journal',
    accountingView: intent?.section === 'balances' ? intent.type ?? 'overview' : 'overview',
  }
}
