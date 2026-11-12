import type { IpcResult } from './ipc.js'

export const periodLeaveTypes = ['annual_main', 'oms_service_additional', 'children_social_additional'] as const
export type PeriodLeaveType = typeof periodLeaveTypes[number]
export const eventLeaveTypes = ['study_leave', 'veteran_special_leave', 'chernobyl_special_leave'] as const
export const leaveTypes = [...periodLeaveTypes, ...eventLeaveTypes] as const
export function isPeriodLeave(type: LeaveType): type is PeriodLeaveType {
  return (periodLeaveTypes as readonly string[]).includes(type)
}
// Agreed registration limits, not an eligibility or legal-rules engine.
export const specialLeaveLimits = { veteran_special_leave: 14, chernobyl_special_leave: 16 } as const
export function specialLeaveLimit(type: LeaveType): number | null {
  return type === 'veteran_special_leave' || type === 'chernobyl_special_leave' ? specialLeaveLimits[type] : null
}
export type LeaveType = typeof leaveTypes[number]
export type LeaveAccountingBasis = 'initial_balance' | 'confirmed_entitlement'

export interface LeavePeriodInput {
  leaveType: PeriodLeaveType
  periodStart: string
  periodEnd: string
  accountingBasis: LeaveAccountingBasis
  confirmedDays: number
  referenceEntitlementDays: number | null
}

export interface ConfirmedLeavePeriod extends LeavePeriodInput {
  id: string
  employeeId: string
  status: 'confirmed'
}

export interface ProposedLeavePeriod {
  leaveType: PeriodLeaveType
  periodStart: string
  periodEnd: string
  accountingBasis: LeaveAccountingBasis
  status: 'proposed'
}

export type LeaveErrorCode = 'LEAVE_DOCUMENT_REQUISITES_LOCKED' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE_UNAVAILABLE' | 'INVALID_ARGUMENTS' | 'BUSY' | 'INSUFFICIENT_DAYS' | 'LEAVE_OVERLAP' | 'PERIOD_IN_USE' | 'TRANSITION_LEAVE' | 'STALE_REVISION' | 'LEAVE_CANCELLED' | 'INVALID_PERIOD' | 'SPECIAL_YEAR_CONFLICT' | 'SPECIAL_DURATION' | 'GRANT_BASIS_REQUIRED'

export interface EmployeeLeaveRight { employeeId: string; leaveType: LeaveType; status: 'has_right' | 'no_right'; checkedAt: string }
export interface LeaveRightInput { leaveType: LeaveType; status: 'has_right' | 'no_right' | null }
export interface LeaveApi {
  getOmsServiceLeaveProjection: (employeeId: string) => Promise<IpcResult<import('./service-leave-calculations.js').OmsServiceLeaveProjection>>
  getServiceLeaveStart: (employeeId: string) => Promise<IpcResult<string | null>>
  saveServiceLeaveStart: (employeeId: string, date: string | null) => Promise<IpcResult<string | null>>
  listRights: (employeeId: string) => Promise<IpcResult<EmployeeLeaveRight[]>>
  saveRights: (employeeId: string, input: LeaveRightInput[]) => Promise<IpcResult<EmployeeLeaveRight[]>>
  getRecord: (id: string) => Promise<IpcResult<LeaveRecord>>
  updateLeave: (input: LeaveUpdate) => Promise<IpcResult<LeaveRecord>>
  cancelLeave: (id: string, expectedRevision: number, reason: string) => Promise<IpcResult<LeaveRecord>>
  proposeEditAllocation: (id: string, expectedRevision: number, leaveType: PeriodLeaveType, days: number, startDate: string, endDate: string) => Promise<IpcResult<AllocationProposal>>
  registerLeave: (input: LeaveRegistration) => Promise<IpcResult<LeaveRecord>>
  listRecords: (employeeId: string | null) => Promise<IpcResult<LeaveRecord[]>>
  getBalances: (employeeId: string) => Promise<IpcResult<PeriodBalance[]>>
  proposeAllocation: (employeeId: string, leaveType: PeriodLeaveType, days: number, startDate: string, endDate: string) => Promise<IpcResult<AllocationProposal>>

  listPeriods: (employeeId: string) => Promise<IpcResult<ConfirmedLeavePeriod[]>>
  proposePeriods: (employeeId: string, throughDate: string, leaveType: PeriodLeaveType) => Promise<IpcResult<ProposedLeavePeriod[]>>
  savePeriods: (employeeId: string, periods: LeavePeriodInput[]) => Promise<IpcResult<ConfirmedLeavePeriod[]>>
  deletePeriod: (periodId: string) => Promise<IpcResult<null>>
}
export interface PeriodBalance extends ConfirmedLeavePeriod {
  usedDays: number
  availableDays: number
}
export interface LeaveRegistration {
  requestId: string
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  usedDays: number
  orderNumber: string | null
  orderDate: string | null
  durationExplanation: string | null
  grantBasis?: string | null
  allocations: import('./leave-calculations.js').DayAllocation[]
}
export interface LeaveRecord extends Omit<LeaveRegistration, 'requestId'> {
  grantBasis: string | null
  id: string
  status: 'active' | 'cancelled'
  revision: number
  cancelledAt: string | null
  cancelReason: string | null
  allocationWarning: boolean
  createdAt: string
}
export interface AllocationProposal {
  balances: PeriodBalance[]
  allocations: import('./leave-calculations.js').DayAllocation[]
  shortfall: number
}

export interface LeaveUpdate extends Omit<LeaveRegistration, 'requestId' | 'employeeId'> {
  id: string
  expectedRevision: number
}
