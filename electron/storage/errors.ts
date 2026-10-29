import type { StorageErrorCode } from '../../shared/ipc.js'

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(code)
  }
}

export function storageErrorCode(error: unknown): StorageErrorCode {
  if (error instanceof StorageError) return error.code
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (/^SQLITE_(CORRUPT|NOTADB)/.test(code)) return 'CORRUPT'
  if (/^SQLITE_(BUSY|LOCKED)/.test(code)) return 'BUSY'
  if (/^SQLITE_(CANTOPEN|READONLY|IOERR|FULL|PERM)/.test(code) ||
    ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EISDIR', 'EEXIST', 'ENOSPC', 'EROFS'].includes(code)) return 'FILESYSTEM'
  return 'INITIALIZATION_FAILED'
}
