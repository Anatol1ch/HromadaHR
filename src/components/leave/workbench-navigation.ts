import type { PeriodLeaveType } from '../../../shared/leave'

export type LeaveWorkspaceView = 'overview' | 'rights' | 'balances' | 'history'
export type LeaveWorkspaceState = { view: LeaveWorkspaceView; selectedType: PeriodLeaveType; historyReturn: LeaveWorkspaceView }
export type LeaveWorkspaceAction =
  | { type: 'navigate'; view: Exclude<LeaveWorkspaceView, 'history'> }
  | { type: 'open-balances'; leaveType: PeriodLeaveType }
  | { type: 'open-history'; returnTo: LeaveWorkspaceView }
  | { type: 'resume-history' }

export const initialLeaveWorkspaceState: LeaveWorkspaceState = { view: 'overview', selectedType: 'annual_main', historyReturn: 'overview' }

export function leaveWorkspaceNavigation(state: LeaveWorkspaceState, action: LeaveWorkspaceAction): LeaveWorkspaceState {
  switch (action.type) {
    case 'navigate': return { ...state, view: action.view }
    case 'open-balances': return { ...state, view: 'balances', selectedType: action.leaveType }
    case 'open-history': return { ...state, view: 'history', historyReturn: action.returnTo }
    case 'resume-history': return { ...state, view: state.historyReturn }
  }
}
