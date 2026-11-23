import type { LeaveType } from '../../../shared/leave'

export type LeaveWorkspaceView = 'overview' | 'balances' | 'history'
export type LeaveWorkspaceState = { view: LeaveWorkspaceView; selectedType: LeaveType | null; historyReturn: LeaveWorkspaceView }
export type LeaveWorkspaceAction =
  | { type: 'open-type'; leaveType: LeaveType }
  | { type: 'close-type' }
  | { type: 'open-balances' }
  | { type: 'open-history'; returnTo: LeaveWorkspaceView }
  | { type: 'return-to-overview' }
  | { type: 'resume-history' }

export const initialLeaveWorkspaceState: LeaveWorkspaceState = { view: 'overview', selectedType: null, historyReturn: 'overview' }

export function leaveWorkspaceNavigation(state: LeaveWorkspaceState, action: LeaveWorkspaceAction): LeaveWorkspaceState {
  switch (action.type) {
    case 'open-type': return { ...state, view: 'overview', selectedType: action.leaveType }
    case 'close-type': return { ...state, selectedType: null }
    case 'open-balances': return state.selectedType ? { ...state, view: 'balances' } : state
    case 'open-history': return { ...state, view: 'history', historyReturn: action.returnTo }
    case 'return-to-overview': return { ...state, view: 'overview' }
    case 'resume-history': return { ...state, view: state.historyReturn }
  }
}
