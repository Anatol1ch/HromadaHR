import type { EmployeeCard } from './personnel.js'
import type { IpcResult } from './ipc.js'
export const allowancePercentages = [0, 10, 15, 20, 25, 30, 40] as const
export interface BasisDocument { documentType: string | null; documentNumber: string | null; documentDate: string | null; reviewOn: string | null }
export type AllowanceInput = BasisDocument & (
  { status: 'confirmed'; percentage: typeof allowancePercentages[number]; effectiveOn: string } |
  { status: 'not_applicable'; percentage: null; effectiveOn: null })
export interface RankInput extends BasisDocument { rank: number; assignedOn: string; effectiveOn: string | null }
export type Allowance = AllowanceInput & { employeeId: string; confirmedAt: string }
export interface CurrentRank extends RankInput { employeeId: string; confirmedAt: string }
export type SeniorityRanksErrorCode = 'RANK_REQUIRES_OFFICIAL'
export interface SeniorityOverview { employee: EmployeeCard; allowance: Allowance | null; rank: CurrentRank | null }
export interface SeniorityRanksApi {
  listOverview: () => Promise<IpcResult<SeniorityOverview[]>>
  getAllowance: (employeeId: string) => Promise<IpcResult<Allowance | null>>
  saveAllowance: (employeeId: string, input: AllowanceInput) => Promise<IpcResult<Allowance>>
  clearAllowance: (employeeId: string) => Promise<IpcResult<null>>
  getRank: (employeeId: string) => Promise<IpcResult<CurrentRank | null>>
  saveRank: (employeeId: string, input: RankInput) => Promise<IpcResult<CurrentRank>>
  clearRank: (employeeId: string) => Promise<IpcResult<null>>
}
