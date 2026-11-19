import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { snapshotDraft,snapshotErrors,snapshotInput,serviceDurationLabel } from '../src/components/seniority-ranks/service-accounting-model.ts'
const snapshot={mode:'snapshot',years:0,months:0,days:0,asOfDate:'2020-02-29'}
const code=c=>e=>e.code===c
async function fixture(t,migrationCount=13) {
 const root=mkdtempSync(join(tmpdir(),'hr-service-accounting-')),file=join(root,'test.db')
 let c=await openStorageSafely(file,migrations.slice(0,migrationCount));c.close();c=await openStorageSafely(file)
 assert.equal(c.schemaVersion,22)
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Тест'}).id,positionId=p.createPosition({name:'Тест'}).id
 const details={lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,positionStartedOn:null,positionCategory:null,hireDate:'2026-01-01',employeeType:'official',departmentId,positionId}
 const e=p.createEmployee(details),staff=p.createEmployee({...details,employeeType:'staff'})
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-service-accounting-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 return {s,p,e,staff,storage,get db(){return c.database},async reopen(){c.close();c=await openStorageSafely(file)}}
}
function integrity(db){assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
test('service accounting CRUD preserves other HR data, replaces modes atomically and cascades',async t=>{
 const f=await fixture(t),{s,p,e,staff}=f,zero={...snapshot}
 assert.equal(s.getServiceAccounting(e.id),null)
 const saved=s.saveServiceAccounting(e.id,zero);assert.equal(saved.mode,'snapshot');assert.ok(saved.confirmedAt)
 const period={mode:'periods',periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2020-01-31'},{id:randomUUID(),startDate:'2020-03-01',endDate:null}]}
 const periods=s.saveServiceAccounting(e.id,period);assert.equal(periods.periods.length,2)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_service_periods WHERE employee_id=?').get(e.id).n,2)
 const basis={documentType:null,documentNumber:null,documentDate:null,reviewOn:null}
 s.saveAllowance(e.id,{...basis,status:'confirmed',percentage:15,effectiveOn:'2020-01-01'})
 const before=s.getAllowance(e.id)
 s.saveServiceAccounting(e.id,{mode:'continuous',startDate:'2019-01-01'})
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_service_periods WHERE employee_id=?').get(e.id).n,0)
 assert.equal(s.getServiceAccounting(e.id).mode,'continuous');assert.deepEqual(s.getAllowance(e.id),before)
 assert.throws(()=>s.saveServiceAccounting(e.id,{mode:'periods',periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2020-01-03'},{id:randomUUID(),startDate:'2020-01-03',endDate:null}]}),code('INVALID_ARGUMENTS'))
 assert.equal(s.getServiceAccounting(e.id).mode,'continuous')
 await f.reopen();assert.equal(s.getServiceAccounting(e.id).startDate,'2019-01-01')
 s.clearServiceAccounting(e.id);s.clearServiceAccounting(e.id);assert.equal(s.getServiceAccounting(e.id),null)
 s.saveServiceAccounting(staff.id,zero);p.deleteEmployee(staff.id);assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_service_records WHERE employee_id=?').get(staff.id).n,0)
 integrity(f.db)
})
test('service accounting rejects invalid dates, overlap, multiple open periods and bad snapshot components',async t=>{
 const {s,e,db}=await fixture(t)
 const mk=(patch={})=>({mode:'periods',periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2020-01-31'},{id:randomUUID(),startDate:'2020-02-01',endDate:null}],...patch})
 for(const input of [
  {mode:'snapshot',years:-1,months:0,days:0,asOfDate:'2020-01-01'},
  {mode:'snapshot',years:0,months:12,days:0,asOfDate:'2020-01-01'},
  {mode:'snapshot',years:0,months:0,days:31,asOfDate:'2020-01-01'},
  {mode:'continuous',startDate:'2099-01-01'},
  mk({periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2020-02-02'},{id:randomUUID(),startDate:'2020-02-01',endDate:null}]}),
  mk({periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:null},{id:randomUUID(),startDate:'2020-02-01',endDate:null}]}),
  mk({periods:[{id:randomUUID(),startDate:'2020-02-01',endDate:null},{id:randomUUID(),startDate:'2020-01-01',endDate:'2020-01-31'}]}),
  mk({periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2019-12-31'}]}),
  mk({periods:[{id:randomUUID(),startDate:'2020-01-01',endDate:'2099-01-01'}]}),
 ])assert.throws(()=>s.saveServiceAccounting(e.id,input),code('INVALID_ARGUMENTS'))
 db.prepare("INSERT INTO employee_service_records(employee_id,mode,start_date,confirmed_at) VALUES (?,'continuous','2020-01-01',?)").run(e.id,new Date().toISOString())
 assert.throws(()=>db.prepare("INSERT INTO employee_service_periods(id,employee_id,start_date,end_date) VALUES (?,?,?,NULL)").run(randomUUID(),e.id,'2020-01-01'),/invalid service period/)
 integrity(db)
})
test('snapshot draft model has no legacy switch or basis and keeps Ukrainian duration labels',()=>{
 const draft=snapshotDraft(null);assert.deepEqual(snapshotInput({...draft,years:'4',months:'8',days:'12',asOfDate:'29.02.2020'}),{mode:'snapshot',years:4,months:8,days:12,asOfDate:'2020-02-29'})
 assert.equal(serviceDurationLabel({years:4,months:8,days:12}),'4 роки 8 місяців 12 днів')
 assert.ok(snapshotErrors(draft).years);assert.ok(snapshotErrors({...draft,years:'1e2'}).years)
 assert.ok(snapshotErrors({...draft,asOfDate:'01.01.2099'}).asOfDate)
})
test('new accounting IPC supports draft preview, strict contracts and sender/frame/URL guards',async t=>{
 const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}}
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.p,undefined,undefined,undefined,undefined,f.s)
 const event={sender:contents,senderFrame:contents.mainFrame},id=f.e.id;let exposed
 runInNewContext(await (await import('node:fs')).readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{exposed=v}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 const api=exposed.seniorityRanks
 assert.equal((await api.getServiceAccounting(id)).data,null)
 const preview=await api.previewServiceAccounting(id,snapshot,'2020-03-01');assert.equal(preview.data.calculation.current.years,0)
 assert.equal((await api.getServiceAccounting(id)).data,null)
 assert.equal((await api.saveServiceAccounting(id,snapshot)).data.mode,'snapshot')
 assert.equal((await api.clearServiceAccounting(id)).ok,true)
 assert.equal((await api.getServiceProjection(id)).data.status,'missing_service_data')
 const cases=[[ipcChannels.seniorityGetServiceAccounting,[id]],[ipcChannels.seniorityPreviewServiceAccounting,[id,snapshot,'2020-03-01']],[ipcChannels.senioritySaveServiceAccounting,[id,snapshot]],[ipcChannels.seniorityClearServiceAccounting,[id]]]
 for(const [channel,args] of cases){const h=handlers.get(channel);for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,...args).error.code,'FORBIDDEN');contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,...args).error.code,'FORBIDDEN');contents.mainFrame.url=url;assert.equal(h(event,...args,'extra').error.code,'INVALID_ARGUMENTS')}
 assert.equal((await api.saveServiceAccounting(id,{mode:'snapshot',...snapshot,months:12})).error.code,'INVALID_ARGUMENTS')
 assert.equal((await api.getServiceAccounting(randomUUID())).error.code,'NOT_FOUND')
})
test('v21 migration preserves only unambiguous auto-accruing snapshots and leaves other data intact',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-service-migration-')),file=join(root,'old.db');let old=await openStorageSafely(file,migrations.slice(0,15));const db=old.database
 const department='11111111-1111-4111-8111-111111111111',position='22222222-2222-4222-8222-222222222222',yes='33333333-3333-4333-8333-333333333333',no='44444444-4444-4444-8444-444444444444'
 db.prepare('INSERT INTO departments(id,name,name_key) VALUES (?,?,?)').run(department,'Тест','Тест');db.prepare('INSERT INTO positions(id,name,name_key) VALUES (?,?,?)').run(position,'Тест','Тест')
 const insertEmployee=db.prepare('INSERT INTO employees(id,last_name,first_name,employee_type,hire_date,position_id,department_id) VALUES (?,?,?,?,?,?,?)')
 insertEmployee.run(yes,'Так','Приклад','official','2020-01-01',position,department);insertEmployee.run(no,'Ні','Приклад','official','2020-01-01',position,department)
 db.prepare('INSERT INTO employee_service_baselines VALUES (?,?,?,?,?,?,?,?)').run(yes,4,2,3,'2020-01-01',null,new Date().toISOString(),1)
 db.prepare('INSERT INTO employee_service_baselines VALUES (?,?,?,?,?,?,?,?)').run(no,2,0,0,'2020-01-01',null,new Date().toISOString(),0)
 db.prepare("INSERT INTO employee_seniority_allowances(employee_id,status,percentage,effective_on,confirmed_at) VALUES (?,'confirmed',10,'2020-01-01',?)").run(yes,new Date().toISOString())
 old.close();old=await openStorageSafely(file);t.after(()=>{old.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-service-migration-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 assert.equal(old.schemaVersion,22);assert.deepEqual(old.database.prepare('SELECT * FROM employee_service_records').all().map(r=>[r.employee_id,r.mode,r.years,r.months,r.days]),[[yes,'snapshot',4,2,3]])
 assert.equal(old.database.prepare('SELECT count(*) AS n FROM employees').get().n,2);assert.equal(old.database.prepare('SELECT count(*) AS n FROM employee_seniority_allowances').get().n,1)
 assert.equal(old.database.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='employee_service_baselines'").get().n,0);integrity(old.database)
})
