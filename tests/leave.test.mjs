import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { LeaveService, LeaveError } from '../dist-electron/electron/leave/service.js'
import { proposedPeriods } from '../dist-electron/electron/leave/periods.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { Storage, openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'

const code = value => error => error.code === value
const annual = (start, end, days, basis = start < '2027-01-01' ? 'initial_balance' : 'confirmed_entitlement') => ({
  leaveType: 'annual_main', periodStart: start, periodEnd: end, accountingBasis: basis,
  confirmedDays: days, referenceEntitlementDays: null,
})
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-leave-'))
  const handles = []
  t.after(() => {
    for (const handle of handles.reverse()) handle.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-leave-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })
  const file = join(root, 'data', 'hromadahr.db')
  return { root, file, handles, async open(manifest = migrations) {
    const handle = await openStorageSafely(file, manifest)
    handles.push(handle)
    return handle
  } }
}
async function employee(connection, hireDate = '2023-06-15') {
  const personnel = new PersonnelService({ getDatabase: () => connection.database }, () => false)
  const department = personnel.createDepartment({ name: 'Відділ' })
  const position = personnel.createPosition({ name: 'Посада' })
  const data = { lastName: 'Тестовий', firstName: 'Працівник', middleName: null, birthDate: null,
    employeeType: 'official', hireDate, positionId: position.id, departmentId: department.id }
  return { personnel, department, position, employee: personnel.createEmployee(data), data }
}

test('working-year periods use clamped calendar-year arithmetic and retain the 2027-crossing period', () => {
  assert.deepEqual(proposedPeriods('annual_main', '2023-06-15', '2027-06-15').map(({ periodStart, periodEnd, accountingBasis }) => [periodStart, periodEnd, accountingBasis]), [
    ['2023-06-15', '2024-06-14', 'initial_balance'], ['2024-06-15', '2025-06-14', 'initial_balance'],
    ['2025-06-15', '2026-06-14', 'initial_balance'], ['2026-06-15', '2027-06-14', 'initial_balance'],
    ['2027-06-15', '2028-06-14', 'confirmed_entitlement'],
  ])
  assert.deepEqual(proposedPeriods('annual_main', '2024-02-29', '2026-03-01').map(({ periodStart, periodEnd }) => [periodStart, periodEnd]), [
    ['2024-02-29', '2025-02-27'], ['2025-02-28', '2026-02-27'], ['2026-02-28', '2027-02-27'],
  ])
  assert.deepEqual(proposedPeriods('children_social_additional', '2026-08-12', '2028-01-01').map(({ periodStart, periodEnd, accountingBasis }) => [periodStart, periodEnd, accountingBasis]), [
    ['2026-01-01', '2026-12-31', 'initial_balance'], ['2027-01-01', '2027-12-31', 'confirmed_entitlement'],
    ['2028-01-01', '2028-12-31', 'confirmed_entitlement'],
  ])
  assert.deepEqual(proposedPeriods('oms_service_additional', '2020-01-01', '2028-01-01'), [])
})

test('v5 to v8 migration keeps live personnel and directories and protects the source image', async t => {
  const f = fixture(t)
  const old = await f.open(migrations.slice(0, 5))
  const created = await employee(old)
  old.close()
  const current = await f.open()
  const db = current.database
  assert.equal(current.schemaVersion, 8)
  assert.equal(db.prepare('SELECT id FROM employees').get().id, created.employee.id)
  assert.equal(db.prepare('SELECT id FROM departments').get().id, created.department.id)
  assert.equal(db.prepare('SELECT id FROM positions').get().id, created.position.id)
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name='leave_period_balances'").get().n, 1)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
  const protection = join(f.root, 'data', 'protection')
  const image = join(protection, readdirSync(protection).find(name => name.includes('protect-migration-v6-')))
  assert.equal(inspectDatabase(image), 5)
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
})

test('v6 migration failure before snapshot leaves the v5 database untouched', async t => {
  const f = fixture(t)
  const old = await f.open(migrations.slice(0, 5))
  const created = await employee(old)
  old.close()
  const protection = join(f.root, 'data', 'protection')
  renameSync(protection, protection + '-saved')
  writeFileSync(protection, 'block snapshot directory')
  await assert.rejects(f.open())
  const check = new Database(f.file, { readonly: true })
  try {
    assert.equal(check.pragma('user_version', { simple: true }), 5)
    assert.equal(check.prepare('SELECT id FROM employees').get().id, created.employee.id)
    assert.equal(check.prepare("SELECT 1 FROM sqlite_schema WHERE name='leave_period_balances'").get(), undefined)
    assert.deepEqual(check.pragma('foreign_key_check'), [])
  } finally { check.close() }
})

test('restoring a supported v5 copy migrates the active database and leaves the source copy intact', async t => {
  const f = fixture(t)
  const sourceFile = join(f.root, 'source', 'v5.db')
  const source = await openStorageSafely(sourceFile, migrations.slice(0, 5))
  const created = await employee(source)
  source.close()
  const sourceBytes = readFileSync(sourceFile)
  const storage = new Storage()
  const backups = new BackupService(storage)
  await storage.initializeSafely(() => join(f.root, 'active', 'hromadahr.db'))
  f.handles.push({ close: () => { backups.stop(); backups.invalidateSelections(); storage.close() } })
  assert.equal(storage.getStatus().schemaVersion, 8)
  const selected = await backups.chooseRestore(async () => sourceFile)
  assert.equal(selected.schemaVersion, 5)
  assert.deepEqual(await backups.confirmRestore(selected.token, async () => true), { restored: true })
  assert.equal(storage.getStatus().schemaVersion, 8)
  assert.equal(new PersonnelService(storage, () => backups.isBusy()).getEmployee(created.employee.id).id, created.employee.id)
  assert.deepEqual(readFileSync(sourceFile), sourceBytes)
})

test('confirmed zero differs from missing; bulk save is atomic and idempotent', async t => {
  const f = fixture(t), connection = await f.open(), { employee: person } = await employee(connection)
  const service = new LeaveService({ getDatabase: () => connection.database }, () => false)
  assert.deepEqual(service.listPeriods(person.id), [])
  const initial = [annual('2023-06-15', '2024-06-14', 0), annual('2024-06-15', '2025-06-14', 7),
    annual('2025-06-15', '2026-06-14', 10), annual('2026-06-15', '2027-06-14', 18)]
  const saved = service.savePeriods(person.id, initial)
  assert.equal(saved.length, 4)
  assert.equal(saved[0].status, 'confirmed')
  assert.equal(saved[0].confirmedDays, 0)
  assert.equal(service.savePeriods(person.id, initial).length, 4)
  assert.equal(connection.database.prepare('SELECT count(*) n FROM leave_period_balances').get().n, 4)
  assert.equal(connection.database.prepare('SELECT sum(confirmed_days) n FROM leave_period_balances').get().n, 35)
  const future = service.savePeriods(person.id, [annual('2027-06-15', '2028-06-14', 0, 'confirmed_entitlement')])[0]
  assert.equal(future.accountingBasis, 'confirmed_entitlement')
  assert.equal(future.confirmedDays, 0)
  assert.throws(() => service.savePeriods(person.id, [initial[0], initial[0]]), code('INVALID_ARGUMENTS'))
  assert.throws(() => service.savePeriods(person.id, [annual('2027-06-15', '2028-06-14', 1),
    annual('2028-06-15', '2029-06-14', 1, 'initial_balance')]), code('INVALID_ARGUMENTS'))
  assert.equal(service.listPeriods(person.id).length, 5)
  assert.throws(() => service.savePeriods(person.id, [annual('2027-06-15', '2028-06-14', 1),
    annual('2027-01-01', '2027-12-31', 3, 'confirmed_entitlement')]), code('INVALID_ARGUMENTS'))
  assert.equal(service.listPeriods(person.id).length, 5)
})

test('manual service periods, overlap guards and period correction/removal are controlled', async t => {
  const f = fixture(t), connection = await f.open(), { employee: person } = await employee(connection)
  const service = new LeaveService({ getDatabase: () => connection.database }, () => false)
  const oms = { leaveType: 'oms_service_additional', periodStart: '2020-04-01', periodEnd: '2021-03-31',
    accountingBasis: 'initial_balance', confirmedDays: 4, referenceEntitlementDays: 10 }
  const saved = service.savePeriods(person.id, [oms])[0]
  assert.equal(saved.referenceEntitlementDays, 10)
  assert.throws(() => service.savePeriods(person.id, [{ ...oms, periodStart: '2021-03-01', periodEnd: '2022-02-28' }]), code('CONFLICT'))
  assert.equal(service.listPeriods(person.id).length, 1)
  const updated = service.savePeriods(person.id, [{ ...oms, confirmedDays: 6 }])[0]
  assert.equal(updated.id, saved.id)
  assert.equal(updated.confirmedDays, 6)
  service.deletePeriod(saved.id)
  assert.deepEqual(service.listPeriods(person.id), [])
  assert.throws(() => service.deletePeriod(saved.id), code('NOT_FOUND'))
  assert.throws(() => service.savePeriods(person.id, [{ ...oms, periodStart: '2020-02-30' }]), code('INVALID_ARGUMENTS'))
})

test('SQLite constraints independently reject malformed, negative and overlapping periods', async t => {
  const f = fixture(t), connection = await f.open(), { employee: person } = await employee(connection)
  const db = connection.database
  const insert = db.prepare(`INSERT INTO leave_period_balances (id, employee_id, leave_type, period_start, period_end,
    accounting_basis, confirmed_days, reference_entitlement_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const row = (start, end, days = 1) => [randomUUID(), person.id, 'annual_main', start, end, 'initial_balance', days, null]
  insert.run(...row('2023-06-15', '2024-06-14'))
  assert.throws(() => insert.run(...row('2024-06-01', '2025-05-31')), /leave period overlap/)
  assert.throws(() => insert.run(...row('2024-06-15', '2025-06-14', -1)), /CHECK constraint/)
  assert.throws(() => insert.run(...row('2025-06-15', '2026-06-14').map((value, index) => index === 3 ? '2025-02-30' : value)), /CHECK constraint/)
  assert.throws(() => insert.run(...row('2025-06-15', '2024-12-31')), /CHECK constraint/)
  assert.equal(db.prepare('SELECT count(*) n FROM leave_period_balances').get().n, 1)
})

test('hire date changes are blocked only when periods exist; other edits and employee cascade work', async t => {
  const f = fixture(t), connection = await f.open(), { personnel, employee: person, data } = await employee(connection)
  const leave = new LeaveService({ getDatabase: () => connection.database }, () => false)
  leave.savePeriods(person.id, [annual('2023-06-15', '2024-06-14', 2)])
  assert.throws(() => personnel.updateEmployee(person.id, { ...data, hireDate: '2023-06-16' }), code('HIRE_DATE_HAS_LEAVE_PERIODS'))
  const changed = personnel.updateEmployee(person.id, { ...data, firstName: 'Інше ім’я' })
  assert.equal(changed.firstName, 'Інше ім’я')
  connection.database.exec(`CREATE TRIGGER test_block_employee_delete BEFORE DELETE ON employees
    WHEN OLD.id='${person.id}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`)
  assert.throws(() => personnel.deleteEmployee(person.id), code('CONFLICT'))
  assert.equal(connection.database.prepare('SELECT id FROM employees WHERE id=?').get(person.id).id, person.id)
  assert.equal(leave.listPeriods(person.id).length, 1)
  connection.database.exec('DROP TRIGGER test_block_employee_delete')
  personnel.deleteEmployee(person.id)
  assert.equal(connection.database.prepare('SELECT count(*) n FROM leave_period_balances').get().n, 0)
  assert.equal(connection.database.prepare('SELECT count(*) n FROM departments').get().n, 1)
  assert.equal(connection.database.prepare('SELECT count(*) n FROM positions').get().n, 1)
})

test('service respects current storage connection and backup busy guard', async t => {
  const f = fixture(t), connection = await f.open(), { employee: person } = await employee(connection)
  let busy = true
  const service = new LeaveService({ getDatabase: () => connection.database }, () => busy)
  assert.throws(() => service.listPeriods(person.id), error => error instanceof LeaveError && error.code === 'BUSY')
  busy = false
  assert.deepEqual(service.listPeriods(person.id), [])
  assert.throws(() => service.proposePeriods(person.id, '9999-12-31', 'annual_main'), code('INVALID_ARGUMENTS'))
})
