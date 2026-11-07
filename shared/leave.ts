import type { IpcResult } from './ipc.js'

export const leaveTypes = ['annual_main', 'oms_service_additional', 'children_social_additional'] as const
export type LeaveType = typeof leaveTypes[number]
export type LeaveAccountingBasis = 'initial_balance' | 'confirmed_entitlement'

export interface LeavePeriodInput {
  leaveType: LeaveType
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
  leaveType: LeaveType
  periodStart: string
  periodEnd: string
  accountingBasis: LeaveAccountingBasis
  status: 'proposed'
}

export type LeaveErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STORAGE_UNAVAILABLE' | 'INVALID_ARGUMENTS' | 'BUSY' | 'INSUFFICIENT_DAYS' | 'LEAVE_OVERLAP' | 'PERIOD_IN_USE' | 'TRANSITION_LEAVE' | 'STALE_REVISION' | 'LEAVE_CANCELLED' | 'INVALID_PERIOD'

export interface LeaveApi {
  getRecord: (id: string) => Promise<IpcResult<LeaveRecord>>
  updateLeave: (input: LeaveUpdate) => Promise<IpcResult<LeaveRecord>>
  cancelLeave: (id: string, expectedRevision: number, reason: string) => Promise<IpcResult<LeaveRecord>>
  proposeEditAllocation: (id: string, expectedRevision: number, leaveType: LeaveType, days: number, startDate: string, endDate: string) => Promise<IpcResult<AllocationProposal>>
  registerLeave: (input: LeaveRegistration) => Promise<IpcResult<LeaveRecord>>
  listRecords: (employeeId: string | null) => Promise<IpcResult<LeaveRecord[]>>
  getBalances: (employeeId: string) => Promise<IpcResult<PeriodBalance[]>>
  proposeAllocation: (employeeId: string, leaveType: LeaveType, days: number, startDate: string, endDate: string) => Promise<IpcResult<AllocationProposal>>

  listPeriods: (employeeId: string) => Promise<IpcResult<ConfirmedLeavePeriod[]>>
  proposePeriods: (employeeId: string, throughDate: string, leaveType: LeaveType) => Promise<IpcResult<ProposedLeavePeriod[]>>
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
  allocations: import('./leave-calculations.js').DayAllocation[]
}
export interface LeaveRecord extends Omit<LeaveRegistration, 'requestId'> {
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
