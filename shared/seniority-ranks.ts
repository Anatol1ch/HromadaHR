import type { RankProjection } from './rank-projection.js'
import type { ServiceProjection } from './service-calculations.js'
import type { EmployeeCard } from './personnel.js'
import type { IpcResult } from './ipc.js'
export const allowancePercentages = [0, 10, 15, 20, 25, 30, 40] as const
export interface BasisDocument { documentType: string | null; documentNumber: string | null; documentDate: string | null; reviewOn: string | null }
export type AllowanceInput = BasisDocument & (
  { status: 'confirmed'; percentage: typeof allowancePercentages[number]; effectiveOn: string } |
  { status: 'not_applicable'; percentage: null; effectiveOn: null })
export const rankOrigins = ['unknown','oms_assigned','oms_retained','civil_service_equivalence','oms_early','pension_exception','other'] as const
export type RankOrigin = typeof rankOrigins[number]
export interface RankInput extends BasisDocument { origin: RankOrigin; reviewAnchorOn: string | null; originNote: string | null; rank: number; assignedOn: string; effectiveOn: string | null }
export type Allowance = AllowanceInput & { employeeId: string; confirmedAt: string }
export interface CurrentRank extends RankInput { employeeId: string; confirmedAt: string }
export type SeniorityRanksErrorCode = 'RANK_REQUIRES_OFFICIAL'
export interface SeniorityOverview { employee: EmployeeCard; allowance: Allowance | null; rank: CurrentRank | null }
export interface ServiceBaselineInput { years: number; months: number; days: number; asOfDate: string; basisNote: string | null; autoAccrueAfterBaseline: boolean }
export interface ServiceBaseline extends ServiceBaselineInput { employeeId: string; confirmedAt: string }
export interface SeniorityRanksApi {
  getRankProjection: (employeeId: string) => Promise<IpcResult<RankProjection>>
  getServiceProjection: (employeeId: string) => Promise<IpcResult<ServiceProjection>>
  getServiceBaseline: (employeeId: string) => Promise<IpcResult<ServiceBaseline | null>>
  saveServiceBaseline: (employeeId: string, input: ServiceBaselineInput) => Promise<IpcResult<ServiceBaseline>>
  clearServiceBaseline: (employeeId: string) => Promise<IpcResult<null>>
  listOverview: () => Promise<IpcResult<SeniorityOverview[]>>
  getAllowance: (employeeId: string) => Promise<IpcResult<Allowance | null>>
  saveAllowance: (employeeId: string, input: AllowanceInput) => Promise<IpcResult<Allowance>>
  clearAllowance: (employeeId: string) => Promise<IpcResult<null>>
  getRank: (employeeId: string) => Promise<IpcResult<CurrentRank | null>>
  saveRank: (employeeId: string, input: RankInput) => Promise<IpcResult<CurrentRank>>
  clearRank: (employeeId: string) => Promise<IpcResult<null>>
}
