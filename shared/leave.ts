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

export type LeaveErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STORAGE_UNAVAILABLE' | 'INVALID_ARGUMENTS' | 'BUSY'

export interface LeaveApi {
  listPeriods: (employeeId: string) => Promise<IpcResult<ConfirmedLeavePeriod[]>>
  proposePeriods: (employeeId: string, throughDate: string, leaveType: LeaveType) => Promise<IpcResult<ProposedLeavePeriod[]>>
  savePeriods: (employeeId: string, periods: LeavePeriodInput[]) => Promise<IpcResult<ConfirmedLeavePeriod[]>>
  deletePeriod: (periodId: string) => Promise<IpcResult<null>>
}
