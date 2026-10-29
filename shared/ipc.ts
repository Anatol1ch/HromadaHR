// Only explicitly listed operations may cross the privilege boundary.
export const ipcChannels = { systemGetInfo: 'system:getInfo', storageGetStatus: 'storage:getStatus' } as const

export type StorageErrorCode = 'CORRUPT' | 'UNSUPPORTED_SCHEMA' | 'FILESYSTEM' | 'BUSY' |
  'MIGRATION_FAILED' | 'INITIALIZATION_FAILED' | 'BACKUP_REQUIRED'
export type StorageStatus = { state: 'initializing' | 'closed' } |
  { state: 'ready'; created: boolean; schemaVersion: number } |
  { state: 'error'; code: StorageErrorCode }

export interface SystemInfo {
  name: string
  version: string
  mode: 'dev' | 'built'
}

export type IpcErrorCode = 'FORBIDDEN' | 'INVALID_ARGUMENTS' | 'INTERNAL_ERROR' | 'UNAVAILABLE'
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: IpcErrorCode } }

export interface IpcOperations {
  [ipcChannels.systemGetInfo]: { args: []; result: SystemInfo }
  [ipcChannels.storageGetStatus]: { args: []; result: StorageStatus }
}

export interface HromadaHRApi {
  readonly system: {
    readonly getInfo: (...args: IpcOperations[typeof ipcChannels.systemGetInfo]['args']) => Promise<IpcResult<SystemInfo>>
  }
  readonly storage: {
    readonly getStatus: () => Promise<IpcResult<StorageStatus>>
  }
}
