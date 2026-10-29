import Database from 'better-sqlite3'
import { closeSync, lstatSync, mkdirSync, openSync, readSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { StorageStatus } from '../../shared/ipc.js'
import { StorageError, storageErrorCode } from './errors.js'
import { applyMigrations, migrations, readSchemaVersion } from './migrations.js'
import type { Migration } from './migrations.js'

const openPaths = new Set<string>()
const busyTimeout = 5000

export function storagePath(localAppData: string | undefined, isDev: boolean): string {
  if (!localAppData || !isAbsolute(localAppData)) throw new StorageError('FILESYSTEM')
  return join(localAppData, isDev ? 'HromadaHR-dev' : 'HromadaHR', 'data', 'hromadahr.db')
}

function checkIntegrity(db: Database.Database) {
  const rows = db.pragma('integrity_check') as { integrity_check: string }[]
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok' ||
    (db.pragma('foreign_key_check') as unknown[]).length) throw new StorageError('CORRUPT')
}

function validateExistingFile(path: string) {
  const stat = lstatSync(path)
  if (!stat.isFile()) throw new StorageError('FILESYSTEM')
  // An existing empty/truncated file is not a new database.
  if (stat.size < 100) throw new StorageError('CORRUPT')
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(16)
    if (readSync(descriptor, header, 0, 16, 0) !== 16 || header.toString() !== 'SQLite format 3\0') {
      throw new StorageError('CORRUPT')
    }
  } finally {
    closeSync(descriptor)
  }
}

// Main-only connection owner. Never export this object through IPC.
export function openStorage(path: string, manifest: readonly Migration[] = migrations) {
  if (!isAbsolute(path)) throw new StorageError('FILESYSTEM')
  const key = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  if (openPaths.has(key)) throw new StorageError('BUSY')
  openPaths.add(key)
  let db: Database.Database | undefined
  let created = false
  try {
    mkdirSync(dirname(path), { recursive: true })
    try {
      lstatSync(path)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      // Exclusive creation prevents replacing a file that appeared concurrently.
      closeSync(openSync(path, 'wx'))
      created = true
    }
    if (!created) {
      validateExistingFile(path)
      const probe = new Database(path, { readonly: true, fileMustExist: true, timeout: busyTimeout })
      try {
        checkIntegrity(probe)
        readSchemaVersion(probe, manifest)
      } finally {
        probe.close()
      }
    }
    db = new Database(path, { fileMustExist: true, timeout: busyTimeout })
    db.pragma('foreign_keys = ON')
    db.pragma(`busy_timeout = ${busyTimeout}`)
    db.pragma('synchronous = FULL')
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw new StorageError('INITIALIZATION_FAILED')
    const schemaVersion = applyMigrations(db, manifest)
    checkIntegrity(db)
    const connection = db
    let closed = false
    return {
      database: connection,
      created,
      schemaVersion,
      close() {
        if (closed) return
        if (connection.open) connection.close()
        closed = true
        openPaths.delete(key)
      },
    }
  } catch (error) {
    try { if (db?.open) db.close() } finally { openPaths.delete(key) }
    throw new StorageError(storageErrorCode(error))
  }
}

export class Storage {
  private connection: ReturnType<typeof openStorage> | undefined
  private status: StorageStatus = { state: 'initializing' }

  initialize(getPath: () => string) {
    if (this.status.state !== 'initializing') return
    try {
      this.connection = openStorage(getPath())
      this.status = { state: 'ready', created: this.connection.created, schemaVersion: this.connection.schemaVersion }
    } catch (error) {
      this.status = { state: 'error', code: storageErrorCode(error) }
    }
  }

  getStatus(): StorageStatus {
    return { ...this.status }
  }

  close() {
    this.connection?.close()
    this.connection = undefined
    this.status = { state: 'closed' }
  }
}
