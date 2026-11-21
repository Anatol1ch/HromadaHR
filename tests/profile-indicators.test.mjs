import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve,sep,basename } from 'node:path'
import { readIndicatorContext,readIndicator,loadIndicatorContext,uncertainIndicatorResult } from '../src/components/seniority-ranks/profile-indicators.ts'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { todayIsoDate } from '../dist-electron/src/lib/dates.js'
const ok=data=>({ok:true,data}),failed=code=>({ok:false,error:{code}})
const employee={id:'e',lastName:'Тест',firstName:'Анна',middleName:null,employeeType:'official'}
const allowance={status:'confirmed',percentage:0,effectiveOn:'2020-01-01',documentType:'Історична підстава',documentNumber:'7',documentDate:'2020-01-02'}
const rank={rank:6,assignedOn:'2020-01-01',origin:'civil_service_equivalence',reviewAnchorOn:'2020-02-01'}
const tick=()=>new Promise(resolve=>setImmediate(resolve))

test('fresh context reads only the target and current employee; null, confirmed zero and not-applicable remain distinct',async()=>{
 const calls=[],api={personnel:{getEmployee:async id=>{calls.push(['employee',id]);return ok(employee)}},seniorityRanks:{
  getAllowance:async id=>{calls.push(['allowance',id]);return ok(allowance)},getRank:async id=>{calls.push(['rank',id]);return ok(rank)},listOverview:()=>{throw Error('must not scan registry')},
 }}
 const a=await readIndicatorContext(api,'e','allowance');assert.equal(a.ok,true);assert.equal(a.data.allowance,allowance);assert.equal(a.data.allowance.percentage,0);assert.equal(a.data.rank,null)
 assert.deepEqual(calls,[['employee','e'],['allowance','e']]);calls.length=0
 const r=await readIndicatorContext(api,'e','rank');assert.equal(r.data.rank,rank);assert.equal(r.data.allowance,null);assert.deepEqual(calls,[['employee','e'],['rank','e']])
 for(const value of [null,{...allowance,status:'not_applicable',percentage:null,effectiveOn:null}]){
  api.seniorityRanks.getAllowance=async()=>ok(value)
  assert.equal((await readIndicatorContext(api,'e','allowance')).data.allowance,value)
 }
 api.personnel.getEmployee=async()=>ok({...employee,employeeType:'staff'})
 assert.equal((await readIndicatorContext(api,'e','rank')).error.code,'RANK_REQUIRES_OFFICIAL')
 assert.equal((await readIndicatorContext(api,'e','allowance')).ok,true)
})
test('read failure never fabricates a new empty form; transport failures remain controlled and distinguish uncertain writes',async()=>{
 const api={personnel:{getEmployee:async()=>ok(employee)},seniorityRanks:{getAllowance:async()=>failed('BUSY')}}
 for(const code of ['BUSY','NOT_FOUND','STORAGE_UNAVAILABLE','UNAVAILABLE']){
  api.seniorityRanks.getAllowance=async()=>failed(code)
  const result=await readIndicatorContext(api,'e','allowance');assert.deepEqual(result,failed(code));assert.equal('data' in result,false)
 }
 api.seniorityRanks.getAllowance=async()=>{throw Error('transport')}
 assert.deepEqual(await readIndicator(api.seniorityRanks,'e','allowance'),failed('UNAVAILABLE'))
 api.personnel.getEmployee=async()=>failed('NOT_FOUND');api.seniorityRanks.getAllowance=async()=>ok(null)
 assert.deepEqual(await readIndicatorContext(api,'e','allowance'),failed('NOT_FOUND'))
 assert.equal(uncertainIndicatorResult('UNAVAILABLE'),true);assert.equal(uncertainIndicatorResult('INTERNAL_ERROR'),true);assert.equal(uncertainIndicatorResult('INVALID_ARGUMENTS'),false)
})
test('closing or changing the employee discards late context responses and only accepts the active retry',async()=>{
 let resolveOld,resolveClosed;const accepted=[]
 const api={personnel:{getEmployee:async id=>ok({...employee,id})},seniorityRanks:{getAllowance:id=>id==='old'?new Promise(r=>{resolveOld=r}):id==='closed'?new Promise(r=>{resolveClosed=r}):Promise.resolve(ok(allowance))}}
 const cancel=loadIndicatorContext(api,'old','allowance',r=>accepted.push(r));cancel()
 loadIndicatorContext(api,'new','allowance',r=>accepted.push(r));await tick()
 assert.equal(accepted.length,1);assert.equal(accepted[0].data.employee.id,'new')
 resolveOld(ok(null));await tick();assert.equal(accepted.length,1)
 const close=loadIndicatorContext(api,'closed','allowance',r=>accepted.push(r));close();resolveClosed(ok(allowance));await tick();assert.equal(accepted.length,1)
})
test('existing Main APIs preserve actual allowance/rank replies, refresh projections and leave all leave facts unchanged',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-profile-indicators-')),c=await openStorageSafely(join(root,'test.db'))
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-profile-indicators-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Синтетичний відділ'}).id,positionId=p.createPosition({name:'Синтетична посада'}).id
 const e=p.createEmployee({lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',positionStartedOn:'2020-01-01',positionCategory:'VII',departmentId,positionId})
 const api={personnel:{getEmployee:async id=>ok(p.getEmployee(id))},seniorityRanks:{getAllowance:async id=>ok(s.getAllowance(id)),getRank:async id=>ok(s.getRank(id))}}
 s.saveServiceAccounting(e.id,{mode:'snapshot',years:5,months:0,days:1,asOfDate:todayIsoDate()})
 leave.saveServiceLeaveStart(e.id,'2020-01-01');leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}])
 leave.savePeriods(e.id,[{leaveType:'oms_service_additional',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:3,referenceEntitlementDays:null}])
 const snapshot=()=>Object.fromEntries(['employee_service_records','employee_service_periods','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,c.database.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot()
 const a=s.saveAllowance(e.id,{...allowance,percentage:10});assert.deepEqual((await readIndicatorContext(api,e.id,'allowance')).data.allowance,a);assert.equal(s.getServiceProjection(e.id).comparison,'different')
 const r=s.saveRank(e.id,{...rank,origin:'oms_assigned',documentType:'Рішення ради',documentNumber:'8',documentDate:'2020-01-03'});assert.deepEqual((await readIndicatorContext(api,e.id,'rank')).data.rank,r);assert.equal(s.getRankProjection(e.id).status,'retained_higher_rank')
 s.saveAllowance(e.id,{...allowance,percentage:15});assert.equal(s.getServiceProjection(e.id).comparison,'matches');assert.deepEqual(s.getRank(e.id),r)
 s.clearAllowance(e.id);assert.equal((await readIndicatorContext(api,e.id,'allowance')).data.allowance,null);assert.deepEqual(s.getRank(e.id),r)
 const final=s.saveAllowance(e.id,{...allowance,percentage:0});assert.equal(final.percentage,0)
 s.clearRank(e.id);assert.equal((await readIndicatorContext(api,e.id,'rank')).data.rank,null);assert.equal(s.getRankProjection(e.id).reason,'missing_rank');assert.deepEqual(s.getAllowance(e.id),final)
 assert.deepEqual(snapshot(),before);assert.equal(c.schemaVersion,24);assert.deepEqual(c.database.pragma('foreign_key_check'),[]);assert.equal(c.database.pragma('integrity_check',{simple:true}),'ok')
})
