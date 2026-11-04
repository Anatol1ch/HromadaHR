import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'

const code = expected => error => error.code === expected
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-history-'))
  let connection
  t.after(() => { connection?.close(); rmSync(root, { recursive: true, force: true }) })
  connection = await openStorageSafely(join(root, 'test.db'))
  const db = connection.database
  let busy = false
  const service = new PersonnelService({ getDatabase: () => db }, () => busy, () => '2026-11-02')
  const department = service.createDepartment({ name: 'Тестовий відділ' })
  const otherDepartment = service.createDepartment({ name: 'Інший тестовий відділ' })
  const position = service.createPosition({ name: 'Тестова посада' })
  const otherPosition = service.createPosition({ name: 'Інша тестова посада' })
  const input = { lastName: 'Тестовий', firstName: 'Умовний', middleName: null, birthDate: '2000-01-01', employeeType: 'official',
    positionId: position.id, departmentId: department.id, category: null, startDate: '2026-01-01' }
  const employee = service.createEmployee(input)
  const first = service.getHistory(employee.id)[0]
  const assignment = { departmentId: department.id, positionId: position.id, category: null, startDate: '2026-02-01' }
  const snapshot = () => ['employees', 'employee_positions', 'departments', 'positions'].map(table => db.prepare('SELECT * FROM ' + table + ' ORDER BY id').all())
  function integrity() {
    assert.equal(db.inTransaction, false)
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  }
  function reject(operation, expected) {
    const before = snapshot()
    assert.throws(operation, code(expected))
    assert.deepEqual(snapshot(), before)
    integrity()
  }
  return { db, service, employee, input, first, assignment, department, otherDepartment, position, otherPosition, reject, integrity, setBusy: value => { busy = value } }
}

test('add current and backdated changes; first/last history drive hire date and current assignment', async t => {
  const f = await fixture(t)
  const current = f.service.createAssignment(f.employee.id, { ...f.assignment, positionId: f.otherPosition.id, startDate: '2026-06-01' })
  assert.equal(current.currentAssignment.positionId, f.otherPosition.id)
  f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Історична', startDate: '2026-03-01' })
  const earlier = f.service.createAssignment(f.employee.id, { ...f.assignment, departmentId: f.otherDepartment.id, startDate: '2025-12-01' })
  assert.equal(earlier.hireDate, '2025-12-01')
  assert.equal(earlier.currentAssignment.positionId, f.otherPosition.id)
  assert.deepEqual(f.service.getHistory(f.employee.id).map(row => row.startDate), ['2025-12-01', '2026-01-01', '2026-03-01', '2026-06-01'])
  assert.deepEqual(f.service.listEmployees(), [earlier]); f.integrity()
})

test('correct first and intermediate records, including moving the first date and reordering', async t => {
  const f = await fixture(t)
  f.service.createAssignment(f.employee.id, { ...f.assignment, positionId: f.otherPosition.id, startDate: '2026-06-01' })
  f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Проміжна', startDate: '2026-03-01' })
  const firstChanged = f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: '2025-01-01' })
  assert.equal(firstChanged.hireDate, '2025-01-01')
  const middle = f.service.getHistory(f.employee.id)[1]
  f.service.updateAssignment(middle.id, { ...f.assignment, departmentId: f.otherDepartment.id, category: ' Виправлена ', startDate: '2026-04-01' })
  assert.equal(f.service.getHistory(f.employee.id)[1].category, 'Виправлена')
  const reordered = f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: '2026-05-01' })
  assert.equal(reordered.hireDate, '2026-04-01')
  assert.equal(reordered.currentAssignment.startDate, '2026-06-01'); f.integrity()
})

test('duplicate dates, malformed/future/before-birth dates and missing references never change the database', async t => {
  const f = await fixture(t)
  f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Інша', startDate: f.first.startDate }), 'DUPLICATE_ASSIGNMENT_DATE')
  for (const date of ['2026-02-30', '2026-04-31', '0000-01-01', '2026-1-01', 'bad']) {
    f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, startDate: date }), 'INVALID_ARGUMENTS')
    f.reject(() => f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: date }), 'INVALID_ARGUMENTS')
  }
  for (const date of ['2026-11-03', '2030-01-01']) {
    f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, startDate: date }), 'FUTURE_ASSIGNMENT')
    f.reject(() => f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: date }), 'FUTURE_ASSIGNMENT')
  }
  f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, startDate: '1999-12-31' }), 'ASSIGNMENT_BEFORE_BIRTH')
  f.reject(() => f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: '1999-12-31' }), 'ASSIGNMENT_BEFORE_BIRTH')
  for (const change of [{ departmentId: randomUUID() }, { positionId: randomUUID() }]) {
    f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, ...change }), 'NOT_FOUND')
    f.reject(() => f.service.updateAssignment(f.first.id, { ...f.assignment, ...change }), 'NOT_FOUND')
  }
  f.reject(() => f.service.createAssignment(randomUUID(), f.assignment), 'NOT_FOUND')
  f.reject(() => f.service.updateAssignment(randomUUID(), f.assignment), 'NOT_FOUND')
  f.reject(() => f.service.deleteAssignment(randomUUID()), 'NOT_FOUND')
  f.reject(() => f.service.deleteEmployee(randomUUID()), 'NOT_FOUND')
})

test('reject adjacent no-change records on either side and revalidate edits/deletion bridges atomically', async t => {
  const f = await fixture(t)
  f.reject(() => f.service.createAssignment(f.employee.id, f.assignment), 'NO_ASSIGNMENT_CHANGE')
  f.service.createAssignment(f.employee.id, { ...f.assignment, positionId: f.otherPosition.id, startDate: '2026-06-01' })
  // Different from predecessor but equal to successor.
  f.reject(() => f.service.createAssignment(f.employee.id, { ...f.assignment, positionId: f.otherPosition.id, startDate: '2026-03-01' }), 'NO_ASSIGNMENT_CHANGE')
  f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Проміжна', startDate: '2026-03-01' })
  const middle = f.service.getHistory(f.employee.id)[1]
  f.reject(() => f.service.updateAssignment(middle.id, { ...f.assignment, startDate: middle.startDate }), 'NO_ASSIGNMENT_CHANGE')
  f.reject(() => f.service.updateAssignment(middle.id, { ...f.assignment, positionId: f.otherPosition.id, startDate: middle.startDate }), 'NO_ASSIGNMENT_CHANGE')
  f.reject(() => f.service.updateAssignment(middle.id, { ...f.assignment, category: 'Проміжна', startDate: '2026-06-01' }), 'DUPLICATE_ASSIGNMENT_DATE')
  // A → B → A: deletion of B must not leave A → A.
  f.service.updateAssignment(f.service.getHistory(f.employee.id)[2].id, { ...f.assignment, startDate: '2026-06-01' })
  f.reject(() => f.service.deleteAssignment(middle.id), 'NO_ASSIGNMENT_CHANGE')
})

test('delete individual first/current assignments, retain one row and protect the last assignment', async t => {
  const f = await fixture(t)
  f.reject(() => f.service.deleteAssignment(f.first.id), 'LAST_ASSIGNMENT')
  f.service.createAssignment(f.employee.id, { ...f.assignment, positionId: f.otherPosition.id })
  const after = f.service.deleteAssignment(f.first.id)
  assert.equal(after.hireDate, '2026-02-01')
  const last = f.service.getHistory(f.employee.id)[0]
  f.reject(() => f.service.deleteAssignment(last.id), 'LAST_ASSIGNMENT')
  f.service.createAssignment(f.employee.id, { ...f.assignment, departmentId: f.otherDepartment.id, positionId: f.otherPosition.id, startDate: '2026-03-01' })
  const latest = f.service.getHistory(f.employee.id)[1]
  assert.equal(f.service.deleteAssignment(latest.id).currentAssignment.startDate, '2026-02-01'); f.integrity()
})

test('legacy future initial hire is preserved by createEmployee and requires an explicit history correction', async t => {
  const f = await fixture(t)
  const future = f.service.createEmployee({ ...f.input, startDate: '2030-01-01' })
  const row = f.service.getHistory(future.id)[0]
  assert.equal(future.hireDate, '2030-01-01')
  f.reject(() => f.service.createAssignment(future.id, { ...f.assignment, category: 'Інша' }), 'FUTURE_ASSIGNMENT')
  f.reject(() => f.service.updateAssignment(row.id, { ...f.assignment, startDate: row.startDate, category: 'Виправлення' }), 'FUTURE_ASSIGNMENT')
  assert.equal(f.service.getHistory(future.id)[0].startDate, '2030-01-01')
  assert.equal(f.service.updateAssignment(row.id, { ...f.assignment, startDate: '2026-10-01' }).hireDate, '2026-10-01')
  f.integrity()
})

test('employee deletion is atomic, cascades all history and preserves dictionaries and unrelated employees', async t => {
  const f = await fixture(t)
  f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Інша' })
  const other = f.service.createEmployee(f.input)
  f.db.exec("CREATE TRIGGER test_refuse BEFORE DELETE ON employee_positions BEGIN SELECT RAISE(ABORT, 'injected'); END")
  f.reject(() => f.service.deleteEmployee(f.employee.id), 'CONFLICT')
  f.db.exec('DROP TRIGGER test_refuse')
  assert.equal(f.service.deleteEmployee(f.employee.id), null)
  assert.equal(f.db.prepare('SELECT count(*) n FROM employee_positions WHERE employee_id=?').get(f.employee.id).n, 0)
  assert.equal(f.service.listEmployees().length, 1)
  assert.equal(f.service.getEmployee(other.id).id, other.id)
  assert.equal(f.service.listDepartments().length, 2)
  assert.equal(f.service.listPositions().length, 2); f.integrity()
})

test('mutations respect the shared backup busy guard and strict payloads', async t => {
  const f = await fixture(t)
  for (const input of [{ ...f.assignment, category: ' ' }, { ...f.assignment, sql: 'DELETE' }, { ...f.assignment, category: 'X'.repeat(201) }]) {
    f.reject(() => f.service.createAssignment(f.employee.id, input), 'INVALID_ARGUMENTS')
  }
  f.setBusy(true)
  for (const operation of [() => f.service.createAssignment(f.employee.id, f.assignment), () => f.service.updateAssignment(f.first.id, f.assignment),
    () => f.service.deleteAssignment(f.first.id), () => f.service.deleteEmployee(f.employee.id)]) f.reject(operation, 'BUSY')
})

test('published migration 3 remains unchanged', () => {
  assert.equal(createHash('sha256').update(migrations[2].name + '\n' + migrations[2].sql).digest('hex'), '2b9225e9791caab6a06563c0da2a76ba783c8fd2bc655139df68e0a449d4865c')
})

test('today and the birth-date boundary are accepted; category and department changes are meaningful', async t => {
  const f = await fixture(t)
  assert.equal(f.service.updateAssignment(f.first.id, { ...f.assignment, startDate: '2000-01-01' }).hireDate, '2000-01-01')
  f.service.createAssignment(f.employee.id, { ...f.assignment, category: 'Зміна категорії', startDate: '2026-11-01' })
  const card = f.service.createAssignment(f.employee.id, { ...f.assignment, departmentId: f.otherDepartment.id, category: 'Зміна категорії', startDate: '2026-11-02' })
  assert.equal(card.currentAssignment.departmentId, f.otherDepartment.id)
  f.integrity()
})
test('explicit removal of a legacy future row is allowed when valid history remains', async t => {
  const f = await fixture(t)
  const id = randomUUID()
  f.db.prepare('INSERT INTO employee_positions VALUES (?, ?, ?, ?, ?, ?)').run(id, f.employee.id, f.department.id, f.position.id, 'Майбутня', '2030-01-01')
  assert.equal(f.service.deleteAssignment(id).currentAssignment.id, f.first.id)
  f.integrity()
})
