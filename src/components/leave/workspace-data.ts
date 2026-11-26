import type { LeaveRecord, EmployeeLeaveRight, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'

export type LeaveWorkspaceData = {
  employeeId: string
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}
