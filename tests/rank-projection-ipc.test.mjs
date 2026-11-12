import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,rmSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve,sep,basename } from 'node:path'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
const code=c=>e=>e.code===c
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'hr-rank-projection-')),file=join(root,'test.db')
 let c=await openStorageSafely(file,migrations.slice(0,16))
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Тест'}).id,positionId=p.createPosition({name:'Тест'}).id
 const input={lastName:'Тест',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',departmentId,positionId,positionCategory:'VII',positionStartedOn:'2024-06-15'}
 const employee=p.createEmployee(input),staff=p.createEmployee({...input,employeeType:'staff',positionCategory:null})
 c.database.prepare('INSERT INTO employee_current_ranks(employee_id,rank,assigned_on,confirmed_at,review_on) VALUES (?,?,?,?,?)').run(employee.id,15,'2023-01-01','2023-01-01T00:00:00.000Z','2030-01-01')
 const ledger=c.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();c.close();c=await openStorageSafely(file)
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-rank-projection-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 assert.equal(c.schemaVersion,21);assert.deepEqual(c.database.prepare('SELECT * FROM schema_migrations WHERE version<=16 ORDER BY version').all(),ledger)
 const s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false)
 return {s,p,leave,storage,employee,staff,get db(){return c.database},async reopen(){c.close();c=await openStorageSafely(file)}}
}
function integrity(db){assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
test('v16→v17 preserves old rank as unknown; CRUD, SQL checks, live connection and cascade',async t=>{
 const f=await fixture(t),{s,employee:e}=f
 const legacy=s.getRank(e.id)
 assert.equal(legacy.origin,'unknown');assert.equal(legacy.reviewAnchorOn,null);assert.equal(legacy.originNote,null);assert.equal(legacy.rank,15);assert.equal(legacy.confirmedAt,'2023-01-01T00:00:00.000Z')
 assert.equal(s.getRankProjection(e.id).reason,'unknown_origin')
 const {employeeId,confirmedAt,...input}=legacy
 const saved=s.saveRank(e.id,{...input,origin:'civil_service_equivalence',reviewAnchorOn:'2022-01-01',originNote:'Підтверджено документами'})
 assert.equal(saved.origin,'civil_service_equivalence');assert.equal(s.listOverview().find(row=>row.employee.id===e.id).rank.originNote,'Підтверджено документами')
 for(const patch of [{origin:'bad'},{reviewAnchorOn:'2026-02-30'},{originNote:'x'.repeat(501)}])assert.throws(()=>s.saveRank(e.id,{...input,...patch}),code('INVALID_ARGUMENTS'))
 for(const sql of ["origin='bad'","review_anchor_on='2026-02-30'","origin_note=''"])assert.throws(()=>f.db.exec('UPDATE employee_current_ranks SET '+sql))
 assert.throws(()=>f.db.prepare('INSERT INTO employee_current_ranks(employee_id,rank,assigned_on,confirmed_at) VALUES (?,?,?,?)').run(randomUUID(),15,'2020-01-01',new Date().toISOString()))
 integrity(f.db);await f.reopen();assert.equal(s.getRank(e.id).originNote,'Підтверджено документами')
 s.clearRank(e.id);assert.equal(s.saveRank(e.id,{...input,origin:'oms_early',reviewAnchorOn:'2024-01-01',originNote:null}).origin,'oms_early')
 f.p.deleteEmployee(e.id);assert.equal(f.db.prepare('SELECT count(*) AS n FROM employee_current_ranks').get().n,0);integrity(f.db)
})
test('projection leaves confirmed rank, manual date, allowances, service and leave rows unchanged',async t=>{
 const f=await fixture(t),{s,employee:e,leave}=f
 const {employeeId,confirmedAt,...input}=s.getRank(e.id)
 s.saveRank(e.id,{...input,origin:'oms_assigned'})
 s.saveAllowance(e.id,{status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:'2027-01-01'})
 s.saveServiceBaseline(e.id,{years:4,months:0,days:0,asOfDate:'2020-01-01',basisNote:null,autoAccrueAfterBaseline:true})
 leave.saveServiceLeaveStart(e.id,'2020-01-01');leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}])
 leave.savePeriods(e.id,[{leaveType:'annual_main',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:5,referenceEntitlementDays:null}])
 const snapshot=()=>Object.fromEntries(['employees','employee_current_ranks','employee_seniority_allowances','employee_service_baselines','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot(),forecast=s.getRankProjection(e.id)
 assert.equal(forecast.nextRank,14);assert.equal(forecast.reviewOn,'2026-06-15');assert.equal(forecast.rank.reviewOn,'2030-01-01')
 assert.deepEqual(snapshot(),before)
 assert.equal(s.getRankProjection(f.staff.id).status,'not_applicable')
 assert.throws(()=>s.getRankProjection(randomUUID()),code('NOT_FOUND'))
 assert.throws(()=>new SeniorityRanksService(f.storage,()=>true).getRankProjection(e.id),code('BUSY'))
 assert.throws(()=>new SeniorityRanksService({getDatabase(){throw Error('private path')}},()=>false).getRankProjection(e.id),code('STORAGE_UNAVAILABLE'))
 integrity(f.db)
})
test('rank projection preload/IPC validates signatures, sender/frame/URL and current output',async t=>{
 const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:null};event.senderFrame=contents.mainFrame
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.p,f.leave,undefined,undefined,undefined,f.s)
 let api
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.seniorityRanks}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 assert.equal((await api.getRankProjection(f.employee.id)).data.reason,'unknown_origin')
 const h=handlers.get(ipcChannels.seniorityGetRankProjection)
 for(const args of [[],['bad'],[f.employee.id,'extra']])assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,f.employee.id).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,f.employee.id).error.code,'FORBIDDEN')
})
