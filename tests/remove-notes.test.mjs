import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { openStorageSafely, Storage } from '../dist-electron/electron/storage/index.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-remove-notes-'))
  const file = join(root, 'data', 'app.db')
  const handles = []
  t.after(() => { for (const handle of handles) handle.close(); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-remove-notes-')); rmSync(root, { recursive: true, force: true }) })
  const legacy = await openStorageSafely(file, migrations.slice(0, 3))
  handles.push(legacy)
  const ids = { employee: randomUUID(), department: randomUUID(), position: randomUUID(), assignment: randomUUID() }
  legacy.database.prepare('INSERT INTO departments VALUES (?, ?, ?)').run(ids.department, 'Умовний відділ', 'умовний відділ')
  legacy.database.prepare('INSERT INTO positions VALUES (?, ?, ?)').run(ids.position, 'Умовна посада', 'умовна посада')
  legacy.database.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?)').run(ids.employee, 'Синтетичний', 'Приклад', 'Умовний', '2000-02-29', 'official', 'Стара тестова примітка')
  legacy.database.prepare('INSERT INTO employee_positions VALUES (?, ?, ?, ?, ?, ?)').run(ids.assignment, ids.employee, ids.department, ids.position, 'Історична категорія', '2024-02-29')
  const ledger = legacy.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
  legacy.close()
  return { root, file, handles, ids, ledger }
}
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const integrity = db => { assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); assert.deepEqual(db.pragma('foreign_key_check'), []) }

test('v3 → v4 removes only note atomically, preserves all personnel/FK/STRICT/ledger, and verifies the v3 protective copy', async t => {
  const f = await fixture(t)
  assert.equal(migrations[3].requiresBackup, true)
  assert.equal(migrations[3].sql, 'ALTER TABLE employees DROP COLUMN note')
  const current = await openStorageSafely(f.file)
  f.handles.push(current)
  const db = current.database
  assert.equal(current.schemaVersion, 4)
  assert.deepEqual(db.pragma('table_info(employees)').map(row => row.name), ['id', 'last_name', 'first_name', 'middle_name', 'birth_date', 'employee_type'])
  assert.equal(db.pragma('table_list').find(row => row.name === 'employees').strict, 1)
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=3 ORDER BY version').all(), f.ledger)
  const service = new PersonnelService({ getDatabase: () => db }, () => false)
  const employee = service.getEmployee(f.ids.employee)
  assert.deepEqual(employee, { id: f.ids.employee, lastName: 'Синтетичний', firstName: 'Приклад', middleName: 'Умовний', birthDate: '2000-02-29', employeeType: 'official', hireDate: '2024-02-29',
    currentAssignment: { id: f.ids.assignment, employeeId: f.ids.employee, departmentId: f.ids.department, positionId: f.ids.position, category: 'Історична категорія', startDate: '2024-02-29',
      department: { id: f.ids.department, name: 'Умовний відділ' }, position: { id: f.ids.position, name: 'Умовна посада' } } })
  integrity(db)
  const copy = join(f.root, 'data', 'protection', readdirSync(join(f.root, 'data', 'protection')).find(name => name.includes('protect-migration-v4-')))
  assert.equal(inspectDatabase(copy), 3)
  const snapshot = new Database(copy, { readonly: true })
  try { assert.equal(snapshot.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка'); integrity(snapshot) } finally { snapshot.close() }
  const before = hash(copy)
  service.deleteEmployee(employee.id)
  assert.throws(() => service.getHistory(employee.id), error => error.code === 'NOT_FOUND')
  assert.equal(db.prepare('SELECT count(*) n FROM employee_positions').get().n, 0)
  assert.equal(hash(copy), before)
  integrity(db)
})

test('v4 cannot remove notes if verified protection fails; SQL failure after DROP rolls back the complete schema', async t => {
  const f = await fixture(t)
  const protection = join(f.root, 'data', 'protection')
  renameSync(protection, join(f.root, 'data', 'saved-protection'))
  writeFileSync(protection, 'blocked')
  await assert.rejects(openStorageSafely(f.file))
  let db = new Database(f.file, { readonly: true })
  try { assert.equal(db.pragma('user_version', { simple: true }), 3); assert.equal(db.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка'); integrity(db) } finally { db.close() }
  rmSync(protection)
  const failing = [...migrations.slice(0, 3), { ...migrations[3], sql: migrations[3].sql + '; INVALID SQL' }]
  await assert.rejects(openStorageSafely(f.file, failing), error => error.code === 'MIGRATION_FAILED')
  db = new Database(f.file, { readonly: true })
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 3)
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), f.ledger)
    assert.equal(db.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка')
    assert.equal(db.prepare('SELECT category FROM employee_positions').get().category, 'Історична категорія')
    integrity(db)
  } finally { db.close() }
})

test('restoring a compatible v3 copy migrates to v4 while retaining the original note in the untouched source', async t => {
  const f = await fixture(t)
  const before = hash(f.file)
  const storage = new Storage()
  const target = join(f.root, 'target', 'active.db')
  await storage.initializeSafely(() => target)
  const backup = new BackupService(storage)
  f.handles.push({ close: () => { backup.stop(); storage.close() } })
  const selection = await backup.chooseRestore(async () => f.file)
  assert.equal(selection.schemaVersion, 3)
  assert.deepEqual(await backup.confirmRestore(selection.token, async () => true), { restored: true })
  const db = storage.getDatabase()
  assert.equal(storage.getStatus().schemaVersion, 4)
  assert.equal(db.pragma('table_info(employees)').some(row => row.name === 'note'), false)
  assert.equal(db.prepare('SELECT category FROM employee_positions').get().category, 'Історична категорія')
  assert.equal(hash(f.file), before)
  const source = new Database(f.file, { readonly: true })
  try { assert.equal(source.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка') } finally { source.close() }
  integrity(db)
  backup.stop(); storage.close()
})
