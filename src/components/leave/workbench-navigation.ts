import type { LeavePeriodAttentionItem, LeaveType } from '../../../shared/leave'

export type LeaveWorkspaceView = 'overview' | 'rights' | 'balances' | 'history'
export type LeaveWorkspaceState = { view: LeaveWorkspaceView; selectedType: LeaveType | null; historyReturn: LeaveWorkspaceView }
export type LeaveWorkspaceAction =
  | { type: 'navigate'; view: Exclude<LeaveWorkspaceView, 'history'> }
  | { type: 'open-balances'; leaveType: LeaveType }
  | { type: 'back-to-balances-overview' }
  | { type: 'open-history'; returnTo: LeaveWorkspaceView }
  | { type: 'resume-history' }

export const initialLeaveWorkspaceState: LeaveWorkspaceState = { view: 'overview', selectedType: null, historyReturn: 'overview' }

export function leavePeriodAttentionAction(item: LeavePeriodAttentionItem): LeaveWorkspaceAction {
  return item.kind === 'review_data' && item.reviewReason === 'right'
    ? { type: 'navigate', view: 'rights' }
    : { type: 'open-balances', leaveType: item.leaveType }
}

export function leaveWorkspaceNavigation(state: LeaveWorkspaceState, action: LeaveWorkspaceAction): LeaveWorkspaceState {
  switch (action.type) {
    case 'navigate': return { ...state, view: action.view, ...(action.view === 'balances' ? { selectedType: null } : {}) }
    case 'open-balances': return { ...state, view: 'balances', selectedType: action.leaveType }
    case 'back-to-balances-overview': return { ...state, view: 'balances', selectedType: null }
    case 'open-history': return { ...state, view: 'history', historyReturn: action.returnTo }
    case 'resume-history': return { ...state, view: state.historyReturn }
  }
}
