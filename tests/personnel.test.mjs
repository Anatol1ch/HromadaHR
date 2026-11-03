import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { openStorage, openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { nameKey } from '../dist-electron/electron/personnel/schemas.js'

async function fixture(t, legacy = false) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-personnel-'))
  const file = join(root, 'data', 'test.db')
  let connection
  t.after(() => { connection?.close(); rmSync(root, { recursive: true, force: true }) })
  let previousLedger
  if (legacy) {
    const previous = openStorage(file, migrations.slice(0, 2))
    previous.database.prepare('INSERT INTO backup_config(id, instance_id, folder1) VALUES (1, ?, ?)').run(randomUUID(), 'saved-folder')
    previousLedger = previous.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
    previous.close()
  }
  connection = await openStorageSafely(file)
  let busy = false
  const service = new PersonnelService({ getDatabase: () => connection.database }, () => busy)
  const department = service.createDepartment({ name: 'Відділ' })
  const position = service.createPosition({ name: 'Спеціаліст' })
  const input = { lastName: 'Тестовий', firstName: 'Тест', middleName: null, birthDate: '2000-02-29',
    startDate: '2026-01-01', employeeType: 'official', category: null, departmentId: department.id, positionId: position.id }
  return { root, file, db: connection.database, service, input, previousLedger, setBusy: value => { busy = value } }
}
const code = expected => error => error.code === expected
const details = input => {
  const { positionId, departmentId, startDate, category, ...result } = input
  return result
}

test('migration 1–2 names and checksums remain the original published values', () => {
  assert.deepEqual(migrations.slice(0, 2).map(m => [m.version, m.name, createHash('sha256').update(m.name + '\n' + m.sql).digest('hex')]), [
    [1, 'create_schema_migrations', '036a71f598fd2dda448ee6e82cf561ffde47bb64af6e5491455e130085df7d80'],
    [2, 'backup_configuration', '54b8316b87116a7cac831f41bdb5768b3560bb9b91df2f9a601d6de6674fd368'],
  ])
  assert.equal(migrations[2].requiresBackup, true)
})

test('new and v2 databases upgrade to v4 with verified pre-v3/pre-v4 snapshots and preserve ledger/config', async t => {
  for (const legacy of [false, true]) {
    const f = await fixture(t, legacy)
    assert.equal(f.db.pragma('user_version', { simple: true }), 4)
    assert.deepEqual(f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(r => r.name),
      ['backup_config', 'backup_state', 'departments', 'employee_positions', 'employees', 'positions', 'schema_migrations'])
    const protection = join(f.root, 'data', 'protection')
    const copies = readdirSync(protection)
    assert.equal(copies.length, 2)
    assert.deepEqual(copies.map(name => inspectDatabase(join(protection, name))).sort(), [2, 3])
    assert.equal(inspectDatabase(join(protection, copies.find(name => inspectDatabase(join(protection, name)) === 2))), 2)
    const snapshot = new Database(join(protection, copies[0]), { readonly: true })
    try { assert.equal(snapshot.prepare("SELECT name FROM sqlite_schema WHERE name='employees'").get(), undefined) }
    finally { snapshot.close() }
    if (legacy) {
      assert.deepEqual(f.db.prepare('SELECT * FROM schema_migrations WHERE version<=2 ORDER BY version').all(), f.previousLedger)
      assert.equal(f.db.prepare('SELECT folder1 FROM backup_config').get().folder1, 'saved-folder')
    }
    assert.equal(f.db.pragma('integrity_check', { simple: true }), 'ok')
    assert.deepEqual(f.db.pragma('foreign_key_check'), [])
  }
})

test('critical v3 cannot execute through the synchronous API or without its protective snapshot', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-personnel-protection-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'test.db')
  openStorage(file, migrations.slice(0, 2)).close()
  assert.throws(() => openStorage(file), code('BACKUP_REQUIRED'))
  writeFileSync(join(root, 'protection'), 'blocked')
  await assert.rejects(openStorageSafely(file))
  const previous = openStorage(file, migrations.slice(0, 2))
  try {
    assert.equal(previous.schemaVersion, 2)
    assert.equal(previous.database.prepare("SELECT name FROM sqlite_schema WHERE name='employees'").get(), undefined)
  } finally { previous.close() }
})

test('create/list/card/update derive first date and latest assignment solely from ordered history', async t => {
  const { service, input, db } = await fixture(t)
  const employee = service.createEmployee(input)
  assert.equal(employee.hireDate, input.startDate)
  assert.equal(employee.currentAssignment.position.id, input.positionId)
  assert.equal(employee.middleName, null)
  assert.deepEqual(service.listEmployees(), [employee])
  const before = service.getHistory(employee.id)
  assert.equal(before.length, 1)
  assert.equal(service.updateEmployee(employee.id, { ...details(input), middleName: 'Тестович', employeeType: 'staff' }).employeeType, 'staff')
  assert.deepEqual(service.getHistory(employee.id), before)
  const position = service.createPosition({ name: 'Інша посада' })
  const insert = db.prepare('INSERT INTO employee_positions(id, employee_id, department_id, position_id, category, start_date) VALUES (?, ?, ?, ?, ?, ?)')
  // Fixture SQL only: no public service/IPC for later assignments in 3.1.
  insert.run(randomUUID(), employee.id, input.departmentId, position.id, 'Категорія', '2030-03-01')
  insert.run(randomUUID(), employee.id, input.departmentId, input.positionId, null, '2025-12-01')
  const card = service.getEmployee(employee.id)
  assert.equal(card.hireDate, '2025-12-01')
  assert.equal(card.currentAssignment.startDate, '2030-03-01') // latest, regardless of today
  assert.equal(card.currentAssignment.category, 'Категорія')
  assert.equal(card.currentAssignment.position.id, position.id)
  assert.deepEqual(service.getHistory(employee.id).map(a => a.startDate), ['2025-12-01', '2026-01-01', '2030-03-01'])
  assert.throws(() => service.updateEmployee(employee.id, { ...details(input), birthDate: '2026-01-01' }), code('INVALID_ARGUMENTS'))
  for (const [table, forbidden] of [['employees', ['hire_date', 'position_id', 'department_id']], ['positions', ['category']], ['employee_positions', ['end_date']]]) {
    const columns = db.pragma('table_info(' + table + ')').map(c => c.name)
    for (const column of forbidden) assert.equal(columns.includes(column), false)
  }
})

test('required fields, employee enum and real calendar dates reject invalid payloads before SQL', async t => {
  const { service, input } = await fixture(t)
  for (const change of [{ lastName: ' ' }, { firstName: '' }, { middleName: '' }, { employeeType: 'other' },
    { birthDate: '1900-02-29' }, { birthDate: '2001-02-29' }, { startDate: '2026-04-31' },
    { startDate: '0000-01-01' }, { startDate: '2026-1-01' }, { birthDate: '2027-01-01' },
    { startDate: '2026-13-01' }, { startDate: null }, { sql: 'DELETE' }, { departmentId: 'x' }]) {
    assert.throws(() => service.createEmployee({ ...input, ...change }), code('INVALID_ARGUMENTS'))
  }
  for (const field of Object.keys(input)) {
    const missing = { ...input }; delete missing[field]
    assert.throws(() => service.createEmployee(missing), code('INVALID_ARGUMENTS'))
  }
  assert.deepEqual(service.listEmployees(), [])
  const employee = service.createEmployee({ ...input, birthDate: null, employeeType: 'staff' })
  assert.equal(employee.birthDate, null)
  assert.throws(() => service.updateEmployee(employee.id, { ...details(input), birthDate: '2026-02-30' }), code('INVALID_ARGUMENTS'))
  assert.equal(service.getEmployee(employee.id).birthDate, null)
})

test('failure inserting initial assignment rolls back the employee; missing dictionary references are rejected', async t => {
  const { service, db, input } = await fixture(t)
  for (const change of [{ positionId: randomUUID() }, { departmentId: randomUUID() }]) {
    assert.throws(() => service.createEmployee({ ...input, ...change }), code('NOT_FOUND'))
  }
  db.exec("CREATE TRIGGER test_fail BEFORE INSERT ON employee_positions BEGIN SELECT RAISE(ABORT, 'injected'); END")
  assert.throws(() => service.createEmployee(input), code('CONFLICT'))
  assert.equal(db.prepare('SELECT count(*) n FROM employees').get().n, 0)
  assert.equal(db.prepare('SELECT count(*) n FROM employee_positions').get().n, 0)
})

test('SQL enforces STRICT, FK, unique employee/date, required fields and cascading history deletion', async t => {
  const { service, db, input } = await fixture(t)
  const employee = service.createEmployee(input)
  const insert = (employeeId, departmentId, positionId, date) => db.prepare('INSERT INTO employee_positions VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), employeeId, departmentId, positionId, null, date)
  assert.throws(() => insert(employee.id, input.departmentId, input.positionId, input.startDate), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
  assert.throws(() => insert(randomUUID(), input.departmentId, input.positionId, '2026-02-01'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
  assert.throws(() => insert(employee.id, randomUUID(), input.positionId, '2026-02-01'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
  assert.throws(() => insert(employee.id, input.departmentId, randomUUID(), '2026-02-01'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
  for (const date of ['2026-02-30', '2026-04-31', '0000-01-01']) assert.throws(() => insert(employee.id, input.departmentId, input.positionId, date))
  assert.throws(() => db.prepare('UPDATE employees SET employee_type=? WHERE id=?').run('other', employee.id))
  assert.throws(() => db.prepare('UPDATE employees SET last_name=NULL WHERE id=?').run(employee.id))
  assert.throws(() => db.prepare('UPDATE employees SET first_name=? WHERE id=?').run(' ', employee.id))
  assert.throws(() => db.prepare('UPDATE employees SET first_name=? WHERE id=?').run(Buffer.from('x'), employee.id), { code: 'SQLITE_CONSTRAINT_DATATYPE' })
  assert.throws(() => db.prepare('DELETE FROM positions WHERE id=?').run(input.positionId))
  assert.throws(() => db.prepare('DELETE FROM departments WHERE id=?').run(input.departmentId))
  insert(employee.id, input.departmentId, input.positionId, '2026-02-01')
  db.prepare('DELETE FROM employees WHERE id=?').run(employee.id) // schema readiness only, not exposed
  assert.equal(db.prepare('SELECT count(*) n FROM employee_positions').get().n, 0)
  assert.equal(service.listPositions().length, 1)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

test('dictionary names normalize Unicode, whitespace and case; UNIQUE guards persisted keys', async t => {
  const { service, db } = await fixture(t)
  for (const [create, list, table] of [['createDepartment', 'listDepartments', 'departments'], ['createPosition', 'listPositions', 'positions']]) {
    const value = service[create]({ name: '  ВІДДІЛ\t  КАДРІВ\u00a0' })
    assert.equal(value.name, 'ВІДДІЛ КАДРІВ')
    for (const name of ['відділ кадрів', 'Відділ   кадрів', 'ВІДДІЛ\nКАДРІВ']) assert.throws(() => service[create]({ name }), code('CONFLICT'))
    service[create]({ name: 'ЙОГО' })
    assert.throws(() => service[create]({ name: 'И\u0306ОГО' }), code('CONFLICT'))
    service[create]({ name: 'Straße' })
    assert.throws(() => service[create]({ name: 'STRASSE' }), code('CONFLICT'))
    assert.throws(() => service[create]({ name: '\t\u00a0' }), code('INVALID_ARGUMENTS'))
    assert.throws(() => db.prepare('INSERT INTO ' + table + ' VALUES (?, ?, ?)').run(randomUUID(), 'Інша назва', nameKey(value.name)), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
    assert.equal(service[list]().filter(row => row.name === value.name).length, 1)
  }
})

test('personnel respects backup/restore busy state, unavailable storage and not-found results', async t => {
  const { service, setBusy, input } = await fixture(t)
  setBusy(true)
  assert.throws(() => service.createEmployee(input), code('BUSY'))
  assert.throws(() => service.listEmployees(), code('BUSY'))
  setBusy(false)
  for (const method of ['getEmployee', 'getHistory']) assert.throws(() => service[method](randomUUID()), code('NOT_FOUND'))
  assert.throws(() => service.updateEmployee(randomUUID(), details(input)), code('NOT_FOUND'))
  const unavailable = new PersonnelService({ getDatabase() { throw new Error('private path') } }, () => false)
  assert.throws(() => unavailable.listEmployees(), code('STORAGE_UNAVAILABLE'))
})
