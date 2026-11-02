import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { StorageError, storageErrorCode } from './errors.js'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
  // A verified online snapshot must complete before this migration starts.
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
}, {
  version: 2,
  name: 'backup_configuration',
  sql: `CREATE TABLE backup_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    instance_id TEXT NOT NULL,
    folder1 TEXT,
    folder2 TEXT
  ) STRICT;
  CREATE TABLE backup_state (
    slot INTEGER PRIMARY KEY CHECK (slot IN (1, 2)),
    auto_day TEXT,
    last_attempt TEXT,
    last_success TEXT,
    last_kind TEXT CHECK (last_kind IN ('auto', 'manual')),
    error TEXT,
    file_name TEXT,
    attempt_day TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    retry_after INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  INSERT INTO backup_state(slot) VALUES (1), (2)`,
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
    applyOne(db, manifest, migration)
    version = migration.version
  }
  return version
}

export async function applyMigrationsSafely(db: Database.Database, manifest: readonly Migration[],
  protect: (db: Database.Database, migration: Migration) => Promise<void>): Promise<number> {
  let version = readSchemaVersion(db, manifest)
  for (const migration of manifest.slice(version)) {
    if (migration.requiresBackup) await protect(db, migration)
    applyOne(db, manifest, migration)
    version = migration.version
  }
  return version
}

function applyOne(db: Database.Database, manifest: readonly Migration[], migration: Migration) {
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
  } catch (error) {
    const code = storageErrorCode(error)
    throw new StorageError(code === 'INITIALIZATION_FAILED' ? 'MIGRATION_FAILED' : code)
  }
}
