import type { EmployeeLeaveRight, LeaveRightInput, LeaveType } from '../../../shared/leave'

export function changedLeaveRights(options: readonly { value: LeaveType }[], draft: Record<string, string>, saved: EmployeeLeaveRight[]): LeaveRightInput[] {
  return options.filter(option => (draft[option.value] ?? '') !== (saved.find(right => right.leaveType === option.value)?.status ?? ''))
    .map(option => ({ leaveType: option.value, status: (draft[option.value] || null) as LeaveRightInput['status'] }))
}
