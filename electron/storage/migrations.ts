import { specialLeavesSql } from './special-leaves-migration.js'
import { leaveCorrectionsSql } from './leave-corrections-migration.js'
import { leaveRegistrationSql } from './leave-registration-migration.js'
import { personnelSql } from './personnel-migration.js'
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
}, {
  version: 3,
  name: 'personnel_foundation',
  requiresBackup: true,
  sql: personnelSql,
}, {
  version: 4,
  name: 'remove_employee_note',
  requiresBackup: true,
  sql: 'ALTER TABLE employees DROP COLUMN note',
}, {
  version: 5,
  name: 'simplify_personnel',
  requiresBackup: true,
  sql: `DROP TABLE employee_positions;
DROP TABLE employees;
CREATE TABLE employees (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 200),
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 200),
  middle_name TEXT CHECK (middle_name IS NULL OR length(trim(middle_name)) BETWEEN 1 AND 200),
  birth_date TEXT CHECK (birth_date IS NULL OR (length(birth_date) = 10 AND birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(birth_date, 1, 4) != '0000' AND coalesce(date(birth_date, '+0 days') = birth_date, 0))),
  employee_type TEXT NOT NULL CHECK (employee_type IN ('official', 'staff')),
  hire_date TEXT NOT NULL CHECK (length(hire_date) = 10 AND hire_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(hire_date, 1, 4) != '0000' AND coalesce(date(hire_date, '+0 days') = hire_date, 0)),
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  CHECK (birth_date IS NULL OR birth_date <= hire_date)
) STRICT;
CREATE INDEX employees_position ON employees(position_id);
CREATE INDEX employees_department ON employees(department_id);`,
}, {
  version: 6,
  name: 'leave_period_balances',
  requiresBackup: true,
  sql: `CREATE TABLE leave_period_balances (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual_main', 'oms_service_additional', 'children_social_additional')),
  period_start TEXT NOT NULL CHECK (length(period_start) = 10 AND period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(period_start, 1, 4) != '0000' AND coalesce(date(period_start, '+0 days') = period_start, 0)),
  period_end TEXT NOT NULL CHECK (length(period_end) = 10 AND period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(period_end, 1, 4) != '0000' AND coalesce(date(period_end, '+0 days') = period_end, 0)),
  accounting_basis TEXT NOT NULL CHECK (accounting_basis IN ('initial_balance', 'confirmed_entitlement')),
  confirmed_days INTEGER NOT NULL CHECK (confirmed_days >= 0),
  reference_entitlement_days INTEGER CHECK (reference_entitlement_days IS NULL OR reference_entitlement_days >= 0),
  CHECK (period_start <= period_end),
  CHECK ((accounting_basis = 'initial_balance' AND period_start < '2027-01-01') OR
    (accounting_basis = 'confirmed_entitlement' AND period_start >= '2027-01-01')),
  CHECK (accounting_basis = 'initial_balance' OR reference_entitlement_days IS NULL),
  UNIQUE (employee_id, leave_type, period_start)
) STRICT;
CREATE INDEX leave_period_balances_employee ON leave_period_balances(employee_id, period_start);
CREATE TRIGGER leave_period_balances_no_overlap_insert
BEFORE INSERT ON leave_period_balances
WHEN EXISTS (
  SELECT 1 FROM leave_period_balances p
  WHERE p.employee_id = NEW.employee_id AND p.leave_type = NEW.leave_type AND p.period_start != NEW.period_start
    AND NEW.period_start <= p.period_end AND p.period_start <= NEW.period_end
)
BEGIN
  SELECT RAISE(ABORT, 'leave period overlap');
END;
CREATE TRIGGER leave_period_balances_no_overlap_update
BEFORE UPDATE ON leave_period_balances
WHEN EXISTS (
  SELECT 1 FROM leave_period_balances p
  WHERE p.id != OLD.id AND p.employee_id = NEW.employee_id AND p.leave_type = NEW.leave_type
    AND NEW.period_start <= p.period_end AND p.period_start <= NEW.period_end
)
BEGIN
  SELECT RAISE(ABORT, 'leave period overlap');
END;`,
}, {
  version: 7,
  name: 'leave_registration',
  requiresBackup: true,
  sql: leaveRegistrationSql,
}, {
  version: 8,
  name: 'leave_corrections',
  requiresBackup: true,
  sql: leaveCorrectionsSql,
}, {
  version: 9,
  name: 'special_leaves',
  requiresBackup: true,
  sql: specialLeavesSql,
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
