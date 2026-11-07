import type { EmployeeLeaveRight, LeaveRightInput } from './leave.js'
import type { LeaveRegistration, LeaveUpdate, LeaveRecord, PeriodBalance, AllocationProposal } from './leave.js'
import type { ZoomPercent, ZoomStatus } from './zoom.js'
import type { BackupHistory } from './backupHistory.js'
import type { ContactId } from './contacts.js'
import type { PersonnelApi, PersonnelErrorCode, EmployeeCard, EmployeeDetails, Department, Position } from './personnel.js'
import type { LeaveApi, LeaveErrorCode, ConfirmedLeavePeriod, LeavePeriodInput, PeriodLeaveType, ProposedLeavePeriod } from './leave.js'
// Only explicitly listed operations may cross the privilege boundary.
import type { AvailableBackups, BackupApi, BackupStatus, FolderSelection, RestoreSelection, BackupSlot, BackupErrorCode } from './backup.js'
export const ipcChannels = {
  leaveListRights: 'leave:listRights', leaveSaveRights: 'leave:saveRights',
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

export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE' | BackupErrorCode | PersonnelErrorCode | LeaveErrorCode
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.leaveListRights]: { args: [string]; result: EmployeeLeaveRight[] }
  [ipcChannels.leaveSaveRights]: { args: [string, LeaveRightInput[]]; result: EmployeeLeaveRight[] }
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
  [ipcChannels.personnelUpdateEmployee]: { args: [string, EmployeeDetails]; result: EmployeeCard }
  [ipcChannels.personnelListDepartments]: { args: []; result: Department[] }
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
