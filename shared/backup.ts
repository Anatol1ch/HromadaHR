export type BackupErrorCode = 'BUSY' | 'NOT_CONFIGURED' | 'INVALID_FOLDERS' | 'FOLDER_UNAVAILABLE' |
  'INVALID_SELECTION' | 'INVALID_BACKUP' | 'UNSUPPORTED_SCHEMA' | 'BACKUP_FAILED' |
  'RESTORE_FAILED' | 'RECOVERY_REQUIRED' | 'CANCELLED' | 'STORAGE_UNAVAILABLE'
export type BackupSlot = 1 | 2
export interface BackupTarget {
  slot: BackupSlot
  path: string | null
  available: boolean
  autoDay: string | null
  lastAttempt: string | null
  lastSuccess: string | null
  lastKind: 'auto' | 'manual' | null
  error: BackupErrorCode | null
  fileName: string | null
}
export interface BackupStatus {
  targets: [BackupTarget, BackupTarget]
  sameVolume: boolean
  busy: boolean
  lastRestore: 'success' | 'rolled-back' | null
}
export interface FolderSelection { token: string; path: string }
export interface RestoreSelection { token: string; fileName: string; schemaVersion: number }
export interface BackupApi {
  getStatus(): Promise<import('./ipc.js').IpcResult<BackupStatus>>
  chooseFolder(slot: BackupSlot): Promise<import('./ipc.js').IpcResult<FolderSelection | null>>
  saveConfig(tokens: [string | null, string | null]): Promise<import('./ipc.js').IpcResult<BackupStatus>>
  runManual(): Promise<import('./ipc.js').IpcResult<BackupStatus>>
  chooseRestore(): Promise<import('./ipc.js').IpcResult<RestoreSelection | null>>
  confirmRestore(token: string): Promise<import('./ipc.js').IpcResult<{ restored: boolean }>>
}
