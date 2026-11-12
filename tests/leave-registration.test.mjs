import { seedDirectories, seedEmployee } from './fixtures/personnel-directory.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { openStorageSafely, Storage } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { calendarDays } from '../dist-electron/shared/leave-calculations.js'
const code = expected => error => error.code === expected
async function fixture(t, manifest = migrations) {
  const root = mkdtempSync(join(tmpdir(), 'hr-registration-'))
  const file = join(root, 'data', 'app.db')
  const connection = await openStorageSafely(file, manifest)
  const handles = [connection]
  t.after(() => {
    for (const h of handles.reverse()) h.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })
  const storage = { getDatabase: () => connection.database }
  const personnel = new PersonnelService(storage, () => false)
  const { department, position } = seedDirectories(connection, personnel, 'Відділ', 'Посада')
  const person = (hireDate = '2024-01-01') => seedEmployee(connection, personnel, { lastName: 'Тест', firstName: 'Приклад', middleName: null, birthDate: null,
    employeeType: 'official', hireDate, positionId: position.id, departmentId: department.id })
  const employee = person()
  const leave = new LeaveService(storage, () => false)
  const period = (start, days, leaveType = 'annual_main') => ({ leaveType, periodStart: start, periodEnd: start.slice(0,4) + '-12-31',
    accountingBasis: 'initial_balance', confirmedDays: days, referenceEntitlementDays: null })
  const register = (allocations, extra = {}) => leave.registerLeave({ requestId: randomUUID(), employeeId: employee.id, leaveType: 'annual_main',
    startDate: '2027-04-05', endDate: '2027-04-20', usedDays: 16, orderNumber: null, orderDate: null,
    durationExplanation: null, allocations, ...extra })
  return { root, file, connection, handles, personnel, person, employee, leave, period, register }
}
test('calendar arithmetic includes endpoints, leap day and year boundaries', () => {
  assert.equal(calendarDays('2027-04-05','2027-04-20'),16)
  assert.equal(calendarDays('2028-02-28','2028-03-01'),3)
  assert.equal(calendarDays('2027-12-31','2028-01-02'),3)
})
test('FIFO, manual allocation, idempotency and available values survive reopen and restore', async t => {
  const f = await fixture(t)
  const periods = f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',5),f.period('2025-01-01',12),f.period('2026-01-01',18)])
  const proposal = f.leave.proposeAllocation(f.employee.id,'annual_main',16,'2027-04-05','2027-04-20')
  assert.deepEqual(proposal.allocations, [{periodId:periods[0].id,days:5},{periodId:periods[1].id,days:11}])
  const requestId = randomUUID()
  const allocation = [{periodId:periods[1].id,days:10},{periodId:periods[2].id,days:6}]
  const record = f.register(allocation,{requestId})
  assert.equal(f.register([...allocation].reverse(),{requestId}).id,record.id)
  assert.throws(() => f.register(allocation,{requestId,orderNumber:'changed'}),code('CONFLICT'))
  assert.deepEqual(f.leave.getBalances(f.employee.id).map(p => [p.confirmedDays,p.usedDays,p.availableDays]),[[5,0,5],[12,10,2],[18,6,12]])
  f.connection.close()
  const reopened = await openStorageSafely(f.file)
  f.handles.push(reopened)
  assert.equal(new LeaveService({getDatabase:()=>reopened.database},()=>false).listRecords(f.employee.id).length,1)
  reopened.close()
  const sourceBytes=readFileSync(f.file)
  const storage=new Storage(), backup=new BackupService(storage)
  f.handles.push({close:()=>{backup.stop();backup.invalidateSelections();storage.close()}})
  await storage.initializeSafely(()=>join(f.root,'restore','active.db'))
  const selection=await backup.chooseRestore(async()=>f.file)
  await backup.confirmRestore(selection.token,async()=>true)
  assert.equal(new LeaveService(storage,()=>backup.isBusy()).getBalances(f.employee.id)[1].usedDays,10)
  assert.deepEqual(readFileSync(f.file),sourceBytes)
})
test('registration rejects all allocation and duration conflicts without partial writes',async t=>{
  const f=await fixture(t)
  const [p]=f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',30)])
  const other=f.person()
  const [foreign]=f.leave.savePeriods(other.id,[f.period('2024-01-01',30)])
  const [wrongType,zero]=f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',30,'children_social_additional'),f.period('2025-01-01',0)])
  for(const allocations of [
    [{periodId:randomUUID(),days:16}],[{periodId:foreign.id,days:16}],
    [{periodId:wrongType.id,days:16}],[{periodId:zero.id,days:16}],
    [{periodId:p.id,days:31}],[{periodId:p.id,days:15}],
    [{periodId:p.id,days:0}],[{periodId:p.id,days:8},{periodId:p.id,days:8}],
  ]) assert.throws(()=>f.register(allocations))
  assert.throws(()=>f.register([{periodId:p.id,days:15}],{usedDays:15}),code('INVALID_ARGUMENTS'))
  assert.throws(()=>f.register([{periodId:p.id,days:16}],{startDate:'2026-12-30',endDate:'2027-01-14'}),code('TRANSITION_LEAVE'))
  assert.equal(f.leave.listRecords(null).length,0)
  const futureEmployee = f.person('2028-01-01')
  const [futurePeriod] = f.leave.savePeriods(futureEmployee.id, [{
    ...f.period('2028-01-01',30), accountingBasis: 'confirmed_entitlement',
  }])
  assert.throws(() => f.register([{ periodId: futurePeriod.id, days: 16 }],
    { employeeId: futureEmployee.id }), code('INVALID_ARGUMENTS'))
  const record=f.register([{periodId:p.id,days:15}],{usedDays:15,durationExplanation:'Підтверджено кадровиком'})
  assert.equal(record.usedDays,15)
  assert.equal(record.durationExplanation,'Підтверджено кадровиком')
  assert.throws(()=>f.register([{periodId:wrongType.id,days:1}],{leaveType:'children_social_additional',startDate:'2027-04-20',endDate:'2027-04-20',usedDays:1}),code('LEAVE_OVERLAP'))
  assert.throws(()=>f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',14)]),code('PERIOD_IN_USE'))
  assert.throws(()=>f.leave.deletePeriod(p.id),code('PERIOD_IN_USE'))
  f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',30)])
  assert.equal(f.leave.getBalances(f.employee.id).find(x=>x.id===p.id).availableDays,15)
})
test('IMMEDIATE registration rolls back header and all allocations on injected second allocation failure',async t=>{
  const f=await fixture(t)
  const periods=f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',5),f.period('2025-01-01',20)])
  f.connection.database.exec(`CREATE TRIGGER test_fail BEFORE INSERT ON leave_allocations
    WHEN NEW.period_id='${periods[1].id}' BEGIN SELECT RAISE(ABORT,'injected'); END`)
  assert.throws(()=>f.register([{periodId:periods[0].id,days:5},{periodId:periods[1].id,days:11}]))
  assert.equal(f.connection.database.prepare('SELECT count(*) n FROM leave_records').get().n,0)
  assert.equal(f.connection.database.prepare('SELECT count(*) n FROM leave_allocations').get().n,0)
})
test('employee deletion cascades registrations and allocations atomically',async t=>{
  const f=await fixture(t)
  const [p]=f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',30)])
  f.register([{periodId:p.id,days:16}])
  const other=f.person()
  f.connection.database.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON leave_period_balances BEGIN SELECT RAISE(ABORT,'fail'); END")
  assert.throws(()=>f.personnel.deleteEmployee(f.employee.id))
  assert.equal(f.leave.listRecords(f.employee.id).length,1)
  f.connection.database.exec('DROP TRIGGER fail_delete')
  f.personnel.deleteEmployee(f.employee.id)
  assert.equal(f.leave.listRecords(null).length,0)
  assert.equal(f.connection.database.prepare('SELECT count(*) n FROM leave_allocations').get().n,0)
  assert.equal(f.personnel.getEmployee(other.id).id,other.id)
  assert.deepEqual(f.connection.database.pragma('foreign_key_check'),[])
})
test('v6 to v12 preserves balances and fails closed without protective snapshot',async t=>{
  const f=await fixture(t,migrations.slice(0,6))
  const db=f.connection.database
  db.prepare(`INSERT INTO leave_period_balances VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(),f.employee.id,'annual_main','2024-01-01','2024-12-31','initial_balance',7,null)
  const ledger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
  f.connection.close()
  const protection=join(f.root,'data','protection')
  renameSync(protection,protection+'-saved')
  writeFileSync(protection,'blocked')
  await assert.rejects(openStorageSafely(f.file))
  const check=new Database(f.file,{readonly:true})
  assert.equal(check.pragma('user_version',{simple:true}),6)
  check.close()
  rmSync(protection)
  const broken = [...migrations.slice(0,6), { ...migrations[6], sql: migrations[6].sql + ' INVALID SQL;' }]
  await assert.rejects(openStorageSafely(f.file, broken),code('MIGRATION_FAILED'))
  const unchanged = new Database(f.file,{readonly:true})
  assert.equal(unchanged.prepare("SELECT 1 FROM sqlite_schema WHERE name='leave_records'").get(),undefined)
  assert.equal(unchanged.pragma('user_version',{simple:true}),6)
  unchanged.close()
  const updated=await openStorageSafely(f.file)
  f.handles.push(updated)
  assert.equal(updated.schemaVersion,19)
  assert.equal(updated.database.prepare('SELECT confirmed_days FROM leave_period_balances').get().confirmed_days,7)
  assert.deepEqual(updated.database.prepare('SELECT * FROM schema_migrations WHERE version<=6 ORDER BY version').all(),ledger)
  assert.ok(readdirSync(protection).some(name=>name.includes('protect-migration-v7-')))
})

test('stale availability cannot overspend; cancelled records do not consume days or block dates', async t => {
  const f = await fixture(t)
  const [period] = f.leave.savePeriods(f.employee.id,[f.period('2024-01-01',30)])
  const stale = f.leave.proposeAllocation(f.employee.id,'annual_main',16,'2027-04-05','2027-04-20')
  const record = f.register(stale.allocations)
  assert.throws(() => f.register(stale.allocations,{startDate:'2027-05-05',endDate:'2027-05-20'}), code('INSUFFICIENT_DAYS'))
  assert.throws(() => f.register([{periodId:period.id,days:17}],{usedDays:17,startDate:'2027-06-01',endDate:'2027-06-16'}),code('INVALID_ARGUMENTS'))
  f.connection.database.prepare("UPDATE leave_records SET status='cancelled' WHERE id=?").run(record.id)
  assert.equal(f.leave.getBalances(f.employee.id)[0].availableDays,30)
  assert.equal(f.register(stale.allocations).status,'active')
})
