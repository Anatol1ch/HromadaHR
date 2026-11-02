import Database from 'better-sqlite3'
import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { StorageStatus } from '../../shared/ipc.js'
import { StorageError, storageErrorCode } from './errors.js'
import { applyMigrations, applyMigrationsSafely, migrations, readSchemaVersion } from './migrations.js'
import type { Migration } from './migrations.js'
import { checkIntegrity, validateExistingFile } from './validation.js'
import { protectMigration } from '../backup/files.js'
import { recoverInterruptedRestore } from '../backup/recovery.js'

const openPaths = new Set<string>()
const busyTimeout = 5000

export function storagePath(localAppData: string | undefined, isDev: boolean): string {
  if (!localAppData || !isAbsolute(localAppData)) throw new StorageError('FILESYSTEM')
  return join(localAppData, isDev ? 'HromadaHR-dev' : 'HromadaHR', 'data', 'hromadahr.db')
}

// Main-only connection owner. Never export this object through IPC.
function connectStorage(path: string, manifest: readonly Migration[], recover = true) {
  if (!isAbsolute(path)) throw new StorageError('FILESYSTEM')
  const key = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  if (openPaths.has(key)) throw new StorageError('BUSY')
  openPaths.add(key)
  let db: Database.Database | undefined
  let created = false
  try {
    if (recover) recoverInterruptedRestore(path)
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
    const connection = db
    let closed = false
    return {
      database: connection,
      created,
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

export function openStorage(path: string, manifest: readonly Migration[] = migrations) {
  const connection = connectStorage(path, manifest)
  try {
    const schemaVersion = applyMigrations(connection.database, manifest)
    checkIntegrity(connection.database)
    return { ...connection, schemaVersion }
  } catch (error) { connection.close(); throw error }
}

export async function openStorageSafely(path: string, manifest: readonly Migration[] = migrations, recover = true) {
  const connection = connectStorage(path, manifest, recover)
  try {
    const schemaVersion = await applyMigrationsSafely(connection.database, manifest,
      (db, migration) => protectMigration(db, path, migration, manifest))
    checkIntegrity(connection.database)
    return { ...connection, schemaVersion }
  } catch (error) { connection.close(); throw error }
}

export class Storage {
  private connection: ReturnType<typeof openStorage> | undefined
  private status: StorageStatus = { state: 'initializing' }
  private file: string | undefined
  constructor(readonly manifest: readonly Migration[] = migrations) {}

  initialize(getPath: () => string) {
    if (this.status.state !== 'initializing') return
    try {
      this.file = getPath()
      this.connection = openStorage(this.file, this.manifest)
      this.status = { state: 'ready', created: this.connection.created, schemaVersion: this.connection.schemaVersion }
    } catch (error) {
      this.status = { state: 'error', code: storageErrorCode(error) }
    }
  }

  async initializeSafely(getPath: () => string) {
    if (this.status.state !== 'initializing') return
    try {
      this.file = getPath()
      await this.reopen()
    } catch (error) { this.status = { state: 'error', code: storageErrorCode(error) } }
  }

  getDatabase() {
    if (this.status.state !== 'ready' || !this.connection) throw new StorageError('BUSY')
    return this.connection.database
  }

  getFile() {
    if (!this.file) throw new StorageError('FILESYSTEM')
    return this.file
  }

  async reopen(recover = true) {
    if (this.connection) throw new StorageError('BUSY')
    try {
      this.connection = await openStorageSafely(this.getFile(), this.manifest, recover)
      this.status = { state: 'ready', created: this.connection.created, schemaVersion: this.connection.schemaVersion }
    } catch (error) {
      this.status = { state: 'error', code: storageErrorCode(error) }
      throw error
    }
  }

  getStatus(): StorageStatus {
    return { ...this.status }
  }

  failRecovery() { this.status = { state: 'error', code: 'RECOVERY_REQUIRED' } }

  close() {
    this.connection?.close()
    this.connection = undefined
    this.status = { state: 'closed' }
  }
}
