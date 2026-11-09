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
import { overlapsYear } from '../src/components/leave/presentation.ts'
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

test('rights are explicit, six independent current states and never award or gate days',async t=>{
  const f=await fixture(t)
  const types=['annual_main','oms_service_additional','children_social_additional','study_leave','veteran_special_leave','chernobyl_special_leave']
  assert.deepEqual(f.service.listRights(f.employee.id),[])
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  assert.deepEqual(f.service.listRights(f.employee.id),[])
  let rights=f.service.saveRights(f.employee.id,types.map(leaveType=>({leaveType,status:'no_right'})))
  assert.equal(rights.length,6);assert.ok(rights.every(r=>r.checkedAt.endsWith('Z')))
  const before=f.service.getBalances(f.employee.id)
  const record=f.register([{periodId:p.id,days:16}])
  assert.equal(f.service.listRights(f.employee.id).find(r=>r.leaveType==='annual_main').status,'no_right')
  rights=f.service.saveRights(f.employee.id,[{leaveType:'study_leave',status:'has_right'}])
  assert.equal(rights.find(r=>r.leaveType==='study_leave').status,'has_right')
  assert.equal(rights.find(r=>r.leaveType==='veteran_special_leave').status,'no_right')
  assert.deepEqual(f.service.getRecord(record.id),record)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,14)
  f.service.saveRights(f.employee.id,[{leaveType:'study_leave',status:null}])
  assert.equal(f.service.listRights(f.employee.id).length,5)
  f.service.cancelLeave(record.id,record.revision,'Помилка')
  assert.deepEqual(f.service.getBalances(f.employee.id),before)
  const cancelled = f.service.getRecord(record.id)
  f.service.savePeriods(f.employee.id,[f.period(2024,28)])
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,28)
  assert.deepEqual(f.service.getRecord(record.id),cancelled)
  assert.equal(f.service.listRights(f.employee.id).find(right => right.leaveType === 'annual_main').status,'no_right')
  const second=f.personnel.createEmployee({...f.details,firstName:'Другий'})
  assert.deepEqual(f.service.listRights(second.id),[])
  f.connection.database.exec("CREATE TRIGGER test_right_delete_failure BEFORE DELETE ON employee_leave_rights BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.personnel.deleteEmployee(f.employee.id))
  assert.equal(f.service.listRights(f.employee.id).length,5)
  assert.equal(f.service.listRecords(f.employee.id).length,1)
  f.connection.database.exec('DROP TRIGGER test_right_delete_failure;')
  f.personnel.deleteEmployee(f.employee.id)
  assert.equal(f.connection.database.prepare('SELECT count(*) n FROM employee_leave_rights').get().n,0)
  assert.deepEqual(f.connection.database.pragma('foreign_key_check'),[])
})

test('rights validation, busy guards and partial write rollback are controlled',async t=>{
  const f=await fixture(t),db=f.connection.database
  const initial=f.service.saveRights(f.employee.id,[{leaveType:'annual_main',status:'has_right'}])
  for(const input of [[],[{leaveType:'unknown',status:'has_right'}],[{leaveType:'annual_main',status:'maybe'}],[{leaveType:'annual_main',status:'has_right',checkedAt:'forged'}],[{leaveType:'annual_main',status:null},{leaveType:'annual_main',status:'has_right'}]])assert.throws(()=>f.service.saveRights(f.employee.id,input),code('INVALID_ARGUMENTS'))
  assert.throws(()=>f.service.saveRights(randomUUID(),[{leaveType:'annual_main',status:'has_right'}]),code('NOT_FOUND'))
  const busy=new LeaveService({getDatabase:()=>db},()=>true)
  assert.throws(()=>busy.listRights(f.employee.id),code('BUSY'))
  assert.throws(()=>busy.saveRights(f.employee.id,[{leaveType:'annual_main',status:null}]),code('BUSY'))
  db.exec("CREATE TRIGGER test_right_failure BEFORE INSERT ON employee_leave_rights WHEN NEW.leave_type='study_leave' BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.service.saveRights(f.employee.id,[{leaveType:'annual_main',status:'no_right'},{leaveType:'study_leave',status:'has_right'}]))
  assert.deepEqual(f.service.listRights(f.employee.id),initial)
  db.exec('DROP TRIGGER test_right_failure;')
  assert.throws(()=>db.prepare('INSERT INTO employee_leave_rights VALUES (?,?,?,?)').run(f.employee.id,'wrong','has_right','now'))
  assert.deepEqual(db.pragma('integrity_check'),[{integrity_check:'ok'}])
})

test('v9 to v11 preserves registrations, cancellations, balances and protective source; restore remains immutable',async t=>{
  const f=await fixture(t,migrations.slice(0,9))
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const record=f.register([{periodId:p.id,days:16}])
  f.service.cancelLeave(record.id,1,'Тест')
  const db=f.connection.database
  const before=Object.fromEntries(['employees','departments','positions','leave_records','leave_allocations','leave_period_balances'].map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]))
  f.connection.close()
  const source=readFileSync(f.file)
  const storage=new Storage(),backup=new BackupService(storage)
  f.handles.push({close:()=>{backup.stop();backup.invalidateSelections();storage.close()}})
  await storage.initializeSafely(()=>join(f.root,'restored','app.db'))
  const selected=await backup.chooseRestore(async()=>f.file)
  assert.equal(selected.schemaVersion,9)
  const beforeRestoreService=new LeaveService(storage,()=>backup.isBusy())
  await backup.confirmRestore(selected.token,async()=>true)
  assert.deepEqual(readFileSync(f.file),source)
  assert.equal(storage.getStatus().schemaVersion,11)
  const live=storage.getDatabase()
  for(const [table,rows] of Object.entries(before))assert.deepEqual(live.prepare(`SELECT * FROM ${table}`).all(),rows)
  assert.deepEqual(beforeRestoreService.listRights(f.employee.id),[])
  assert.deepEqual(live.pragma('foreign_key_check'),[])
  assert.deepEqual(live.pragma('integrity_check'),[{integrity_check:'ok'}])
  const upgraded=await openStorageSafely(f.file);f.handles.push(upgraded)
  assert.equal(upgraded.schemaVersion,11)
  const protection=join(f.root,'data','protection')
  assert.equal(inspectDatabase(join(protection,readdirSync(protection).find(x=>x.includes('protect-migration-v10-')))),9)
})

test('v10 refuses DDL without protection and rolls back a failed migration',async t=>{
  const f=await fixture(t,migrations.slice(0,9));f.connection.close()
  const protection=join(f.root,'data','protection')
  renameSync(protection,protection+'-saved');writeFileSync(protection,'blocked')
  await assert.rejects(openStorageSafely(f.file));rmSync(protection)
  await assert.rejects(openStorageSafely(f.file,[...migrations.slice(0,9),{...migrations[9],sql:migrations[9].sql+' INVALID SQL;'}]))
  const db=new Database(f.file,{readonly:true})
  assert.equal(db.pragma('user_version',{simple:true}),9)
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='employee_leave_rights'").get(),undefined)
  db.close()
})
