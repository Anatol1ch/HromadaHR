import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { openStorage, Storage, storagePath } from '../dist-electron/electron/storage/index.js'
import { applyMigrations, migrations } from '../dist-electron/electron/storage/migrations.js'

function temporaryTest(name, run) {
  test(name, () => {
    const root = mkdtempSync(join(tmpdir(), 'hromadahr-storage-'))
    const handles = []
    const open = (file = join(root, 'data', 'test.db'), manifest) => {
      const handle = openStorage(file, manifest)
      handles.push(handle)
      return handle
    }
    try { run({ root, open, file: join(root, 'data', 'test.db') }) }
    finally {
      for (const handle of handles.reverse()) handle.close()
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-storage-'))
      rmSync(root, { recursive: true, force: true })
    }
  })
}

const ordered = [...migrations,
  { version: 2, name: 'test_create', sql: 'CREATE TABLE test_values (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT' },
  { version: 3, name: 'test_insert', sql: "INSERT INTO test_values VALUES (1, 'persisted')" },
]
const code = expected => error => error.code === expected && error.message === expected

temporaryTest('new storage creates only the migration ledger and applies durable PRAGMAs', ({ open }) => {
  const storage = open()
  assert.equal(storage.created, true)
  assert.equal(storage.schemaVersion, 1)
  assert.deepEqual(storage.database.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all(), [{ name: 'schema_migrations' }])
  for (const [pragma, value] of [['foreign_keys', 1], ['journal_mode', 'wal'], ['synchronous', 2], ['busy_timeout', 5000]]) {
    assert.equal(storage.database.pragma(pragma, { simple: true }), value)
  }
  assert.equal(storage.database.pragma('integrity_check', { simple: true }), 'ok')
})

temporaryTest('reopen preserves data, unknown tables, and migration timestamps without rerunning', ({ open, file }) => {
  const first = open(file, ordered)
  const ledger = first.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
  assert.deepEqual(ledger.map(row => row.version), [1, 2, 3])
  assert.equal(applyMigrations(first.database, ordered), 3)
  first.close()
  const second = open(file, ordered)
  assert.equal(second.created, false)
  assert.deepEqual(second.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), ledger)
  assert.deepEqual(second.database.prepare('SELECT * FROM test_values').all(), [{ id: 1, value: 'persisted' }])
})

temporaryTest('migrations upgrade sequentially from a prior schema', ({ open, file }) => {
  open(file).close()
  const storage = open(file, ordered)
  assert.equal(storage.schemaVersion, 3)
  assert.equal(storage.database.prepare('SELECT value FROM test_values').get().value, 'persisted')
})

temporaryTest('failed migration rolls back DDL, DML, ledger and user_version together', ({ open, file }) => {
  const storage = open(file, ordered)
  const failed = [...ordered, { version: 4, name: 'test_fail', sql:
    "CREATE TABLE test_rollback (id INTEGER); INSERT INTO test_values VALUES (2, 'rollback'); INSERT INTO missing_table VALUES (1)" }]
  assert.throws(() => applyMigrations(storage.database, failed), code('MIGRATION_FAILED'))
  assert.equal(storage.database.inTransaction, false)
  assert.equal(storage.database.prepare("SELECT name FROM sqlite_schema WHERE name='test_rollback'").get(), undefined)
  assert.equal(storage.database.prepare('SELECT COUNT(*) AS count FROM test_values').get().count, 1)
  assert.equal(storage.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 3)
  assert.equal(storage.database.pragma('user_version', { simple: true }), 3)
  storage.close()
  assert.equal(open(file, ordered).schemaVersion, 3)
})

temporaryTest('failed startup migration closes connection and retains the preceding committed version', ({ open, file }) => {
  open(file).close()
  const failed = [...migrations, { version: 2, name: 'test_fail', sql: 'CREATE TABLE test_rollback (id); INVALID SQL' }]
  assert.throws(() => open(file, failed), code('MIGRATION_FAILED'))
  assert.equal(open(file).schemaVersion, 1)
})

temporaryTest('newer schema is refused without rewriting the database', ({ open, file }) => {
  open(file, ordered).close()
  const before = readFileSync(file)
  assert.throws(() => open(file), code('UNSUPPORTED_SCHEMA'))
  assert.deepEqual(readFileSync(file), before)
})

temporaryTest('corrupt, empty and truncated existing files are preserved byte-for-byte', ({ open, root }) => {
  const fixtures = [Buffer.alloc(0), Buffer.from('not sqlite'), Buffer.alloc(4096, 0x5a)]
  fixtures.forEach((bytes, index) => {
    const file = join(root, `corrupt-${index}.db`)
    writeFileSync(file, bytes)
    assert.throws(() => open(file), code('CORRUPT'))
    assert.deepEqual(readFileSync(file), bytes)
  })
})

temporaryTest('integrity_check detects damaged SQLite pages behind a valid header', ({ open, file }) => {
  open(file).close()
  const bytes = readFileSync(file)
  // Page 1 b-tree type at offset 100, after the valid database header.
  bytes[100] = 0xff
  writeFileSync(file, bytes)
  assert.throws(() => open(file), code('CORRUPT'))
  assert.deepEqual(readFileSync(file), bytes)
})

temporaryTest('foreign keys are enforced and existing violations prevent startup', ({ open, file }) => {
  const storage = open(file)
  storage.database.exec('CREATE TABLE test_parent(id INTEGER PRIMARY KEY); CREATE TABLE test_child(parent_id INTEGER REFERENCES test_parent(id))')
  assert.throws(() => storage.database.prepare('INSERT INTO test_child VALUES (?)').run(10), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
  storage.database.pragma('foreign_keys = OFF')
  storage.database.exec('INSERT INTO test_child VALUES (10)')
  storage.close()
  const before = readFileSync(file)
  assert.throws(() => open(file), code('CORRUPT'))
  assert.deepEqual(readFileSync(file), before)
})

temporaryTest('dev and built paths are independent and use only the supplied local data root', ({ open, root }) => {
  const dev = storagePath(root, true)
  const built = storagePath(root, false)
  assert.equal(dev, join(root, 'HromadaHR-dev', 'data', 'hromadahr.db'))
  assert.equal(built, join(root, 'HromadaHR', 'data', 'hromadahr.db'))
  assert.notEqual(dev, built)
  open(dev).database.exec('CREATE TABLE test_dev_only(id INTEGER)')
  assert.equal(open(built).database.prepare("SELECT name FROM sqlite_schema WHERE name='test_dev_only'").get(), undefined)
  for (const value of [undefined, '', 'relative']) assert.throws(() => storagePath(value, true), code('FILESYSTEM'))
})

temporaryTest('connection closes idempotently, releases handles and duplicate-open guard', ({ open, file }) => {
  const storage = open(file)
  assert.throws(() => open(file), code('BUSY'))
  storage.close()
  storage.close()
  assert.equal(storage.database.open, false)
  assert.throws(() => storage.database.prepare('SELECT 1'))
  renameSync(file, `${file}.moved`)
  renameSync(`${file}.moved`, file)
  assert.equal(open(file).created, false)
  storage.close() // An old owner must not release the new owner's guard.
  assert.throws(() => open(file), code('BUSY'))
})

temporaryTest('unknown schemas and edited migration checksums fail closed without table deletion', ({ open, file, root }) => {
  const unknown = join(root, 'unknown.db')
  const external = new Database(unknown)
  try { external.exec('CREATE TABLE test_unknown(id INTEGER)') } finally { external.close() }
  const before = readFileSync(unknown)
  assert.throws(() => open(unknown), code('UNSUPPORTED_SCHEMA'))
  assert.deepEqual(readFileSync(unknown), before)
  open(file).close()
  const edited = [{ ...migrations[0], sql: migrations[0].sql + ';' }]
  assert.throws(() => open(file, edited), code('UNSUPPORTED_SCHEMA'))
})

temporaryTest('ledger gaps, mismatched user_version and unknown migration IDs are rejected', ({ open, root }) => {
  for (const [index, sql] of [
    'DELETE FROM schema_migrations WHERE version=2',
    'PRAGMA user_version=2',
    'UPDATE schema_migrations SET version=9 WHERE version=3',
  ].entries()) {
    const file = join(root, `ledger-${index}.db`)
    const storage = open(file, ordered)
    storage.database.exec(sql)
    storage.close()
    assert.throws(() => open(file, ordered), code('UNSUPPORTED_SCHEMA'))
  }
})

temporaryTest('critical migrations require a protective-copy implementation and cannot proceed silently', ({ open }) => {
  const storage = open()
  assert.throws(() => applyMigrations(storage.database, [...migrations, {
    version: 2, name: 'test_critical', requiresBackup: true, sql: 'CREATE TABLE test_critical(id INTEGER)',
  }]), code('BACKUP_REQUIRED'))
  assert.equal(storage.database.pragma('user_version', { simple: true }), 1)
  assert.equal(storage.database.prepare("SELECT name FROM sqlite_schema WHERE name='test_critical'").get(), undefined)
})

temporaryTest('filesystem failures become explicit status and do not replace existing objects', ({ root }) => {
  const file = join(root, 'directory.db')
  mkdirSync(file)
  const storage = new Storage()
  storage.initialize(() => file)
  assert.deepEqual(storage.getStatus(), { state: 'error', code: 'FILESYSTEM' })
  assert.equal(existsSync(file), true)
  const blocker = join(root, 'blocker')
  writeFileSync(blocker, 'preserve')
  const inaccessible = new Storage()
  inaccessible.initialize(() => join(blocker, 'test.db'))
  assert.deepEqual(inaccessible.getStatus(), { state: 'error', code: 'FILESYSTEM' })
  assert.equal(readFileSync(blocker, 'utf8'), 'preserve')
})

temporaryTest('storage owner initializes once, reports sanitized failures and closes cleanly', ({ file, root }) => {
  const storage = new Storage()
  assert.deepEqual(storage.getStatus(), { state: 'initializing' })
  try {
    storage.initialize(() => file)
    assert.deepEqual(storage.getStatus(), { state: 'ready', created: true, schemaVersion: 1 })
    storage.initialize(() => { throw new Error('must not initialize twice') })
    assert.equal(storage.getStatus().state, 'ready')
  } finally { storage.close() }
  assert.deepEqual(storage.getStatus(), { state: 'closed' })
  const broken = join(root, 'broken.db')
  writeFileSync(broken, 'broken')
  const failed = new Storage()
  failed.initialize(() => broken)
  assert.deepEqual(failed.getStatus(), { state: 'error', code: 'CORRUPT' })
})
