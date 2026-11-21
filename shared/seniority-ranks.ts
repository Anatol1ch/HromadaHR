import type { RankProjection } from './rank-projection.js'
import type { ServiceProjection } from './service-calculations.js'
import type { EmployeeCard } from './personnel.js'
import type { IpcResult } from './ipc.js'
export const allowancePercentages = [0, 10, 15, 20, 25, 30, 40] as const
export interface BasisDocument { documentType: string | null; documentNumber: string | null; documentDate: string | null }
export type AllowanceInput = BasisDocument & (
  { status: 'confirmed'; percentage: typeof allowancePercentages[number]; effectiveOn: string } |
  { status: 'not_applicable'; percentage: null; effectiveOn: null })
export const rankOrigins = ['oms_assigned','oms_retained','civil_service_equivalence'] as const
export type RankOrigin = typeof rankOrigins[number]
/** Retired values stay readable so existing records require explicit review, never reclassification. */
export const storedRankOrigins = [...rankOrigins, 'unknown', 'oms_early', 'pension_exception', 'other'] as const
export type StoredRankOrigin = typeof storedRankOrigins[number]
export interface RankInput extends BasisDocument { origin: RankOrigin; reviewAnchorOn: string | null; rank: number; assignedOn: string }
export type Allowance = AllowanceInput & { employeeId: string; confirmedAt: string }
export interface CurrentRank extends Omit<RankInput, 'origin'> { origin: StoredRankOrigin; employeeId: string; confirmedAt: string }
export type SeniorityRanksErrorCode = 'RANK_REQUIRES_OFFICIAL'
export interface SeniorityOverview { employee: EmployeeCard; allowance: Allowance | null; rank: CurrentRank | null }
export interface ServicePeriod { id: string; startDate: string; endDate: string | null }
export type ServiceAccountingInput =
  | { mode: 'continuous'; startDate: string }
  | { mode: 'periods'; periods: ServicePeriod[] }
  | { mode: 'snapshot'; years: number; months: number; days: number; asOfDate: string }
export type ServiceAccounting = ServiceAccountingInput & { employeeId: string; confirmedAt: string }
export interface SeniorityRanksApi {
  getRankProjection: (employeeId: string) => Promise<IpcResult<RankProjection>>
  getServiceProjection: (employeeId: string) => Promise<IpcResult<ServiceProjection>>
  getServiceAccounting: (employeeId: string) => Promise<IpcResult<ServiceAccounting | null>>
  previewServiceAccounting: (employeeId: string, input: ServiceAccountingInput, asOfDate: string) => Promise<IpcResult<import('./service-calculations.js').ServiceProjection>>
  saveServiceAccounting: (employeeId: string, input: ServiceAccountingInput) => Promise<IpcResult<ServiceAccounting>>
  clearServiceAccounting: (employeeId: string) => Promise<IpcResult<null>>
  listOverview: () => Promise<IpcResult<SeniorityOverview[]>>
  getAllowance: (employeeId: string) => Promise<IpcResult<Allowance | null>>
  saveAllowance: (employeeId: string, input: AllowanceInput) => Promise<IpcResult<Allowance>>
  clearAllowance: (employeeId: string) => Promise<IpcResult<null>>
  getRank: (employeeId: string) => Promise<IpcResult<CurrentRank | null>>
  saveRank: (employeeId: string, input: RankInput) => Promise<IpcResult<CurrentRank>>
  clearRank: (employeeId: string) => Promise<IpcResult<null>>
}
