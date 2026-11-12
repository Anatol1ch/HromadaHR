import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { employeeInput, valuesForEmployee, changeAppointment, validateEmployee } from '../src/employees/model.ts'
const code=c=>e=>e.code===c
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'hr-appointment-')),file=join(root,'test.db')
 let c=await openStorageSafely(file,migrations.slice(0,15))
 const db=c.database,id=randomUUID(),departmentId=randomUUID(),positionId=randomUUID()
 db.prepare('INSERT INTO departments(id,name,name_key) VALUES (?,?,?)').run(departmentId,'Тест','Тест')
 db.prepare('INSERT INTO positions(id,name,name_key) VALUES (?,?,?)').run(positionId,'Тест','Тест')
 db.prepare('INSERT INTO employees(id,last_name,first_name,employee_type,hire_date,position_id,department_id) VALUES (?,?,?,?,?,?,?)').run(id,'Тест','Умовний','official','2020-01-01',positionId,departmentId)
 const ledger=db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();c.close();c=await openStorageSafely(file)
 assert.equal(c.schemaVersion,16);assert.deepEqual(c.database.prepare('SELECT * FROM schema_migrations WHERE version<=15 ORDER BY version').all(),ledger)
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false)
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-appointment-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 return {db:c.database,p,storage,id,input:{lastName:'Тест',firstName:'Умовний',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',positionId,departmentId,positionStartedOn:null,positionCategory:null}}
}
function integrity(db){assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
test('v15→v16 leaves unknown appointment fields null; CRUD, categories and type rules',async t=>{
 const {p,id,input,db}=await fixture(t)
 assert.equal(p.getEmployee(id).positionStartedOn,null);assert.equal(p.getEmployee(id).positionCategory,null)
 const e=p.createEmployee(input);assert.equal(e.positionCategory,null)
 const created=p.createEmployee({...input,positionCategory:'VII',positionStartedOn:'2024-01-01'})
 assert.equal(created.positionCategory,'VII');assert.equal(created.positionStartedOn,'2024-01-01')
 const staff=p.createEmployee({...input,employeeType:'staff',positionStartedOn:'2024-01-01'})
 assert.equal(staff.positionStartedOn,'2024-01-01');assert.equal(staff.positionCategory,null)
 for(const positionCategory of ['I','II','III','IV','V','VI','VII']){
  const value=p.updateEmployee(id,{...input,positionStartedOn:'2024-06-15',positionCategory})
  assert.equal(value.positionCategory,positionCategory);assert.equal(p.getEmployee(id).positionStartedOn,'2024-06-15')
  assert.equal(p.listEmployees().find(e=>e.id===id).positionCategory,positionCategory)
 }
 assert.throws(()=>db.prepare("UPDATE employees SET hire_date='2025-01-01' WHERE id=?").run(id))
 const existing=p.getEmployee(id)
 p.updateEmployee(id,{...input,firstName:'Виправлено',positionCategory:existing.positionCategory,positionStartedOn:existing.positionStartedOn})
 assert.equal(p.getEmployee(id).positionCategory,'VII');assert.equal(p.getEmployee(id).positionStartedOn,'2024-06-15')
 for(const patch of [{positionCategory:'VIII'},{positionCategory:'v'},{positionStartedOn:'2026-02-30'},{positionStartedOn:'2099-01-01'},{positionStartedOn:'2019-12-31'},{employeeType:'staff',positionCategory:'VII'}])assert.throws(()=>p.createEmployee({...input,...patch}),code('INVALID_ARGUMENTS'))
 p.updateEmployee(id,{...input,employeeType:'staff',positionCategory:null})
 assert.equal(p.getEmployee(id).positionCategory,null)
 p.updateEmployee(id,input);assert.equal(p.getEmployee(id).positionCategory,null)
 for(const sql of ["position_category='VIII'","position_started_on='2026-02-30'","position_started_on='2099-01-01'","position_started_on='2019-01-01'","employee_type='staff',position_category='I'"])assert.throws(()=>db.exec('UPDATE employees SET '+sql))
 integrity(db)
})
test('new context rejects stale appointment until explicit review; form resets dependent drafts',async t=>{
 const {p,id,input,db}=await fixture(t),old={...input,positionStartedOn:'2024-01-01',positionCategory:'VII'}
 p.updateEmployee(id,old)
 const position=p.createPosition({name:'Нова посада'}),department=p.createDepartment({name:'Інший відділ'})
 const changed={...old,positionId:position.id}
 assert.throws(()=>p.updateEmployee(id,changed),code('APPOINTMENT_REVIEW_REQUIRED'))
 assert.equal(p.getEmployee(id).positionId,input.positionId)
 p.updateEmployee(id,changed,true);assert.equal(p.getEmployee(id).positionCategory,'VII')
 assert.throws(()=>p.updateEmployee(id,{...changed,departmentId:department.id}),code('APPOINTMENT_REVIEW_REQUIRED'))
 p.updateEmployee(id,{...changed,departmentId:department.id,positionStartedOn:null,positionCategory:null})
 const values=valuesForEmployee({...p.getEmployee(id),positionStartedOn:'2024-01-01',positionCategory:'VII'})
 const draft=changeAppointment(values,'positionId',input.positionId)
 assert.equal(draft.positionStartedOn,'');assert.equal(draft.positionCategory,'')
 assert.equal(changeAppointment(values,'positionId',values.positionId),values)
 assert.equal(employeeInput(draft).positionStartedOn,null)
 assert.ok(validateEmployee({...values,positionStartedOn:'2019-01-01'}).positionStartedOn)
 assert.ok(validateEmployee({...values,employeeType:'staff'}).positionCategory)
 integrity(db)
})
test('appointment facts do not rewrite current rank or any service, allowance or leave data',async t=>{
 const {p,id,input,db,storage}=await fixture(t),s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false)
 const basis={documentType:null,documentNumber:null,documentDate:null,reviewOn:null}
 s.saveRank(id,{...basis,rank:6,assignedOn:'2020-01-01',effectiveOn:null})
 s.saveAllowance(id,{...basis,status:'confirmed',percentage:10,effectiveOn:'2020-01-01'})
 s.saveServiceBaseline(id,{years:4,months:0,days:0,asOfDate:'2020-01-01',basisNote:null,autoAccrueAfterBaseline:true})
 leave.saveServiceLeaveStart(id,'2020-01-01');leave.saveRights(id,[{leaveType:'oms_service_additional',status:'has_right'}])
 leave.savePeriods(id,[{leaveType:'annual_main',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:5,referenceEntitlementDays:null}])
 const snapshot=()=>Object.fromEntries(['employee_current_ranks','employee_seniority_allowances','employee_service_baselines','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,db.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot(),projection=s.getServiceProjection(id)
 p.updateEmployee(id,{...input,positionCategory:'VII',positionStartedOn:'2024-01-01'})
 assert.equal(s.getRank(id).rank,6);assert.deepEqual(snapshot(),before);assert.deepEqual(s.getServiceProjection(id),projection)
 assert.throws(()=>p.updateEmployee(id,{...input,employeeType:'staff'}),code('EMPLOYEE_HAS_CURRENT_RANK'))
 assert.throws(()=>p.updateEmployee(id,{...input,hireDate:'2021-01-01'}),code('HIRE_DATE_HAS_LEAVE_PERIODS'))
 s.clearRank(id);p.updateEmployee(id,{...input,employeeType:'staff'});assert.equal(p.getEmployee(id).positionCategory,null)
 integrity(db)
})
test('existing personnel preload/IPC accepts appointment facts and explicit review, rejects malformed arguments',async t=>{
 const {p,id,input,storage}=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:null};event.senderFrame=contents.mainFrame
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},p,new LeaveService(storage,()=>false),undefined,undefined,undefined,new SeniorityRanksService(storage,()=>false))
 let api
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.personnel}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 const value={...input,positionCategory:'VII',positionStartedOn:'2024-01-01'}
 assert.equal((await api.updateEmployee(id,value)).data.positionCategory,'VII')
 const newPosition=p.createPosition({name:'Змінена'}),next={...value,positionId:newPosition.id}
 assert.equal((await api.updateEmployee(id,next)).error.code,'APPOINTMENT_REVIEW_REQUIRED')
 assert.equal((await api.updateEmployee(id,next,true)).data.positionCategory,'VII')
 assert.equal((await api.getEmployee(id)).data.positionStartedOn,'2024-01-01')
 const h=handlers.get(ipcChannels.personnelUpdateEmployee)
 for(const args of [[id,next,'yes'],[id,next,true,'extra'],[id,{...next,positionCategory:'VIII'}],[id,{...next,positionStartedOn:'2099-01-01'}]])assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,id,next,true).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,id,next,true).error.code,'FORBIDDEN')
})
