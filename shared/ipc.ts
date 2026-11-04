import type { ZoomPercent, ZoomStatus } from './zoom.js'
import type { BackupHistory } from './backupHistory.js'
import type { ContactId } from './contacts.js'
import type { PersonnelApi, PersonnelErrorCode, AssignmentInput, EmployeeCard, CreateEmployee, EmployeeDetails, Assignment, Department, Position } from './personnel.js'
// Only explicitly listed operations may cross the privilege boundary.
import type { AvailableBackups, BackupApi, BackupStatus, FolderSelection, RestoreSelection, BackupSlot, BackupErrorCode } from './backup.js'
export const ipcChannels = {
  personnelCreateAssignment: 'personnel:createAssignment', personnelUpdateAssignment: 'personnel:updateAssignment',
  personnelDeleteAssignment: 'personnel:deleteAssignment', personnelDeleteEmployee: 'personnel:deleteEmployee',
  personnelListEmployees: 'personnel:listEmployees',
  personnelGetEmployee: 'personnel:getEmployee',
  personnelCreateEmployee: 'personnel:createEmployee',
  personnelUpdateEmployee: 'personnel:updateEmployee',
  personnelGetHistory: 'personnel:getHistory',
  personnelListDepartments: 'personnel:listDepartments',
  personnelCreateDepartment: 'personnel:createDepartment',
  personnelListPositions: 'personnel:listPositions',
  personnelCreatePosition: 'personnel:createPosition',
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

export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE' | BackupErrorCode | PersonnelErrorCode
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.backupListCopies]: { args: []; result: AvailableBackups }
  [ipcChannels.backupSelectCopy]: { args: [string]; result: RestoreSelection }
  [ipcChannels.backupOpenFolder]: { args: [BackupSlot]; result: null }
  [ipcChannels.systemGetZoom]: { args: []; result: ZoomStatus }
  [ipcChannels.systemSetZoom]: { args: [ZoomPercent]; result: ZoomStatus }
  [ipcChannels.systemOpenContact]: { args: [ContactId]; result: boolean }
  [ipcChannels.backupGetHistory]: { args: []; result: BackupHistory }
  [ipcChannels.personnelCreateAssignment]: { args: [string, AssignmentInput]; result: EmployeeCard }
  [ipcChannels.personnelUpdateAssignment]: { args: [string, AssignmentInput]; result: EmployeeCard }
  [ipcChannels.personnelDeleteAssignment]: { args: [string]; result: EmployeeCard }
  [ipcChannels.personnelDeleteEmployee]: { args: [string]; result: null }
  [ipcChannels.personnelListEmployees]: { args: []; result: EmployeeCard[] }
  [ipcChannels.personnelGetEmployee]: { args: [string]; result: EmployeeCard }
  [ipcChannels.personnelCreateEmployee]: { args: [CreateEmployee]; result: EmployeeCard }
  [ipcChannels.personnelUpdateEmployee]: { args: [string, EmployeeDetails]; result: EmployeeCard }
  [ipcChannels.personnelGetHistory]: { args: [string]; result: Assignment[] }
  [ipcChannels.personnelListDepartments]: { args: []; result: Department[] }
  [ipcChannels.personnelCreateDepartment]: { args: [Omit<Department, 'id'>]; result: Department }
  [ipcChannels.personnelListPositions]: { args: []; result: Position[] }
  [ipcChannels.personnelCreatePosition]: { args: [Omit<Position, 'id'>]; result: Position }
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
