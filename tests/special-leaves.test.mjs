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

function event(f, type='study_leave', extra={}) {
  return {requestId:randomUUID(),employeeId:f.employee.id,leaveType:type,startDate:'2027-06-01',endDate:'2027-06-14',
    usedDays:14,orderNumber:null,orderDate:null,durationExplanation:null,grantBasis:'Підтвердний документ № 1',allocations:[],...extra}
}
function integrity(db) {
  assert.deepEqual(db.pragma('foreign_key_check'),[])
  assert.deepEqual(db.pragma('integrity_check'),[{integrity_check:'ok'}])
}

test('study events share the journal, allow repeated nonoverlapping events and never change balances',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const before=f.service.getBalances(f.employee.id)
  const input=event(f)
  const first=f.service.registerLeave(input)
  assert.deepEqual(first.allocations,[]);assert.equal(first.grantBasis,input.grantBasis)
  assert.deepEqual(f.service.registerLeave(input),first)
  assert.throws(()=>f.service.registerLeave({...input,grantBasis:'Інший документ'}),code('CONFLICT'))
  f.service.registerLeave(event(f,'study_leave',{startDate:'2027-07-01',endDate:'2027-07-31',usedDays:31}))
  assert.equal(f.service.listRecords(null).length,2)
  assert.deepEqual(f.service.getBalances(f.employee.id),before)
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{grantBasis:null,startDate:'2027-08-01',endDate:'2027-08-14'})),code('GRANT_BASIS_REQUIRED'))
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{grantBasis:'  '})),code('INVALID_ARGUMENTS'))
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{allocations:[{periodId:p.id,days:14}]})),code('LEAVE_OVERLAP'))
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{startDate:'2027-08-01',endDate:'2027-08-14',allocations:[{periodId:p.id,days:14}]})),code('INVALID_ARGUMENTS'))
  for(const type of ['study_leave','veteran_special_leave','chernobyl_special_leave']) {
    assert.throws(()=>f.service.savePeriods(f.employee.id,[f.period(2024,30,type)]),code('INVALID_ARGUMENTS'))
    assert.throws(()=>f.service.proposePeriods(f.employee.id,'2027-01-01',type),code('INVALID_ARGUMENTS'))
    assert.throws(()=>f.service.proposeAllocation(f.employee.id,type,14,'2027-08-01','2027-08-14'),code('INVALID_ARGUMENTS'))
  }
  integrity(f.connection.database)
})

test('special limits, explanations, annual uniqueness, start-year attribution and cancellation',async t=>{
  const f=await fixture(t)
  for(const [type,limit,month] of [['veteran_special_leave',14,'06'],['chernobyl_special_leave',16,'08']]) {
    assert.throws(()=>f.service.registerLeave(event(f,type,{startDate:`2027-${month}-01`,endDate:`2027-${month}-20`,usedDays:limit+1,durationExplanation:'Уточнення'})),code('SPECIAL_DURATION'))
    assert.throws(()=>f.service.registerLeave(event(f,type,{startDate:`2027-${month}-01`,endDate:`2027-${month}-10`,usedDays:10})),code('SPECIAL_DURATION'))
    const input=event(f,type,{startDate:`2027-${month}-01`,endDate:`2027-${month}-${limit}`,usedDays:limit})
    const first=f.service.registerLeave(input)
    assert.throws(()=>f.service.registerLeave(event(f,type,{startDate:'2027-10-01',endDate:`2027-10-${limit}`,usedDays:limit})),code('SPECIAL_YEAR_CONFLICT'))
    const cancelled=f.service.cancelLeave(first.id,first.revision,'Помилкове надання')
    assert.equal(cancelled.status,'cancelled')
    const next=f.service.registerLeave({...input,requestId:randomUUID(),usedDays:limit-1,durationExplanation:'Підтверджена менша тривалість'})
    assert.equal(next.usedDays,limit-1)
  }
  const cross=f.service.registerLeave(event(f,'veteran_special_leave',{startDate:'2028-12-25',endDate:'2029-01-07'}))
  assert.equal(cross.startDate.slice(0,4),'2028')
  assert.equal(overlapsYear(cross,'2028'),true);assert.equal(overlapsYear(cross,'2029'),true);assert.equal(overlapsYear(cross,'2027'),false)
  const nextYear=f.service.registerLeave(event(f,'veteran_special_leave',{startDate:'2029-03-01',endDate:'2029-03-14'}))
  assert.throws(()=>f.service.updateLeave(f.update(nextYear,{startDate:'2028-03-01',endDate:'2028-03-14',grantBasis:nextYear.grantBasis})),code('SPECIAL_YEAR_CONFLICT'))
  assert.equal(f.service.getRecord(nextYear.id).revision,1)
  assert.deepEqual(f.service.getBalances(f.employee.id),[])
  assert.deepEqual(f.service.listPeriods(f.employee.id),[])
  integrity(f.connection.database)
})

test('type changes atomically release and restore period consumption with immutable creation identity',async t=>{
  const f=await fixture(t)
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  let record=f.register([{periodId:p.id,days:16}])
  const identity=f.connection.database.prepare('SELECT request_id,request_json,created_at FROM leave_records WHERE id=?').get(record.id)
  record=f.service.updateLeave(f.update(record,{leaveType:'study_leave',allocations:[],grantBasis:'Довідка-виклик'}))
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,30)
  assert.deepEqual(record.allocations,[])
  assert.equal(matchesUpdate(record,f.update({...record,revision:record.revision-1},{grantBasis:'Довідка-виклик'})),true)
  assert.equal(matchesUpdate(record,f.update({...record,revision:record.revision-1},{grantBasis:'Інша'})),false)
  assert.throws(()=>f.service.updateLeave(f.update(record,{leaveType:'annual_main',allocations:[]})),code('INVALID_ARGUMENTS'))
  assert.equal(f.service.getRecord(record.id).leaveType,'study_leave')
  record=f.service.updateLeave(f.update(record,{leaveType:'annual_main',allocations:[{periodId:p.id,days:16}]}))
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,14)
  assert.deepEqual(f.connection.database.prepare('SELECT request_id,request_json,created_at FROM leave_records WHERE id=?').get(record.id),identity)
  const replay=f.service.registerLeave(JSON.parse(identity.request_json))
  assert.equal(replay.revision,record.revision)
  assert.throws(()=>f.service.updateLeave(f.update(record,{leaveType:'chernobyl_special_leave',allocations:[],grantBasis:null})),code('GRANT_BASIS_REQUIRED'))
  record=f.service.updateLeave(f.update(record,{leaveType:'chernobyl_special_leave',allocations:[],grantBasis:'Категорію перевірено'}))
  record=f.service.updateLeave(f.update(record,{leaveType:'veteran_special_leave',usedDays:14,durationExplanation:'Уточнення',allocations:[],grantBasis:'Статус перевірено'}))
  assert.equal(record.leaveType,'veteran_special_leave')
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,30)
  integrity(f.connection.database)
})

test('shared date, duration and overlap checks cover every event type',async t=>{
  const f=await fixture(t)
  for(const type of ['study_leave','veteran_special_leave','chernobyl_special_leave']) {
    for(const extra of [
      {startDate:'2027-02-30'}, {endDate:'2027-05-31'}, {usedDays:0}, {usedDays:1.5}, {usedDays:15},
      {usedDays:10,durationExplanation:null},
    ]) assert.throws(()=>f.service.registerLeave(event(f,type,extra)))
    assert.throws(()=>f.service.registerLeave(event(f,type,{startDate:'2026-12-25',endDate:'2027-01-07'})),code('TRANSITION_LEAVE'))
  }
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const annual=f.register([{periodId:p.id,days:16}])
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{startDate:annual.startDate,endDate:annual.endDate,usedDays:16})),code('LEAVE_OVERLAP'))
  const study=f.service.registerLeave(event(f))
  assert.throws(()=>f.service.registerLeave(event(f,'veteran_special_leave')),code('LEAVE_OVERLAP'))
  assert.throws(()=>f.service.updateLeave(f.update(study,{startDate:annual.startDate,endDate:annual.endDate,durationExplanation:'Уточнення',grantBasis:study.grantBasis})),code('LEAVE_OVERLAP'))
  assert.throws(()=>f.service.updateLeave(f.update(study,{expectedRevision:2,grantBasis:study.grantBasis})),code('STALE_REVISION'))
  const future=f.personnel.createEmployee({...f.details,hireDate:'2028-01-01',firstName:'Інший'})
  assert.throws(()=>f.service.registerLeave({...event(f),employeeId:future.id}),code('INVALID_ARGUMENTS'))
  integrity(f.connection.database)
})

test('failed event creation and mid-conversion update leave no partial writes',async t=>{
  const f=await fixture(t)
  const db=f.connection.database
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const annual=f.register([{periodId:p.id,days:16}])
  db.exec("CREATE TRIGGER test_update_failure AFTER UPDATE ON leave_records BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.service.updateLeave(f.update(annual,{leaveType:'study_leave',allocations:[],grantBasis:'Підстава'})))
  assert.deepEqual(f.service.getRecord(annual.id),annual)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,14)
  db.exec('DROP TRIGGER test_update_failure;')
  const study=f.service.registerLeave(event(f))
  db.exec("CREATE TRIGGER test_allocate_failure BEFORE INSERT ON leave_allocations BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.service.updateLeave(f.update(study,{leaveType:'annual_main',allocations:[{periodId:p.id,days:14}]})))
  assert.deepEqual(f.service.getRecord(study.id),study)
  db.exec('DROP TRIGGER test_allocate_failure;')
  db.exec("CREATE TRIGGER test_create_failure AFTER INSERT ON leave_records BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.service.registerLeave(event(f,'study_leave',{startDate:'2027-09-01',endDate:'2027-09-14'})))
  assert.equal(f.service.listRecords(null).length,2)
  integrity(db)
})

async function legacyV8(t,version=8) {
  const f=await fixture(t,migrations.slice(0,version))
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const input={requestId:randomUUID(),employeeId:f.employee.id,leaveType:'annual_main',startDate:'2027-04-05',endDate:'2027-04-20',
    usedDays:16,orderNumber:'42',orderDate:'2027-04-01',durationExplanation:null,allocations:[{periodId:p.id,days:16}]}
  const db=f.connection.database
  const activeId=randomUUID(),cancelledId=randomUUID()
  const insert=db.prepare(`INSERT INTO leave_records(id,request_id,request_json,employee_id,leave_type,start_date,end_date,
    used_days,order_number,order_date,duration_explanation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
  insert.run(activeId,input.requestId,JSON.stringify(input),input.employeeId,input.leaveType,input.startDate,input.endDate,
    input.usedDays,input.orderNumber,input.orderDate,null,'2026-11-07T00:00:00.000Z')
  db.prepare('INSERT INTO leave_allocations VALUES (?,?,?)').run(activeId,p.id,16)
  const cancelledInput={...input,requestId:randomUUID(),startDate:'2027-05-01',endDate:'2027-05-02',usedDays:2,orderNumber:null,orderDate:null,allocations:[{periodId:p.id,days:2}]}
  insert.run(cancelledId,cancelledInput.requestId,JSON.stringify(cancelledInput),input.employeeId,'annual_main','2027-05-01','2027-05-02',2,null,null,null,'2026-11-07T00:00:00.000Z')
  db.prepare('INSERT INTO leave_allocations VALUES (?,?,?)').run(cancelledId,p.id,2)
  if(version===8) {
    db.prepare('UPDATE leave_records SET revision=4 WHERE id=?').run(activeId)
    db.prepare("UPDATE leave_records SET status='cancelled',revision=5,cancelled_at=?,cancel_reason=? WHERE id=?")
      .run('2026-11-07T01:00:00.000Z','Помилково',cancelledId)
  } else db.prepare("UPDATE leave_records SET status='cancelled' WHERE id=?").run(cancelledId)
  const rows=db.prepare('SELECT * FROM leave_records ORDER BY id').all()
  const allocations=db.prepare('SELECT * FROM leave_allocations ORDER BY record_id').all()
  const periods=db.prepare('SELECT * FROM leave_period_balances').all()
  f.connection.close()
  return {...f,p,input,cancelledInput,activeId,cancelledId,rows,allocations,periods}
}

test('v8 rebuild preserves every row, relation, trigger, cancellation and legacy idempotency',async t=>{
  const f=await legacyV8(t)
  const upgraded=await openStorageSafely(f.file);f.handles.push(upgraded)
  assert.equal(upgraded.schemaVersion,9)
  const db=upgraded.database,service=new LeaveService({getDatabase:()=>db},()=>false)
  assert.deepEqual(db.prepare('SELECT * FROM leave_records ORDER BY id').all().map(({grant_basis,...row})=>{assert.equal(grant_basis,null);return row}),f.rows)
  assert.deepEqual(db.prepare('SELECT * FROM leave_allocations ORDER BY record_id').all(),f.allocations)
  assert.deepEqual(db.prepare('SELECT * FROM leave_period_balances').all(),f.periods)
  assert.equal(service.getBalances(f.employee.id)[0].availableDays,14)
  assert.equal(service.getRecord(f.cancelledId).cancelReason,'Помилково')
  assert.equal(service.registerLeave(f.input).id,f.activeId)
  assert.equal(service.registerLeave({...f.input,grantBasis:null}).revision,4)
  assert.throws(()=>service.registerLeave({...f.input,grantBasis:'Нова підстава'}),code('CONFLICT'))
  const names=db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'leave_%' ORDER BY name").all().map(x=>x.name)
  assert.deepEqual(names,['leave_allocation_insert','leave_allocation_no_update','leave_employee_delete','leave_period_balances_no_overlap_insert',
    'leave_period_balances_no_overlap_update','leave_period_protect_update','leave_record_allocation_mode_update','leave_record_identity_update','leave_record_no_overlap','leave_record_no_overlap_update'])
  assert.equal(db.pragma('foreign_key_list(leave_allocations)').find(x=>x.from==='record_id').table,'leave_records')
  assert.equal(db.pragma('foreign_key_list(leave_allocations)').find(x=>x.from==='period_id').on_delete,'RESTRICT')
  assert.equal(db.pragma('foreign_key_list(leave_records)').find(x=>x.from==='employee_id').on_delete,'CASCADE')
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE '%_v9'").get().n,0)
  const indexNames=db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'leave_%'").all().map(x=>x.name)
  for(const name of ['leave_records_special_year','leave_records_employee_dates','leave_allocations_period']) assert.ok(indexNames.includes(name))
  assert.throws(()=>service.deletePeriod(f.p.id),code('PERIOD_IN_USE'))
  integrity(db)
  const protection=join(f.root,'data','protection')
  const copy=join(protection,readdirSync(protection).find(x=>x.includes('protect-migration-v9-')))
  assert.equal(inspectDatabase(copy),8)
})

test('v9 is protected and failed rebuild rolls back tables, rows, triggers and migration ledger',async t=>{
  const f=await legacyV8(t)
  const protection=join(f.root,'data','protection')
  renameSync(protection,protection+'-saved');writeFileSync(protection,'blocked')
  await assert.rejects(openStorageSafely(f.file))
  let check=new Database(f.file,{readonly:true})
  assert.equal(check.pragma('user_version',{simple:true}),8);integrity(check);check.close()
  rmSync(protection)
  const broken=[...migrations.slice(0,8),{...migrations[8],sql:migrations[8].sql+' INVALID SQL;'}]
  await assert.rejects(openStorageSafely(f.file,broken))
  check=new Database(f.file,{readonly:true})
  assert.equal(check.pragma('user_version',{simple:true}),8)
  assert.deepEqual(check.prepare('SELECT * FROM leave_records ORDER BY id').all(),f.rows)
  assert.deepEqual(check.prepare('SELECT * FROM leave_allocations ORDER BY record_id').all(),f.allocations)
  assert.equal(check.prepare("SELECT 1 FROM sqlite_schema WHERE name='leave_record_no_overlap_update'").get()['1'],1)
  integrity(check);check.close()
})

test('restore v7 and v8 migrates immutable sources, including edited/cancelled records',async t=>{
  for(const version of [7,8]) {
    const f=await legacyV8(t,version),before=readFileSync(f.file)
    const storage=new Storage(),backup=new BackupService(storage)
    f.handles.push({close:()=>{backup.stop();backup.invalidateSelections();storage.close()}})
    await storage.initializeSafely(()=>join(f.root,'restore','app.db'))
    const selection=await backup.chooseRestore(async()=>f.file)
    assert.equal(selection.schemaVersion,version)
    await backup.confirmRestore(selection.token,async()=>true)
    assert.deepEqual(readFileSync(f.file),before)
    assert.equal(storage.getStatus().schemaVersion,9)
    const service=new LeaveService(storage,()=>backup.isBusy())
    assert.equal(service.registerLeave(f.input).id,f.activeId)
    assert.equal(service.getRecord(f.cancelledId).status,'cancelled')
    assert.equal(service.registerLeave(f.cancelledInput).status,'cancelled')
    assert.equal(service.getBalances(f.employee.id)[0].availableDays,14)
    integrity(storage.getDatabase())
  }
})

test('v9 SQL guards, cancellation and employee cascade preserve all accounting modes atomically',async t=>{
  const f=await fixture(t),db=f.connection.database
  const [p]=f.service.savePeriods(f.employee.id,[f.period(2024,30)])
  const annual=f.register([{periodId:p.id,days:16}])
  const special=f.service.registerLeave(event(f,'veteran_special_leave'))
  const study=f.service.registerLeave(event(f,'study_leave',{startDate:'2027-08-01',endDate:'2027-08-14'}))
  assert.throws(()=>db.prepare("UPDATE leave_records SET leave_type='study_leave',grant_basis='Підстава' WHERE id=?").run(annual.id))
  assert.throws(()=>db.prepare('INSERT INTO leave_allocations VALUES (?,?,?)').run(special.id,p.id,1))
  assert.throws(()=>db.prepare("UPDATE leave_records SET start_date='2027-04-05',end_date='2027-04-18' WHERE id=?").run(study.id))
  const duplicate=event(f,'veteran_special_leave',{startDate:'2027-09-01',endDate:'2027-09-14'})
  assert.throws(()=>db.prepare(`INSERT INTO leave_records(id,request_id,request_json,employee_id,leave_type,start_date,end_date,used_days,created_at,grant_basis)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),duplicate.requestId,'{}',f.employee.id,duplicate.leaveType,duplicate.startDate,duplicate.endDate,14,'now',duplicate.grantBasis))
  assert.throws(()=>db.prepare("UPDATE leave_records SET grant_basis=NULL WHERE id=?").run(special.id))
  assert.throws(()=>db.prepare("UPDATE leave_records SET used_days=15,end_date='2027-06-15' WHERE id=?").run(special.id))
  const cancelled=f.service.cancelLeave(special.id,1,'Помилка')
  assert.deepEqual(f.service.cancelLeave(special.id,1,'Повтор'),cancelled)
  f.service.registerLeave({...duplicate,startDate:special.startDate,endDate:special.endDate})
  assert.throws(()=>f.service.updateLeave(f.update(cancelled,{grantBasis:cancelled.grantBasis})),code('LEAVE_CANCELLED'))
  db.exec("CREATE TRIGGER test_delete_failure BEFORE DELETE ON leave_period_balances BEGIN SELECT RAISE(ABORT,'test'); END;")
  assert.throws(()=>f.personnel.deleteEmployee(f.employee.id))
  assert.equal(f.service.listRecords(null).length,4)
  assert.equal(f.service.getBalances(f.employee.id)[0].availableDays,14)
  db.exec('DROP TRIGGER test_delete_failure;')
  f.personnel.deleteEmployee(f.employee.id)
  for(const table of ['employees','leave_records','leave_allocations','leave_period_balances']) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0)
  assert.equal(db.prepare('SELECT count(*) n FROM departments').get().n,1)
  assert.equal(db.prepare('SELECT count(*) n FROM positions').get().n,1)
  integrity(db)
})
