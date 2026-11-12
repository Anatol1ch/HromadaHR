import type { ServiceBaseline, ServiceBaselineInput, SeniorityOverview, SeniorityRanksApi, SeniorityRanksErrorCode, Allowance, AllowanceInput, CurrentRank, RankInput } from './seniority-ranks.js'
import type { EmployeeLeaveRight, LeaveRightInput } from './leave.js'
import type { LeaveRegistration, LeaveUpdate, LeaveRecord, PeriodBalance, AllocationProposal } from './leave.js'
import type { ZoomPercent, ZoomStatus } from './zoom.js'
import type { BackupHistory } from './backupHistory.js'
import type { ContactId } from './contacts.js'
import type { PersonnelApi, PersonnelErrorCode, EmployeeCard, EmployeeDetails, Department, Position, DictionaryKind, DictionarySnapshot } from './personnel.js'
import type { LeaveApi, LeaveErrorCode, ConfirmedLeavePeriod, LeavePeriodInput, PeriodLeaveType, ProposedLeavePeriod } from './leave.js'
// Only explicitly listed operations may cross the privilege boundary.
import type { AvailableBackups, BackupApi, BackupStatus, FolderSelection, RestoreSelection, BackupSlot, BackupErrorCode } from './backup.js'
export const ipcChannels = {
  controlOverview:'personnelControl:getOverview',controlSettings:'personnelControl:getSettings',controlSaveSettings:'personnelControl:saveSettings',controlSetState:'personnelControl:setReminderState',
  seniorityGetRankProjection:'seniorityRanks:getRankProjection',
  seniorityGetServiceProjection: 'seniorityRanks:getServiceProjection',
  seniorityGetServiceBaseline: 'seniorityRanks:getServiceBaseline',
  senioritySaveServiceBaseline: 'seniorityRanks:saveServiceBaseline',
  seniorityClearServiceBaseline: 'seniorityRanks:clearServiceBaseline',
  seniorityListOverview: 'seniorityRanks:listOverview',
  seniorityGetAllowance: 'seniorityRanks:getAllowance',
  senioritySaveAllowance: 'seniorityRanks:saveAllowance',
  seniorityClearAllowance: 'seniorityRanks:clearAllowance',
  seniorityGetRank: 'seniorityRanks:getRank',
  senioritySaveRank: 'seniorityRanks:saveRank',
  seniorityClearRank: 'seniorityRanks:clearRank',

  leaveOmsServiceProjection: 'leave:getOmsServiceLeaveProjection',
  leaveListRights: 'leave:listRights', leaveSaveRights: 'leave:saveRights',
  leaveGetServiceLeaveStart: 'leave:getServiceLeaveStart', leaveSaveServiceLeaveStart: 'leave:saveServiceLeaveStart',
  leaveGetRecord: 'leave:getRecord', leaveUpdate: 'leave:updateLeave', leaveCancel: 'leave:cancelLeave',
  leaveProposeEditAllocation: 'leave:proposeEditAllocation',
  leaveRegister: 'leave:registerLeave', leaveListRecords: 'leave:listRecords',
  leaveGetBalances: 'leave:getBalances', leaveProposeAllocation: 'leave:proposeAllocation',
  personnelDeleteEmployee: 'personnel:deleteEmployee',
  personnelListEmployees: 'personnel:listEmployees',
  personnelGetEmployee: 'personnel:getEmployee',
  personnelCreateEmployee: 'personnel:createEmployee',
  personnelUpdateEmployee: 'personnel:updateEmployee',
  personnelListDepartments: 'personnel:listDepartments',
  personnelGetDictionary: 'personnel:getDictionary',
  personnelRenameDictionaryEntry: 'personnel:renameDictionaryEntry',
  personnelDeleteDictionaryEntry: 'personnel:deleteDictionaryEntry',
  personnelReorderDictionary: 'personnel:reorderDictionary',
  personnelCreateDepartment: 'personnel:createDepartment',
  personnelListPositions: 'personnel:listPositions',
  personnelCreatePosition: 'personnel:createPosition',
  leaveListPeriods: 'leave:listPeriods',
  leaveProposePeriods: 'leave:proposePeriods',
  leaveSavePeriods: 'leave:savePeriods',
  leaveDeletePeriod: 'leave:deletePeriod',
  systemGetZoom: 'system:getZoom', systemSetZoom: 'system:setZoom',
  systemOpenContact: 'system:openContact', backupGetHistory: 'backup:getHistory',
  systemGetInfo: 'system:getInfo', storageGetStatus: 'storage:getStatus',
  storageRetry: 'storage:retry', systemQuit: 'system:quit',
  backupListCopies: 'backup:listCopies', backupSelectCopy: 'backup:selectCopy',
  backupOpenFolder: 'backup:openBackupFolder',
  backupGetStatus: 'backup:getStatus', backupChooseFolder: 'backup:chooseFolder', backupSaveConfig: 'backup:saveConfig',
  backupRunManual: 'backup:runManual', backupChooseRestore: 'backup:chooseRestore', backupConfirmRestore: 'backup:confirmRestore',
} as const

export type StorageErrorCode = 'CORRUPT' | 'UNSUPPORTED_SCHEMA' | 'FILESYSTEM' | 'BUSY' |
  'MIGRATION_FAILED' | 'INITIALIZATION_FAILED' | 'BACKUP_REQUIRED' | 'RECOVERY_REQUIRED' | 'MISSING_DATABASE'
export type StorageStatus = { state: 'initializing' | 'closed' } |
  { state: 'ready'; created: boolean; schemaVersion: number } |
  { state: 'error'; code: StorageErrorCode }

export interface SystemInfo {
  name: string
  version: string
  mode: 'dev' | 'built'
}

export type IpcErrorCode = 'STALE_REMINDER' | SeniorityRanksErrorCode | 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE' | BackupErrorCode | PersonnelErrorCode | LeaveErrorCode
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.controlOverview]:{args:[];result:import('./personnel-control.js').ControlOverview}
  [ipcChannels.controlSettings]:{args:[];result:import('./personnel-control.js').ControlSettings}
  [ipcChannels.controlSaveSettings]:{args:[import('./personnel-control.js').ControlSettings];result:import('./personnel-control.js').ControlSettings}
  [ipcChannels.controlSetState]:{args:[import('./personnel-control.js').ReminderStateInput];result:import('./personnel-control.js').ControlOverview}
  [ipcChannels.seniorityGetRankProjection]:{args:[string];result:import('./rank-projection.js').RankProjection}
  [ipcChannels.seniorityGetServiceProjection]: { args: [string]; result: import('./service-calculations.js').ServiceProjection }
  [ipcChannels.seniorityGetServiceBaseline]: { args: [string]; result: ServiceBaseline | null }
  [ipcChannels.senioritySaveServiceBaseline]: { args: [string, ServiceBaselineInput]; result: ServiceBaseline }
  [ipcChannels.seniorityClearServiceBaseline]: { args: [string]; result: null }
  [ipcChannels.seniorityListOverview]: { args: []; result: SeniorityOverview[] }
  [ipcChannels.seniorityGetAllowance]: { args: [string]; result: Allowance | null }
  [ipcChannels.senioritySaveAllowance]: { args: [string, AllowanceInput]; result: Allowance }
  [ipcChannels.seniorityClearAllowance]: { args: [string]; result: null }
  [ipcChannels.seniorityGetRank]: { args: [string]; result: CurrentRank | null }
  [ipcChannels.senioritySaveRank]: { args: [string, RankInput]; result: CurrentRank }
  [ipcChannels.seniorityClearRank]: { args: [string]; result: null }

  [ipcChannels.leaveOmsServiceProjection]: { args:[string]; result:import('./service-leave-calculations.js').OmsServiceLeaveProjection }
  [ipcChannels.leaveListRights]: { args: [string]; result: EmployeeLeaveRight[] }
  [ipcChannels.leaveSaveRights]: { args: [string, LeaveRightInput[]]; result: EmployeeLeaveRight[] }
  [ipcChannels.leaveGetServiceLeaveStart]: { args: [string]; result: string | null }
  [ipcChannels.leaveSaveServiceLeaveStart]: { args: [string, string | null]; result: string | null }
  [ipcChannels.leaveGetRecord]: { args: [string]; result: LeaveRecord }
  [ipcChannels.leaveUpdate]: { args: [LeaveUpdate]; result: LeaveRecord }
  [ipcChannels.leaveCancel]: { args: [string, number, string]; result: LeaveRecord }
  [ipcChannels.leaveProposeEditAllocation]: { args: [string, number, PeriodLeaveType, number, string, string]; result: AllocationProposal }
  [ipcChannels.leaveRegister]: { args: [LeaveRegistration]; result: LeaveRecord }
  [ipcChannels.leaveListRecords]: { args: [string | null]; result: LeaveRecord[] }
  [ipcChannels.leaveGetBalances]: { args: [string]; result: PeriodBalance[] }
  [ipcChannels.leaveProposeAllocation]: { args: [string, PeriodLeaveType, number, string, string]; result: AllocationProposal }
  [ipcChannels.backupListCopies]: { args: []; result: AvailableBackups }
  [ipcChannels.backupSelectCopy]: { args: [string]; result: RestoreSelection }
  [ipcChannels.backupOpenFolder]: { args: [BackupSlot]; result: null }
  [ipcChannels.systemGetZoom]: { args: []; result: ZoomStatus }
  [ipcChannels.systemSetZoom]: { args: [ZoomPercent]; result: ZoomStatus }
  [ipcChannels.systemOpenContact]: { args: [ContactId]; result: boolean }
  [ipcChannels.backupGetHistory]: { args: []; result: BackupHistory }
  [ipcChannels.personnelDeleteEmployee]: { args: [string]; result: null }
  [ipcChannels.personnelListEmployees]: { args: []; result: EmployeeCard[] }
  [ipcChannels.personnelGetEmployee]: { args: [string]; result: EmployeeCard }
  [ipcChannels.personnelCreateEmployee]: { args: [EmployeeDetails]; result: EmployeeCard }
  [ipcChannels.personnelUpdateEmployee]: { args: [string, EmployeeDetails, boolean?]; result: EmployeeCard }
  [ipcChannels.personnelListDepartments]: { args: []; result: Department[] }
  [ipcChannels.personnelGetDictionary]: { args: [DictionaryKind]; result: DictionarySnapshot }
  [ipcChannels.personnelRenameDictionaryEntry]: { args: [DictionaryKind, string, string, number]; result: DictionarySnapshot }
  [ipcChannels.personnelDeleteDictionaryEntry]: { args: [DictionaryKind, string, number]; result: DictionarySnapshot }
  [ipcChannels.personnelReorderDictionary]: { args: [DictionaryKind, string[], number]; result: DictionarySnapshot }
  [ipcChannels.personnelCreateDepartment]: { args: [Omit<Department, 'id'>]; result: Department }
  [ipcChannels.personnelListPositions]: { args: []; result: Position[] }
  [ipcChannels.personnelCreatePosition]: { args: [Omit<Position, 'id'>]; result: Position }
  [ipcChannels.leaveListPeriods]: { args: [string]; result: ConfirmedLeavePeriod[] }
  [ipcChannels.leaveProposePeriods]: { args: [string, string, PeriodLeaveType]; result: ProposedLeavePeriod[] }
  [ipcChannels.leaveSavePeriods]: { args: [string, LeavePeriodInput[]]; result: ConfirmedLeavePeriod[] }
  [ipcChannels.leaveDeletePeriod]: { args: [string]; result: null }
  [ipcChannels.systemGetInfo]: { args: []; result: SystemInfo }
  [ipcChannels.storageGetStatus]: { args: []; result: StorageStatus }
  [ipcChannels.storageRetry]: { args: []; result: StorageStatus }
  [ipcChannels.systemQuit]: { args: []; result: null }
  [ipcChannels.backupGetStatus]: { args: []; result: BackupStatus }
  [ipcChannels.backupChooseFolder]: { args: [BackupSlot]; result: FolderSelection | null }
  [ipcChannels.backupSaveConfig]: { args: [[string | null, string | null]]; result: BackupStatus }
  [ipcChannels.backupRunManual]: { args: []; result: BackupStatus }
  [ipcChannels.backupChooseRestore]: { args: []; result: RestoreSelection | null }
  [ipcChannels.backupConfirmRestore]: { args: [string]; result: { restored: boolean } }
}

export interface HromadaHRApi {
  readonly personnelControl:import('./personnel-control.js').PersonnelControlApi
  readonly seniorityRanks: SeniorityRanksApi
  readonly personnel: PersonnelApi
  readonly leave: LeaveApi
  readonly backup: BackupApi
  readonly system: {
    readonly getZoom: () => Promise<IpcResult<ZoomStatus>>
    readonly setZoom: (percent: ZoomPercent) => Promise<IpcResult<ZoomStatus>>
    readonly openContact: (id: ContactId) => Promise<IpcResult<boolean>>
    readonly quit: () => Promise<IpcResult<null>>
    readonly getInfo: (...args: IpcOperations[typeof ipcChannels.systemGetInfo]['args']) => Promise<IpcResult<SystemInfo>>
  }
  readonly storage: {
    readonly retry: () => Promise<IpcResult<StorageStatus>>
    readonly getStatus: () => Promise<IpcResult<StorageStatus>>
  }
}
