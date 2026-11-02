// Only explicitly listed operations may cross the privilege boundary.
import type { BackupApi, BackupStatus, FolderSelection, RestoreSelection, BackupSlot, BackupErrorCode } from './backup.js'
export const ipcChannels = {
  systemGetInfo: 'system:getInfo', storageGetStatus: 'storage:getStatus',
  backupGetStatus: 'backup:getStatus', backupChooseFolder: 'backup:chooseFolder', backupSaveConfig: 'backup:saveConfig',
  backupRunManual: 'backup:runManual', backupChooseRestore: 'backup:chooseRestore', backupConfirmRestore: 'backup:confirmRestore',
} as const

export type StorageErrorCode = 'CORRUPT' | 'UNSUPPORTED_SCHEMA' | 'FILESYSTEM' | 'BUSY' |
  'MIGRATION_FAILED' | 'INITIALIZATION_FAILED' | 'BACKUP_REQUIRED' | 'RECOVERY_REQUIRED'
export type StorageStatus = { state: 'initializing' | 'closed' } |
  { state: 'ready'; created: boolean; schemaVersion: number } |
  { state: 'error'; code: StorageErrorCode }

export interface SystemInfo {
  name: string
  version: string
  mode: 'dev' | 'built'
}

export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE' | BackupErrorCode
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.systemGetInfo]: { args: []; result: SystemInfo }
  [ipcChannels.storageGetStatus]: { args: []; result: StorageStatus }
  [ipcChannels.backupGetStatus]: { args: []; result: BackupStatus }
  [ipcChannels.backupChooseFolder]: { args: [BackupSlot]; result: FolderSelection | null }
  [ipcChannels.backupSaveConfig]: { args: [[string | null, string | null]]; result: BackupStatus }
  [ipcChannels.backupRunManual]: { args: []; result: BackupStatus }
  [ipcChannels.backupChooseRestore]: { args: []; result: RestoreSelection | null }
  [ipcChannels.backupConfirmRestore]: { args: [string]; result: { restored: boolean } }
}

export interface HromadaHRApi {
  readonly backup: BackupApi
  readonly system: {
    readonly getInfo: (...args: IpcOperations[typeof ipcChannels.systemGetInfo]['args']) => Promise<IpcResult<SystemInfo>>
  }
  readonly storage: {
    readonly getStatus: () => Promise<IpcResult<StorageStatus>>
  }
}
