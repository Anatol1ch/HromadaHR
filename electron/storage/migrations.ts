import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { StorageError, storageErrorCode } from './errors.js'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
  // Fail closed until stage 2.4 provides verified protective copies.
  readonly requiresBackup?: boolean
}

export const migrations: readonly Migration[] = [{
  version: 1,
  name: 'create_schema_migrations',
  sql: `CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`,
}]

function checksum(migration: Migration) {
  return createHash('sha256').update(`${migration.name}\n${migration.sql}`).digest('hex')
}

function validateManifest(manifest: readonly Migration[]) {
  if (!manifest.length || manifest.some((migration, index) => migration.version !== index + 1)) {
    throw new StorageError('MIGRATION_FAILED')
  }
}

export function readSchemaVersion(db: Database.Database, manifest: readonly Migration[] = migrations): number {
  validateManifest(manifest)
  const version = db.pragma('user_version', { simple: true })
  if (typeof version !== 'number' || version > manifest.length) throw new StorageError('UNSUPPORTED_SCHEMA')
  const ledger = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'").get()
  if (!ledger) {
    // Never adopt an unknown database by adding our ledger to its tables.
    if (version !== 0 || db.prepare('SELECT 1 FROM sqlite_schema LIMIT 1').get()) {
      throw new StorageError('UNSUPPORTED_SCHEMA')
    }
    return 0
  }
  let rows: { version: number; name: string; checksum: string }[]
  try {
    rows = db.prepare<[], { version: number; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    ).all()
  } catch (error) {
    if (storageErrorCode(error) !== 'INITIALIZATION_FAILED') throw error
    throw new StorageError('UNSUPPORTED_SCHEMA')
  }
  if (!rows.length || rows.length !== version || rows.some((row, index) => {
    const migration = manifest[index]
    return !migration || row.version !== migration.version || row.name !== migration.name || row.checksum !== checksum(migration)
  })) throw new StorageError('UNSUPPORTED_SCHEMA')
  return version
}

export function applyMigrations(db: Database.Database, manifest: readonly Migration[] = migrations): number {
  let version = readSchemaVersion(db, manifest)
  for (const migration of manifest.slice(version)) {
    if (migration.requiresBackup) throw new StorageError('BACKUP_REQUIRED')
    try {
      db.transaction(() => {
        // Recheck after obtaining the write lock; never run a migration twice.
        if (readSchemaVersion(db, manifest) !== migration.version - 1) throw new StorageError('UNSUPPORTED_SCHEMA')
        db.exec(migration.sql)
        db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
          .run(migration.version, migration.name, checksum(migration), new Date().toISOString())
        db.pragma(`user_version = ${migration.version}`)
        if ((db.pragma('foreign_key_check') as unknown[]).length) throw new StorageError('CORRUPT')
      }).immediate()
      version = migration.version
    } catch (error) {
      const code = storageErrorCode(error)
      throw new StorageError(code === 'INITIALIZATION_FAILED' ? 'MIGRATION_FAILED' : code)
    }
  }
  return version
}
