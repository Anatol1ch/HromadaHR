import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { baselineDraft, baselineErrors, baselineInput, baselineLabel } from '../src/components/seniority-ranks/baseline-model.ts'
const zero={years:0,months:0,days:0,asOfDate:'2020-02-29',basisNote:null,autoAccrueAfterBaseline:false}
const code=c=>e=>e.code===c
async function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'hr-baseline-')),file=join(root,'test.db')
 let c=await openStorageSafely(file,migrations.slice(0,13))
 const ledger=c.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
 c.close();c=await openStorageSafely(file)
 assert.equal(c.schemaVersion,21)
 assert.deepEqual(c.database.prepare('SELECT * FROM schema_migrations WHERE version<=13 ORDER BY version').all(),ledger)
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Тест'}).id,positionId=p.createPosition({name:'Тест'}).id
 const details={lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,positionStartedOn: null, positionCategory: null, hireDate:'2026-01-01',employeeType:'official',departmentId,positionId}
 const e=p.createEmployee(details),staff=p.createEmployee({...details,employeeType:'staff'})
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-baseline-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 return {s,p,e,staff,storage,get db(){return c.database},async reopen(){c.close();c=await openStorageSafely(file)}}
}
function integrity(db){assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
test('v13→v14 baseline CRUD, zero, live connection, atomic failures, independence and cascade',async t=>{
 const f=await fixture(t),{s,p,e,staff}=f
 assert.equal(s.getServiceBaseline(e.id),null)
 const first=s.saveServiceBaseline(e.id,zero)
 assert.equal(first.years,0);assert.ok(first.confirmedAt)
 await new Promise(r=>setTimeout(r,5))
 assert.notEqual(s.saveServiceBaseline(e.id,zero).confirmedAt,first.confirmedAt)
 s.saveServiceBaseline(staff.id,{...zero,years:4})
 const basis={documentType:null,documentNumber:null,documentDate:null,reviewOn:null}
 s.saveAllowance(e.id,{...basis,status:'confirmed',percentage:15,effectiveOn:'2020-01-01'})
 s.saveRank(e.id,{...basis,origin:'unknown', reviewAnchorOn:null, originNote:null, rank:13,assignedOn:'2020-01-01',effectiveOn:null})
 const leave=new LeaveService(f.storage,()=>false)
 leave.saveServiceLeaveStart(e.id,'2020-05-01');leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}])
 leave.savePeriods(e.id,[{leaveType:'oms_service_additional',periodStart:'2026-01-01',periodEnd:'2026-12-31',accountingBasis:'initial_balance',confirmedDays:5,referenceEntitlementDays:null}])
 const before={rank:s.getRank(e.id),allowance:s.getAllowance(e.id),start:leave.getServiceLeaveStart(e.id),rights:leave.listRights(e.id),periods:leave.listPeriods(e.id),balances:leave.getBalances(e.id)}
 const updated=s.saveServiceBaseline(e.id,{...zero,years:4,months:8,days:12,basisNote:'Довідка та трудова книжка'})
 assert.equal(updated.months,8)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_service_baselines WHERE employee_id=?').get(e.id).n,1)
 f.db.exec("CREATE TRIGGER test_abort AFTER UPDATE ON employee_service_baselines BEGIN SELECT RAISE(ABORT,'private path'); END")
 assert.throws(()=>s.saveServiceBaseline(e.id,{...zero,years:9}),code('CONFLICT'))
 assert.deepEqual(s.getServiceBaseline(e.id),updated);f.db.exec('DROP TRIGGER test_abort')
 s.getServiceProjection(e.id)
 assert.deepEqual({rank:s.getRank(e.id),allowance:s.getAllowance(e.id),start:leave.getServiceLeaveStart(e.id),rights:leave.listRights(e.id),periods:leave.listPeriods(e.id),balances:leave.getBalances(e.id)},before)
 integrity(f.db);await f.reopen();assert.equal(s.getServiceBaseline(e.id).days,12)
 s.clearServiceBaseline(e.id);s.clearServiceBaseline(e.id);assert.equal(s.getServiceBaseline(e.id),null)
 s.saveServiceBaseline(e.id,zero);p.deleteEmployee(e.id)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_service_baselines WHERE employee_id=?').get(e.id).n,0)
 assert.equal(s.getServiceBaseline(staff.id).years,4)
 for(const method of ['getServiceBaseline','clearServiceBaseline'])assert.throws(()=>s[method](randomUUID()),code('NOT_FOUND'))
 assert.throws(()=>s.saveServiceBaseline(randomUUID(),zero),code('NOT_FOUND'))
 assert.throws(()=>new SeniorityRanksService(f.storage,()=>true).getServiceBaseline(staff.id),code('BUSY'))
 integrity(f.db)
})
test('baseline validates Zod, SQL and UI drafts before IPC',async t=>{
 const {s,e,db}=await fixture(t)
 for(const patch of [{autoAccrueAfterBaseline:0},{autoAccrueAfterBaseline:'true'},{years:-1},{years:1.5},{years:Number.MAX_SAFE_INTEGER+1},{months:12},{days:31},{days:-1},{asOfDate:'2025-02-29'},{asOfDate:'2099-01-01'},{basisNote:'x'.repeat(2001)},{confirmedAt:'injected'}])assert.throws(()=>s.saveServiceBaseline(e.id,{...zero,...patch}),code('INVALID_ARGUMENTS'))
 s.saveServiceBaseline(e.id,zero)
 for(const update of ["years=-1","months=12","days=31","days=1.5","as_of_date='2025-02-29'","as_of_date='2099-01-01'"])assert.throws(()=>db.exec('UPDATE employee_service_baselines SET '+update))
 const draft=baselineDraft(zero);assert.deepEqual(baselineInput(draft),zero)
 assert.equal(baselineLabel({...zero,years:4,months:8,days:12}),'4 роки 8 місяців 12 днів')
 assert.ok(baselineErrors(baselineDraft(null)).years)
 for(const patch of [{years:'1e2'},{years:''},{months:'12'},{days:'-1'},{asOfDate:'31.02.2026'}])assert.throws(()=>baselineInput({...draft,...patch}))
 assert.ok(baselineErrors({...draft,asOfDate:'01.01.2099'}).asOfDate)
 integrity(db)
})
test('baseline preload and typed IPC enforce sender/frame/URL, strict payloads and controlled errors',async t=>{
 const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}}
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.p,new LeaveService(f.storage,()=>false),undefined,undefined,undefined,f.s)
 const event={sender:contents,senderFrame:contents.mainFrame};let exposed
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{exposed=v}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 const api=exposed.seniorityRanks,id=f.e.id
 assert.equal((await api.getServiceBaseline(id)).data,null)
 assert.equal((await api.saveServiceBaseline(id,zero)).data.years,0)
 assert.equal((await api.clearServiceBaseline(id)).ok,true)
 assert.equal((await api.getServiceProjection(id)).data.status,'missing_baseline')
 for(const [channel,args] of [[ipcChannels.seniorityGetServiceBaseline,[id]],[ipcChannels.senioritySaveServiceBaseline,[id,zero]],[ipcChannels.seniorityClearServiceBaseline,[id]]]) {
  const h=handlers.get(channel)
  for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,...args).error.code,'FORBIDDEN')
  contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,...args).error.code,'FORBIDDEN');contents.mainFrame.url=url
  assert.equal(h(event,...args,'extra').error.code,'INVALID_ARGUMENTS')
 }
 assert.equal((await api.saveServiceBaseline(id,{...zero,months:12})).error.code,'INVALID_ARGUMENTS')
 assert.equal((await api.getServiceBaseline(randomUUID())).error.code,'NOT_FOUND')
 f.db.exec("CREATE TRIGGER test_private BEFORE INSERT ON employee_service_baselines BEGIN SELECT RAISE(ABORT,'secret SQL'); END")
 assert.deepEqual(await api.saveServiceBaseline(id,zero),{ok:false,error:{code:'CONFLICT'}})
})

test('v14→v15 defaults existing baselines to false and projection IPC is read-only',async t=>{
 const f=await fixture(t),{s,e,p}=f
 // Real old-schema file with a pre-existing row.
 const root=mkdtempSync(join(tmpdir(),'hr-baseline-'))
 let old=await openStorageSafely(join(root,'old.db'),migrations.slice(0,14))
 const db=old.database
 const department='11111111-1111-4111-8111-111111111111',position='22222222-2222-4222-8222-222222222222',employee='33333333-3333-4333-8333-333333333333'
 db.prepare('INSERT INTO departments(id,name,name_key) VALUES (?,?,?)').run(department,'Тест','Тест')
 db.prepare('INSERT INTO positions(id,name,name_key) VALUES (?,?,?)').run(position,'Тест','Тест')
 db.prepare('INSERT INTO employees(id,last_name,first_name,employee_type,hire_date,position_id,department_id) VALUES (?,?,?,?,?,?,?)').run(employee,'Тест','Тест','official','2020-01-01',position,department)
 db.prepare('INSERT INTO employee_service_baselines VALUES (?,?,?,?,?,?,?)').run(employee,4,0,0,'2020-01-01',null,new Date().toISOString())
 const ledger=db.prepare('SELECT * FROM schema_migrations').all();old.close()
 old=await openStorageSafely(join(root,'old.db'))
 t.after(()=>{old.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-baseline-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 assert.equal(old.database.prepare('SELECT auto_accrue_after_baseline AS flag FROM employee_service_baselines').get().flag,0)
 assert.deepEqual(old.database.prepare('SELECT * FROM schema_migrations WHERE version<=14').all(),ledger)
 assert.throws(()=>old.database.exec('UPDATE employee_service_baselines SET auto_accrue_after_baseline=2'))
 s.saveServiceBaseline(e.id,{...zero,autoAccrueAfterBaseline:true,years:26})
 const basis={documentType:null,documentNumber:null,documentDate:null,reviewOn:'2027-01-01'}
 s.saveAllowance(e.id,{...basis,status:'confirmed',percentage:10,effectiveOn:'2020-01-01'})
 const snapshot=()=>Object.fromEntries(['employee_seniority_allowances','employee_current_ranks','employee_service_baselines','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot();const projection=s.getServiceProjection(e.id)
 assert.equal(projection.percentage,40);assert.equal(projection.comparison,'different')
 assert.deepEqual(snapshot(),before)
 assert.equal(s.getServiceProjection(f.staff.id).status,'not_applicable')
 const handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:null};event.senderFrame=contents.mainFrame
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},p,new LeaveService(f.storage,()=>false),undefined,undefined,undefined,s)
 const h=handlers.get(ipcChannels.seniorityGetServiceProjection)
 assert.equal(h(event,e.id).data.percentage,40)
 for(const args of [[],['bad'],[e.id,'extra']])assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,e.id).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,e.id).error.code,'FORBIDDEN');contents.mainFrame.url=url
 assert.equal(h(event,randomUUID()).error.code,'NOT_FOUND')
 assert.deepEqual(snapshot(),before)
})
