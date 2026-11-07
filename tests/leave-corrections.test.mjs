import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync, renameSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { openStorageSafely, Storage } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'
import { matchesUpdate } from '../src/components/leave/corrections.ts'
const code = value => error => error.code === value
async function fixture(t, manifest=migrations) {
  const root=mkdtempSync(join(tmpdir(),'hr-corrections-'))
  const file=join(root,'data','app.db')
  const connection=await openStorageSafely(file,manifest)
  const handles=[connection]
  t.after(()=>{
    for(const h of handles.reverse()) h.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep))
    rmSync(root,{recursive:true,force:true,maxRetries:5})
  })
  const storage={getDatabase:()=>connection.database}
  const personnel=new PersonnelService(storage,()=>false)
  const department=personnel.createDepartment({name:'Відділ'})
  const position=personnel.createPosition({name:'Посада'})
  const details={lastName:'Тест',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',
    hireDate:'2024-01-01',departmentId:department.id,positionId:position.id}
  const employee=personnel.createEmployee(details)
  const service=new LeaveService(storage,()=>false)
  const period=(year,days,type='annual_main')=>({leaveType:type,periodStart:year+'-01-01',periodEnd:year+'-12-31',
    accountingBasis:year<2027?'initial_balance':'confirmed_entitlement',confirmedDays:days,referenceEntitlementDays:null})
  const register=(allocations,extra={})=>service.registerLeave({
    requestId:randomUUID(),employeeId:employee.id,leaveType:'annual_main',startDate:'2027-04-05',endDate:'2027-04-20',
    usedDays:16,orderNumber:'123',orderDate:'2027-04-01',durationExplanation:null,allocations,...extra,
  })
  const update=(record,extra={})=>({id:record.id,expectedRevision:record.revision,leaveType:record.leaveType,
    startDate:record.startDate,endDate:record.endDate,usedDays:record.usedDays,allocations:record.allocations,
    orderNumber:record.orderNumber,orderDate:record.orderDate,durationExplanation:record.durationExplanation,...extra})
  return {root,file,connection,handles,personnel,details,employee,service,period,register,update}
}
test('editing returns days, keeps identity and original create idempotency payload',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const record=f.register([{periodId:p.id,days:16}])
  const identity=f.connection.database.prepare('SELECT request_id,request_json FROM leave_records WHERE id=?').get(record.id)
  const input=f.update(record,{usedDays:12,durationExplanation:'Уточнення',allocations:[{periodId:p.id,days:12}]})
  const result=f.service.updateLeave(input)
  assert.equal(result.id,record.id); assert.equal(result.createdAt,record.createdAt); assert.equal(result.revision,2)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,18)
  assert.deepEqual(f.connection.database.prepare('SELECT request_id,request_json FROM leave_records WHERE id=?').get(record.id),identity)
  assert.equal(f.service.registerLeave(JSON.parse(identity.request_json)).revision,2)
  assert.equal(matchesUpdate(result,input),true)
  assert.equal(matchesUpdate({...result,revision:3},input),false)
  assert.equal(matchesUpdate({...result,usedDays:11},input),false)
})
test('edits exclude own consumption, respect others, redistribute and can change type',async t=>{
  const f=await fixture(t)
  const [p,q,social]=f.service.savePeriods(f.employee.id,[f.period(2024,30),f.period(2025,20),f.period(2024,30,'children_social_additional')])
  let record=f.register([{periodId:p.id,days:16}])
  const other=f.register([{periodId:p.id,days:10}],{startDate:'2027-05-01',endDate:'2027-05-10',usedDays:10})
  const proposal=f.service.proposeEditAllocation(record.id,1,'annual_main',16,record.startDate,record.endDate)
  assert.equal(proposal.balances.find(x=>x.id===p.id).availableDays,20)
  assert.equal(f.service.getBalances(f.employee.id).find(x=>x.id===p.id).availableDays,4)
  assert.throws(()=>f.service.updateLeave(f.update(record,{usedDays:22,endDate:'2027-04-26',allocations:[{periodId:p.id,days:22}]})),code('INSUFFICIENT_DAYS'))
  assert.throws(()=>f.service.updateLeave(f.update(record,{startDate:'2027-05-01',endDate:'2027-05-16'})),code('LEAVE_OVERLAP'))
  record=f.service.updateLeave(f.update(record,{allocations:[{periodId:p.id,days:6},{periodId:q.id,days:10}]}))
  assert.deepEqual(f.service.getBalances(f.employee.id).filter(x=>x.leaveType==='annual_main').map(x=>x.usedDays),[16,10])
  record=f.service.updateLeave(f.update(record,{leaveType:'children_social_additional',allocations:[{periodId:social.id,days:16}]}))
  assert.equal(f.service.getBalances(f.employee.id).find(x=>x.id===p.id).usedDays,10)
  assert.equal(f.service.getBalances(f.employee.id).find(x=>x.id===q.id).usedDays,0)
  assert.equal(f.service.getBalances(f.employee.id).find(x=>x.id===social.id).usedDays,16)
  assert.deepEqual(f.service.getRecord(other.id),other)
  assert.throws(()=>f.service.updateLeave({...f.update(record),employeeId:randomUUID()}),code('INVALID_ARGUMENTS'))
  assert.throws(()=>f.service.updateLeave(f.update(record,{allocations:[{periodId:randomUUID(),days:16}]})),code('INVALID_ARGUMENTS'))
})
test('failed editing rolls back removed allocations, fields and revision',async t=>{
  const f=await fixture(t)
  const [p,q]=f.service.savePeriods(f.employee.id,[f.period(2024,30),f.period(2025,20)])
  const record=f.register([{periodId:p.id,days:16}])
  const balances=f.service.getBalances(f.employee.id)
  f.connection.database.exec(`CREATE TRIGGER fail_edit BEFORE INSERT ON leave_allocations
    WHEN NEW.period_id='${q.id}' BEGIN SELECT RAISE(ABORT,'fail'); END`)
  assert.throws(()=>f.service.updateLeave(f.update(record,{orderNumber:'changed',allocations:[{periodId:p.id,days:6},{periodId:q.id,days:10}]})))
  assert.deepEqual(f.service.getRecord(record.id),record)
  assert.deepEqual(f.service.getBalances(f.employee.id),balances)
})
test('cancellation is revision guarded, retains allocations and releases days once',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const record=f.register([{periodId:p.id,days:16}])
  const corrected=f.service.updateLeave(f.update(record))
  assert.throws(()=>f.service.updateLeave(f.update(record)),code('STALE_REVISION'))
  assert.throws(()=>f.service.cancelLeave(record.id,1,'Застаріле'),code('STALE_REVISION'))
  assert.throws(()=>f.service.proposeEditAllocation(record.id,1,'annual_main',16,record.startDate,record.endDate),code('STALE_REVISION'))
  f.connection.database.exec("CREATE TRIGGER fail_cancel BEFORE UPDATE ON leave_records WHEN NEW.status='cancelled' BEGIN SELECT RAISE(ABORT,'fail'); END")
  assert.throws(()=>f.service.cancelLeave(record.id,corrected.revision,'Відмова'))
  assert.deepEqual(f.service.getRecord(record.id),corrected)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,14)
  f.connection.database.exec('DROP TRIGGER fail_cancel')
  const cancelled=f.service.cancelLeave(record.id,corrected.revision,'Виправлення кадрового рішення')
  assert.equal(cancelled.status,'cancelled'); assert.equal(cancelled.revision,3); assert.ok(cancelled.cancelledAt)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,30)
  assert.deepEqual(cancelled.allocations,record.allocations)
  assert.deepEqual(f.service.cancelLeave(record.id,2,'Повтор'),cancelled)
  assert.throws(()=>f.service.updateLeave(f.update(cancelled)),code('LEAVE_CANCELLED'))
  assert.throws(()=>f.service.proposeEditAllocation(record.id,3,'annual_main',16,record.startDate,record.endDate),code('LEAVE_CANCELLED'))
  assert.throws(()=>f.service.deletePeriod(p.id),code('PERIOD_IN_USE'))
  f.service.savePeriods(f.employee.id,[f.period(2024,0)])
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,0)
  f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  assert.equal(f.register([{periodId:p.id,days:16}]).status,'active')
})
test('period date limits apply to creation, FIFO, manual allocation and editing',async t=>{
  const f=await fixture(t)
  const [p,q,r]=f.service.savePeriods(f.employee.id,[f.period(2027,5),f.period(2028,20),f.period(2029,30)])
  const proposal=f.service.proposeAllocation(f.employee.id,'annual_main',12,'2027-12-28','2028-01-08')
  assert.deepEqual(proposal.allocations,[{periodId:p.id,days:5}])
  assert.equal(proposal.shortfall,7)
  assert.deepEqual(proposal.balances.map(x=>x.id),[p.id,q.id])
  const dates={startDate:'2027-12-28',endDate:'2028-01-08',usedDays:12}
  assert.throws(()=>f.register([{periodId:r.id,days:12}],dates),code('INVALID_PERIOD'))
  let record=f.register([{periodId:p.id,days:5},{periodId:q.id,days:7}],dates)
  assert.throws(()=>f.service.updateLeave(f.update(record,{startDate:'2027-12-20',endDate:'2027-12-31'})),code('INVALID_PERIOD'))
  record=f.service.updateLeave(f.update(record,{endDate:'2027-12-31',usedDays:4,allocations:[{periodId:p.id,days:4}]}))
  assert.equal(f.service.getBalances(f.employee.id).find(x=>x.id===q.id).usedDays,0)
})
test('v7 migration preserves legacy mismatches and restore migrates the immutable source',async t=>{
  const f=await fixture(t,migrations.slice(0,7))
  const periodId=randomUUID(),recordId=randomUUID()
  f.connection.database.prepare('INSERT INTO leave_period_balances VALUES (?,?,?,?,?,?,?,?)')
    .run(periodId,f.employee.id,'annual_main','2028-01-01','2028-12-31','confirmed_entitlement',30,null)
  f.connection.database.prepare(`INSERT INTO leave_records
    (id,request_id,request_json,employee_id,leave_type,start_date,end_date,used_days,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(recordId,randomUUID(),'{}',f.employee.id,'annual_main','2027-05-01','2027-05-02',2,'2026-11-07T00:00:00.000Z')
  f.connection.database.prepare('INSERT INTO leave_allocations VALUES (?,?,?)').run(recordId,periodId,2)
  f.connection.close()
  const original=readFileSync(f.file)
  const storage=new Storage(),backup=new BackupService(storage)
  f.handles.push({close:()=>{backup.stop();backup.invalidateSelections();storage.close()}})
  await storage.initializeSafely(()=>join(f.root,'restored','app.db'))
  const selection=await backup.chooseRestore(async()=>f.file)
  assert.equal(selection.schemaVersion,7)
  await backup.confirmRestore(selection.token,async()=>true)
  const restored=new LeaveService(storage,()=>backup.isBusy()).getRecord(recordId)
  assert.equal(restored.revision,1);assert.equal(restored.allocationWarning,true)
  assert.deepEqual(restored.allocations,[{periodId,days:2}])
  assert.equal(restored.usedDays,2)
  assert.deepEqual(readFileSync(f.file),original)
  assert.equal(storage.getStatus().schemaVersion,8)
})
test('v8 requires protection, rolls back failed SQL and preserves all rows',async t=>{
  const f=await fixture(t,migrations.slice(0,7))
  const before=f.connection.database.prepare('SELECT * FROM employees').all()
  f.connection.close()
  const protection=join(f.root,'data','protection')
  renameSync(protection,protection+'-saved');writeFileSync(protection,'blocked')
  await assert.rejects(openStorageSafely(f.file))
  rmSync(protection)
  const broken=[...migrations.slice(0,7),{...migrations[7],sql:migrations[7].sql+' INVALID SQL;'}]
  await assert.rejects(openStorageSafely(f.file,broken))
  const check=new Database(f.file,{readonly:true})
  assert.equal(check.pragma('user_version',{simple:true}),7)
  assert.equal(check.pragma('table_info(leave_records)').some(x=>x.name==='revision'),false)
  check.close()
  const latest=await openStorageSafely(f.file)
  f.handles.push(latest)
  assert.deepEqual(latest.database.prepare('SELECT * FROM employees').all(),before)
  assert.equal(latest.schemaVersion,8)
  const snapshot=join(protection,readdirSync(protection).find(name=>name.includes('protect-migration-v8-')))
  assert.equal(inspectDatabase(snapshot),7)
})
test('complete employee deletion with active and cancelled records is atomic and hire date stays guarded',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const a=f.register([{periodId:p.id,days:16}])
  f.service.cancelLeave(a.id,1,'Причина')
  f.register([{periodId:p.id,days:16}])
  assert.throws(()=>f.personnel.updateEmployee(f.employee.id,{...f.details,hireDate:'2024-01-02'}),code('HIRE_DATE_HAS_LEAVE_PERIODS'))
  f.connection.database.exec("CREATE TRIGGER block_delete BEFORE DELETE ON leave_period_balances BEGIN SELECT RAISE(ABORT,'fail'); END")
  assert.throws(()=>f.personnel.deleteEmployee(f.employee.id))
  assert.equal(f.service.listRecords(f.employee.id).length,2)
  f.connection.database.exec('DROP TRIGGER block_delete')
  f.personnel.deleteEmployee(f.employee.id)
  for(const table of ['employees','leave_records','leave_allocations','leave_period_balances'])
    assert.equal(f.connection.database.prepare('SELECT count(*) n FROM '+table).get().n,0)
  assert.equal(f.connection.database.prepare('SELECT count(*) n FROM departments').get().n,1)
  assert.deepEqual(f.connection.database.pragma('foreign_key_check'),[])
})

test('SQLite UPDATE guards exclude self but reject overlap and direct allocation mutation',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const a=f.register([{periodId:p.id,days:16}])
  const b=f.register([{periodId:p.id,days:10}],{startDate:'2027-05-01',endDate:'2027-05-10',usedDays:10})
  const db=f.connection.database
  db.prepare('UPDATE leave_records SET order_number=? WHERE id=?').run('456',a.id)
  assert.throws(()=>db.prepare('UPDATE leave_records SET start_date=?,end_date=? WHERE id=?').run('2027-05-01','2027-05-16',a.id),/leave overlap/)
  assert.throws(()=>db.prepare('UPDATE leave_allocations SET days=? WHERE record_id=?').run(15,a.id),/replace allocations atomically/)
  assert.deepEqual(f.service.getRecord(b.id),b)
})
