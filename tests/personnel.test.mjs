import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { openStorageSafely, Storage } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'

const v4 = migrations.slice(0, 4)
const checksum = (value) => createHash('sha256').update(value).digest('hex')
const hasCode = code => error => error.code === code
const tables = db => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row => row.name)
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
function integrity(db) {
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  assert.deepEqual(db.pragma('foreign_key_check'), [])
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hr-personnel-v5-'))
  const handles = []
  t.after(() => {
    for (const handle of handles.reverse()) handle.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-personnel-v5-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })
  const file = join(root, 'data', 'app.db')
  return { root, file, handles, async open(manifest) {
    const handle = await openStorageSafely(file, manifest)
    handles.push(handle)
    return handle
  } }
}

async function legacy(f) {
  const connection = await f.open(v4)
  const db = connection.database
  const ids = { employee: randomUUID(), department: randomUUID(), position: randomUUID(), instance: randomUUID() }
  db.prepare('INSERT INTO departments VALUES (?, ?, ?)').run(ids.department, 'Відділ', 'відділ')
  db.prepare('INSERT INTO positions VALUES (?, ?, ?)').run(ids.position, 'Посада', 'посада')
  db.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)').run(ids.employee, 'Тест', 'Приклад', null, null, 'staff')
  db.prepare('INSERT INTO employee_positions VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), ids.employee, ids.department, ids.position, 'II', '2025-01-01')
  db.prepare('INSERT INTO backup_config VALUES (1, ?, ?, ?)').run(ids.instance, join(f.root, 'one'), join(f.root, 'two'))
  db.exec("UPDATE backup_state SET auto_day='2025-01-01', attempt_count=2 WHERE slot=1")
  const before = { ledger: ledger(db), config: db.prepare('SELECT * FROM backup_config').all(), state: db.prepare('SELECT * FROM backup_state').all() }
  connection.close()
  return { ids, before }
}

test('published migration names and checksums 1–5 are immutable', () => {
  assert.deepEqual(migrations.slice(0, 5).map(m => [m.version, m.name, checksum(m.name + '\n' + m.sql)]), [
    [1, 'create_schema_migrations', '036a71f598fd2dda448ee6e82cf561ffde47bb64af6e5491455e130085df7d80'],
    [2, 'backup_configuration', '54b8316b87116a7cac831f41bdb5768b3560bb9b91df2f9a601d6de6674fd368'],
    [3, 'personnel_foundation', '2b9225e9791caab6a06563c0da2a76ba783c8fd2bc655139df68e0a449d4865c'],
    [4, 'remove_employee_note', '67898bbdf6d4637b0af44c0e4def23bced884633c6628493a8995cd3cec3cc3c'],
    [5, 'simplify_personnel', '157f5b03d5cde59b82175e3ce5caa96b116cdb74a3c76ae4d5b1b57b427647ed'],
  ])
})

test('v4 → v6 preserves directories and service tables and protects the original test personnel', async t => {
  const f = fixture(t)
  const { ids, before } = await legacy(f)
  assert.equal(migrations[4].requiresBackup, true)
  const current = await f.open()
  const db = current.database
  assert.equal(current.schemaVersion, 6)
  assert.deepEqual(tables(db), ['backup_config', 'backup_state', 'departments', 'employees', 'leave_period_balances', 'positions', 'schema_migrations'])
  assert.deepEqual(db.pragma('table_info(employees)').map(column => column.name),
    ['id', 'last_name', 'first_name', 'middle_name', 'birth_date', 'employee_type', 'hire_date', 'position_id', 'department_id'])
  assert.equal(db.pragma('table_list').find(row => row.name === 'employees').strict, 1)
  assert.deepEqual(ledger(db).slice(0, 4), before.ledger)
  assert.deepEqual(db.prepare('SELECT * FROM backup_config').all(), before.config)
  assert.deepEqual(db.prepare('SELECT * FROM backup_state').all(), before.state)
  assert.equal(db.prepare('SELECT count(*) AS n FROM employees').get().n, 0)
  assert.equal(db.prepare('SELECT id FROM departments').get().id, ids.department)
  assert.equal(db.prepare('SELECT id FROM positions').get().id, ids.position)
  integrity(db)
  const folder = join(f.root, 'data', 'protection')
  const copy = join(folder, readdirSync(folder).find(name => name.includes('protect-migration-v5-')))
  assert.equal(inspectDatabase(copy), 4)
  const saved = new Database(copy, { readonly: true })
  try {
    assert.equal(saved.prepare('SELECT id FROM employees').get().id, ids.employee)
    assert.equal(saved.prepare('SELECT employee_id FROM employee_positions').get().employee_id, ids.employee)
    integrity(saved)
  } finally { saved.close() }
})

test('v5 refuses to run without protection and rolls back destructive SQL on failure', async t => {
  const f = fixture(t)
  const { ids, before } = await legacy(f)
  const folder = join(f.root, 'data', 'protection')
  renameSync(folder, folder + '-saved')
  writeFileSync(folder, 'blocked')
  await assert.rejects(f.open())
  function assertLegacy() {
    const db = new Database(f.file, { readonly: true })
    try {
      assert.deepEqual(ledger(db), before.ledger)
      assert.equal(db.pragma('user_version', { simple: true }), 4)
      assert.equal(db.prepare('SELECT id FROM employees').get().id, ids.employee)
      assert.equal(db.prepare('SELECT employee_id FROM employee_positions').get().employee_id, ids.employee)
      integrity(db)
    } finally { db.close() }
  }
  assertLegacy()
  rmSync(folder)
  const broken = [...v4, { ...migrations[4], sql: migrations[4].sql + ' INSERT INTO missing_table VALUES (1);' }]
  await assert.rejects(f.open(broken), hasCode('MIGRATION_FAILED'))
  assertLegacy()
})

test('fresh v6 validates and updates the current employee atomically with an independent hire date', async t => {
  const f = fixture(t)
  const connection = await f.open()
  assert.equal(connection.created, true)
  assert.equal(connection.schemaVersion, 6)
  const db = connection.database
  const service = new PersonnelService({ getDatabase: () => db }, () => false)
  assert.deepEqual(service.listEmployees(), [])
  const department = service.createDepartment({ name: '  Відділ  кадрів  ' })
  const position = service.createPosition({ name: 'Посада' })
  assert.throws(() => service.createDepartment({ name: 'ВІДДІЛ кадрів' }), hasCode('CONFLICT'))
  const input = { lastName: 'Тест', firstName: 'Приклад', middleName: null, birthDate: '2000-02-29',
    employeeType: 'staff', hireDate: '2024-02-29', positionId: position.id, departmentId: department.id }
  for (const change of [{ firstName: ' ' }, { hireDate: undefined }, { hireDate: '2025-02-29' },
    { birthDate: '0000-01-01' }, { hireDate: '1999-12-31' }, { category: null }]) {
    assert.throws(() => service.createEmployee({ ...input, ...change }), hasCode('INVALID_ARGUMENTS'))
  }
  assert.throws(() => service.createEmployee({ ...input, positionId: randomUUID() }), hasCode('NOT_FOUND'))
  const card = service.createEmployee(input)
  assert.deepEqual(card, { ...input, id: card.id, position, department })
  const nextPosition = service.createPosition({ name: 'Нова посада' })
  const nextDepartment = service.createDepartment({ name: 'Новий відділ' })
  const changed = { ...input, positionId: nextPosition.id, departmentId: nextDepartment.id }
  assert.equal(service.updateEmployee(card.id, changed).hireDate, input.hireDate)
  const final = service.updateEmployee(card.id, { ...changed, hireDate: '2025-03-01' })
  assert.deepEqual(final, { ...changed, hireDate: '2025-03-01', id: card.id, position: nextPosition, department: nextDepartment })
  assert.throws(() => service.updateEmployee(card.id, { ...changed, departmentId: randomUUID() }), hasCode('NOT_FOUND'))
  assert.deepEqual(service.listEmployees(), [final])
  assert.throws(() => db.prepare('UPDATE employees SET hire_date=? WHERE id=?').run('2025-02-29', card.id), /CHECK constraint/)
  assert.throws(() => db.prepare('UPDATE employees SET department_id=? WHERE id=?').run(randomUUID(), card.id), /FOREIGN KEY/)
  assert.throws(() => db.prepare('DELETE FROM positions WHERE id=?').run(nextPosition.id), /FOREIGN KEY/)
  service.deleteEmployee(card.id)
  assert.throws(() => service.getEmployee(card.id), hasCode('NOT_FOUND'))
  assert.equal(service.listPositions().length, 2)
  assert.equal(service.listDepartments().length, 2)
  assert.equal(tables(db).includes('employee_positions'), false)
  integrity(db)
})

test('restoring a v4 test image applies v6 without altering the source image', async t => {
  const f = fixture(t)
  const { ids } = await legacy(f)
  const before = checksum(readFileSync(f.file))
  const storage = new Storage()
  const backup = new BackupService(storage)
  f.handles.push({ close: () => { backup.stop(); backup.invalidateSelections(); storage.close() } })
  await storage.initializeSafely(() => join(f.root, 'restore', 'active.db'))
  assert.equal(storage.getStatus().state, 'ready')
  const selected = await backup.chooseRestore(async () => f.file)
  assert.equal(selected.schemaVersion, 4)
  assert.deepEqual(await backup.confirmRestore(selected.token, async () => true), { restored: true })
  assert.equal(storage.getStatus().schemaVersion, 6)
  const db = storage.getDatabase()
  assert.equal(db.prepare('SELECT count(*) AS n FROM employees').get().n, 0)
  assert.equal(tables(db).includes('employee_positions'), false)
  assert.equal(db.prepare('SELECT id FROM departments').get().id, ids.department)
  assert.equal(db.prepare('SELECT id FROM positions').get().id, ids.position)
  assert.equal(checksum(readFileSync(f.file)), before)
  integrity(db)
})
