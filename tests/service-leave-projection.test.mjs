import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,rmSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve,sep,basename } from 'node:path'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { todayIsoDate } from '../dist-electron/src/lib/dates.js'
const code=c=>e=>e.code===c
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'hr-service-leave-')),file=join(root,'test.db')
 let c=await openStorageSafely(file)
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Синтетичний'}).id,positionId=p.createPosition({name:'Тест'}).id
 const input={lastName:'Тест',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',departmentId,positionId,positionCategory:null,positionStartedOn:null}
 const e=p.createEmployee(input),staff=p.createEmployee({...input,employeeType:'staff'})
 const base={years:12,months:0,days:1,asOfDate:todayIsoDate(),autoAccrueAfterBaseline:true,basisNote:null}
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-service-leave-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 return {p,s,leave,e,staff,base,storage,get db(){return c.database},async reopen(){c.close();c=await openStorageSafely(file)}}
}
const integrity=db=>{assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}

test('LeaveService uses one read-only snapshot without changing dates, rights, periods, FIFO or personnel facts',async t=>{
 const f=await fixture(t),{s,leave,e,base}=f
 s.saveServiceBaseline(e.id,base)
 s.saveAllowance(e.id,{status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:'2030-01-01'})
 s.saveRank(e.id,{rank:15,assignedOn:'2020-01-01',effectiveOn:null,origin:'oms_assigned',reviewAnchorOn:null,originNote:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:'2030-02-01'})
 leave.saveServiceLeaveStart(e.id,'2020-01-01')
 leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}])
 const year=base.asOfDate.slice(0,4)
 leave.savePeriods(e.id,[{leaveType:'oms_service_additional',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:3,referenceEntitlementDays:null},
  {leaveType:'oms_service_additional',periodStart:year+'-01-01',periodEnd:year+'-12-31',accountingBasis:Number(year)<2027?'initial_balance':'confirmed_entitlement',confirmedDays:5,referenceEntitlementDays:null}])
 const allocation=leave.proposeAllocation(e.id,'oms_service_additional',2,'2027-01-02','2027-01-03')
 leave.registerLeave({requestId:randomUUID(),employeeId:e.id,leaveType:'oms_service_additional',startDate:'2027-01-02',endDate:'2027-01-03',usedDays:2,orderNumber:null,orderDate:null,durationExplanation:null,allocations:allocation.allocations})
 const tables=['employees','employee_service_baselines','employee_current_ranks','employee_seniority_allowances','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations','schema_migrations']
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]))
 const before=snapshot(),used=leave.getBalances(e.id),changes=f.db.prepare('SELECT total_changes() AS n').get().n
 f.db.pragma('query_only=ON')
 const projection=leave.getOmsServiceLeaveProjection(e.id)
 assert.equal(projection.status,'calculated');assert.equal(projection.recommendedDays,9);assert.equal(projection.acquiredOn,'2020-01-01');assert.equal(projection.rightStatus,'has_right')
 assert.equal(projection.reviewAccuracy,'estimate');assert.equal(projection.historicalBalancePresent,true)
 assert.equal(projection.currentPeriods.length,1);assert.equal(projection.currentPeriods[0].comparison,Number(year)<2027?'not_comparable':'different')
 assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.deepEqual(snapshot(),before);assert.deepEqual(leave.getBalances(e.id),used)
 f.db.pragma('query_only=OFF');integrity(f.db)
 await f.reopen();assert.equal(leave.getOmsServiceLeaveProjection(e.id).recommendedDays,9)
 s.saveServiceBaseline(e.id,{...base,years:15});assert.equal(leave.getOmsServiceLeaveProjection(e.id).recommendedDays,15)
 assert.equal(f.db.pragma('user_version',{simple:true}),19)
})
test('rights, zero, missing baseline, opt-out and staff remain explicit; controlled service errors survive',async t=>{
 const f=await fixture(t),{leave,e,s,base}=f
 assert.equal(leave.getOmsServiceLeaveProjection(e.id).status,'missing_baseline')
 s.saveServiceBaseline(e.id,{...base,years:0,days:0});assert.equal(leave.getOmsServiceLeaveProjection(e.id).recommendedDays,0)
 for(const status of [null,'no_right','has_right']){
  leave.saveRights(e.id,[{leaveType:'oms_service_additional',status}])
  assert.equal(leave.getOmsServiceLeaveProjection(e.id).rightStatus,status??'unknown')
 }
 s.saveServiceBaseline(e.id,{...base,autoAccrueAfterBaseline:false})
 const frozen=leave.getOmsServiceLeaveProjection(e.id);assert.equal(frozen.status,'baseline_only');assert.equal(frozen.reviewOn,null);assert.equal(frozen.recommendedDays,9)
 s.saveServiceBaseline(f.staff.id,base);assert.equal(leave.getOmsServiceLeaveProjection(f.staff.id).status,'not_applicable')
 s.clearServiceBaseline(e.id);assert.equal(leave.getOmsServiceLeaveProjection(e.id).status,'missing_baseline')
 assert.throws(()=>leave.getOmsServiceLeaveProjection('bad'),code('INVALID_ARGUMENTS'))
 assert.throws(()=>leave.getOmsServiceLeaveProjection(randomUUID()),code('NOT_FOUND'))
 assert.throws(()=>new LeaveService(f.storage,()=>true).getOmsServiceLeaveProjection(e.id),code('BUSY'))
 assert.throws(()=>new LeaveService({getDatabase(){throw Error('private path')}},()=>false).getOmsServiceLeaveProjection(e.id),code('STORAGE_UNAVAILABLE'))
 integrity(f.db)
})
test('new read-only typed IPC validates arguments, output and sender/frame/URL without leaking internals',async t=>{
 const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:null};event.senderFrame=contents.mainFrame
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.p,f.leave,undefined,undefined,undefined,f.s)
 let api
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.leave}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 f.s.saveServiceBaseline(f.e.id,f.base)
 const response=await api.getOmsServiceLeaveProjection(f.e.id)
 assert.equal(response.ok,true);assert.equal(response.data.recommendedDays,9)
 const h=handlers.get(ipcChannels.leaveOmsServiceProjection)
 for(const args of [[],['bad'],[null],[f.e.id,'extra'],[{employeeId:f.e.id}]])assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,f.e.id).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://foreign.test/';assert.equal(h(event,f.e.id).error.code,'FORBIDDEN');contents.mainFrame.url=url
 f.leave.getOmsServiceLeaveProjection=()=>({...response.data,recommendedDays:999})
 assert.equal(h(event,f.e.id).error.code,'INTERNAL_ERROR')
 f.leave.getOmsServiceLeaveProjection=()=>{throw Error('private SQL/path/stack')}
 assert.deepEqual(h(event,f.e.id),{ok:false,error:{code:'INTERNAL_ERROR'}})
})
