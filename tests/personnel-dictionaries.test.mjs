import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { openStorageSafely, Storage } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { moveDictionaryEntry } from '../src/employees/dictionaryOrder.ts'
import { seedDirectories, seedEmployee } from './fixtures/personnel-directory.mjs'

const code = value => error => error.code === value
const personnel = db => new PersonnelService({ getDatabase: () => db }, () => false)
const ledger = db => db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
const ids = snapshot => snapshot.entries.map(row => row.id)
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-dictionaries-'))
  const handles = []
  t.after(() => {
    handles.reverse().forEach(handle => handle.close())
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })
  const file = join(root, 'app.db')
  return { root, file, handles, async open(manifest) {
    const handle = await openStorageSafely(file, manifest)
    handles.push(handle)
    return handle
  } }
}

test('v12 migrates and restores v11 with alphabetic seeds, immutable IDs and leave data', async t => {
  const f = fixture(t)
  const v11 = await f.open(migrations.slice(0, 11))
  const db = v11.database
  const hr = personnel(db)
  const later = seedDirectories(v11, hr, 'Ясний відділ', 'Ясна посада')
  const first = seedDirectories(v11, hr, 'Абетка', 'Аналітик')
  const employee = seedEmployee(v11,hr,{ lastName: 'Тест', firstName: 'Приклад', middleName: null, birthDate: null,
    employeeType: 'staff', positionStartedOn: null, positionCategory: null, hireDate: '2026-01-01', departmentId: later.department.id, positionId: first.position.id })
  const leave = new LeaveService({ getDatabase: () => db }, () => false)
  const periods = leave.savePeriods(employee.id, [{ leaveType: 'annual_main', periodStart: '2026-01-01', periodEnd: '2026-12-31',
    accountingBasis: 'initial_balance', confirmedDays: 4, referenceEntitlementDays: null }])
  const registration = leave.registerLeave({ requestId: randomUUID(), employeeId: employee.id, leaveType: 'annual_main',
    startDate: '2027-06-01', endDate: '2027-06-01', usedDays: 1, orderNumber: null, orderDate: null,
    durationExplanation: null, allocations: [{ periodId: periods[0].id, days: 1 }] })
  const prior = ledger(db)
  v11.close()
  const source = readFileSync(f.file)
  const broken = [...migrations.slice(0, 11), { ...migrations[11], sql: migrations[11].sql + '\nINSERT INTO missing_table VALUES (1);' }]
  await assert.rejects(f.open(broken), code('MIGRATION_FAILED'))
  const legacy = new Database(f.file, { readonly: true })
  try {
    assert.deepEqual(ledger(legacy), prior)
    assert.equal(legacy.pragma('user_version', { simple: true }), 11)
    assert.equal(legacy.pragma('table_info(departments)').some(column => column.name === 'sort_order'), false)
  } finally { legacy.close() }

  const storage = new Storage()
  const backup = new BackupService(storage)
  f.handles.push({ close() { backup.stop(); backup.invalidateSelections(); storage.close() } })
  await storage.initializeSafely(() => join(f.root, 'restored', 'app.db'))
  const selected = await backup.chooseRestore(async () => f.file)
  assert.equal(selected.schemaVersion, 11)
  await backup.confirmRestore(selected.token, async () => true)
  assert.equal(storage.getStatus().schemaVersion, 19)
  assert.deepEqual(readFileSync(f.file), source)
  const upgraded = storage.getDatabase()
  assert.deepEqual(ledger(upgraded).slice(0, 11), prior)
  assert.deepEqual(upgraded.pragma('foreign_key_check'), [])
  assert.equal(upgraded.pragma('integrity_check', { simple: true }), 'ok')
  const restored = personnel(upgraded)
  assert.deepEqual(ids(restored.getDictionary('department')), [first.department.id, later.department.id])
  assert.deepEqual(ids(restored.getDictionary('position')), [first.position.id, later.position.id])
  assert.deepEqual(restored.getEmployee(employee.id), employee)
  assert.deepEqual(new LeaveService(storage, () => false).getRecord(registration.id), registration)

  const current = await f.open()
  assert.equal(current.schemaVersion, 19)
  const copies = readdirSync(join(f.root, 'protection')).filter(name => name.includes('protect-migration-v12-'))
  assert.ok(copies.length >= 1)
  const protectedCopy = new Database(join(f.root, 'protection', copies[0]), { readonly: true })
  try { assert.equal(protectedCopy.pragma('user_version', { simple: true }), 11) }
  finally { protectedCopy.close() }
})

test('independent revisions guard persistent ordering, rename, dependency checks and rollback', async t => {
  const f = fixture(t)
  const connection = await f.open()
  const hr = personnel(connection.database)
  const a = hr.createDepartment({ name: 'Ясний відділ' })
  const b = hr.createDepartment({ name: 'Альфа' })
  const c = hr.createDepartment({ name: 'Вільний' })
  const p = hr.createPosition({ name: 'Ясна посада' })
  const q = hr.createPosition({ name: 'Аналітик' })
  assert.deepEqual(hr.listDepartments(), [a, b, c])
  assert.deepEqual(hr.listPositions(), [p, q])
  assert.throws(() => hr.createDepartment({ name: '  Ясний   ВІДДІЛ ' }), code('CONFLICT'))
  const department = hr.getDictionary('department')
  const position = hr.getDictionary('position')
  for (const invalid of [[a.id, b.id], [a.id, b.id, b.id], [a.id, b.id, randomUUID()]]) {
    assert.throws(() => hr.reorderDictionary('department', invalid, department.revision), code('INVALID_ARGUMENTS'))
  }
  assert.throws(() => hr.reorderDictionary('unknown', [a.id], department.revision), code('INVALID_ARGUMENTS'))
  connection.database.exec(`CREATE TRIGGER reject_reorder BEFORE UPDATE OF sort_order ON departments
    WHEN old.id='${b.id}' BEGIN SELECT RAISE(ABORT, 'test'); END`)
  assert.throws(() => hr.reorderDictionary('department', [c.id, b.id, a.id], department.revision), code('CONFLICT'))
  assert.deepEqual(hr.getDictionary('department'), department)
  connection.database.exec('DROP TRIGGER reject_reorder')
  const ordered = hr.reorderDictionary('department', [c.id, b.id, a.id], department.revision)
  assert.throws(() => hr.reorderDictionary('department', [a.id, b.id, c.id], department.revision), code('DICTIONARY_STALE'))
  assert.deepEqual(hr.getDictionary('position'), position)
  const employee = hr.createEmployee({ lastName: 'Тест', firstName: 'Працівник', middleName: null, birthDate: null,
    employeeType: 'staff', positionStartedOn: null, positionCategory: null, hireDate: '2026-01-01', departmentId: b.id, positionId: q.id })
  assert.throws(() => hr.renameDictionaryEntry('department', b.id, a.name, 0), code('CONFLICT'))
  const renamed = hr.renameDictionaryEntry('department', b.id, ' Нова   назва ', 0)
  assert.deepEqual(ids(renamed), ids(ordered))
  assert.equal(renamed.revision, ordered.revision)
  assert.equal(hr.getEmployee(employee.id).department.name, 'Нова назва')
  assert.equal(hr.getEmployee(employee.id).departmentId, b.id)
  assert.throws(() => hr.renameDictionaryEntry('department', b.id, 'Застаріло', 0), code('DICTIONARY_STALE'))
  assert.throws(() => hr.deleteDictionaryEntry('department', b.id, 1), code('DICTIONARY_IN_USE'))
  assert.throws(() => hr.deleteDictionaryEntry('position', q.id, 0), code('DICTIONARY_IN_USE'))
  const removed = hr.deleteDictionaryEntry('department', c.id, 0)
  assert.deepEqual(ids(removed), [b.id, a.id])
  assert.deepEqual(connection.database.prepare('SELECT sort_order FROM departments ORDER BY sort_order').pluck().all(), [0, 1])
  connection.close()
  const reopened = await f.open()
  assert.deepEqual(personnel(reopened.database).getDictionary('department'), removed)
  assert.deepEqual(reopened.database.pragma('foreign_key_check'), [])
})

test('moving by handle or adjacent keyboard target keeps a full immutable permutation', () => {
  const current = ['a', 'b', 'c']
  assert.deepEqual(moveDictionaryEntry(current, 'a', 'c'), ['b', 'c', 'a'])
  assert.deepEqual(moveDictionaryEntry(current, 'b', 'a'), ['b', 'a', 'c'])
  assert.equal(moveDictionaryEntry(current, 'x', 'a'), current)
  assert.deepEqual(current, ['a', 'b', 'c'])
})
