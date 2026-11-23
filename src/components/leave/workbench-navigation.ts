import type { LeaveType } from '../../../shared/leave'

export type LeaveWorkspaceView = 'overview' | 'balances' | 'history'
export type LeaveWorkspaceState = { view: LeaveWorkspaceView; selectedType: LeaveType | null; historyReturn: LeaveWorkspaceView }
export type LeaveWorkspaceAction =
  | { type: 'open-balances'; leaveType: LeaveType }
  | { type: 'open-history'; returnTo: LeaveWorkspaceView }
  | { type: 'return-to-overview' }
  | { type: 'resume-history' }

export const initialLeaveWorkspaceState: LeaveWorkspaceState = { view: 'overview', selectedType: null, historyReturn: 'overview' }

export function leaveWorkspaceNavigation(state: LeaveWorkspaceState, action: LeaveWorkspaceAction): LeaveWorkspaceState {
  switch (action.type) {
    case 'open-balances': return { ...state, view: 'balances', selectedType: action.leaveType }
    case 'open-history': return { ...state, view: 'history', historyReturn: action.returnTo }
    case 'return-to-overview': return { ...state, view: 'overview' }
    case 'resume-history': return { ...state, view: state.historyReturn }
  }
}
