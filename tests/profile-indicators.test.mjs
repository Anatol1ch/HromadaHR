import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync,mkdtempSync,rmSync } from 'node:fs'
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
const allowance={status:'confirmed',percentage:0,effectiveOn:'2020-01-01',documentType:'Історична підстава',documentNumber:'7',documentDate:'2020-01-02',reviewOn:'2030-01-01'}
const rank={rank:6,assignedOn:'2020-01-01',origin:'civil_service_equivalence',reviewAnchorOn:'2020-02-01',originNote:'Документально підтверджено',effectiveOn:null}
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
test('the same editor handles focused saves/clears and guards; projection refresh never remounts the baseline draft',()=>{
 const source=name=>readFileSync(new URL('../src/components/'+name,import.meta.url),'utf8')
 const editor=source('seniority-ranks/IndicatorEditor.tsx'),adapter=source('seniority-ranks/FocusedIndicatorEditor.tsx'),panel=source('seniority-ranks/ProfileIndicatorPanel.tsx'),baseline=source('seniority-ranks/ServiceBaselinePanel.tsx'),profile=source('employees/EmployeeProfilePage.tsx')
 assert.match(adapter,/<IndicatorEditor key=\{key\}/);assert.match(adapter,/if\(current\?\.row\)/);assert.match(adapter,/loadIndicatorContext/)
 assert.doesNotMatch(adapter,/saveAllowance|saveRank|clearAllowance|clearRank|listOverview|ValidatedInput/)
 assert.doesNotMatch(editor,/\bmode\b|onSwitch|role="tablist"/);assert.match(editor,/title=\{title\}/)
 assert.match(editor,/if\(inFlight.current\) return/);assert.match(editor,/requestClose\(onClose\)/);assert.match(editor,/ConfirmDialog/);assert.match(editor,/returnFocus=\{returnFocus\}/)
 assert.match(panel,/if\(reconcile\)/);assert.match(panel,/onRefresh\?\.\(\)/);assert.match(panel,/setState\(\{key,value:saved\}\)/);assert.match(panel,/setVersion\(v=>v\+1\)/);assert.match(panel,/showConfirmedDetails=\{false\}/)
 assert.match(profile,/disabled=\{baselineEditing\|\|baselineBusy\|\|loading\}/);assert.match(profile,/refreshKey=\{allowanceRefresh\}/);assert.doesNotMatch(profile,/key=\{allowanceRefresh\}/)
 assert.match(baseline,/\[employeeId,retry\]/);assert.match(baseline,/\[employeeId,value,loading,projectionRetry,refreshKey\]/);assert.match(baseline,/onEditingChange\?\.\(true\)/)
 assert.match(profile,/showConfirmedAllowance=\{false\}/)
})
test('existing Main APIs preserve actual allowance/rank replies, refresh projections and leave all leave facts unchanged',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-profile-indicators-')),c=await openStorageSafely(join(root,'test.db'))
 t.after(()=>{c.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-profile-indicators-'));rmSync(root,{recursive:true,force:true,maxRetries:5})})
 const storage={getDatabase:()=>c.database},p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false)
 const departmentId=p.createDepartment({name:'Синтетичний відділ'}).id,positionId=p.createPosition({name:'Синтетична посада'}).id
 const e=p.createEmployee({lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',positionStartedOn:'2020-01-01',positionCategory:'VII',departmentId,positionId})
 const api={personnel:{getEmployee:async id=>ok(p.getEmployee(id))},seniorityRanks:{getAllowance:async id=>ok(s.getAllowance(id)),getRank:async id=>ok(s.getRank(id))}}
 s.saveServiceBaseline(e.id,{years:5,months:0,days:1,asOfDate:todayIsoDate(),autoAccrueAfterBaseline:true,basisNote:'Тест'})
 leave.saveServiceLeaveStart(e.id,'2020-01-01');leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}])
 leave.savePeriods(e.id,[{leaveType:'oms_service_additional',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:3,referenceEntitlementDays:null}])
 const snapshot=()=>Object.fromEntries(['employee_service_baselines','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,c.database.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot()
 const a=s.saveAllowance(e.id,{...allowance,percentage:10});assert.deepEqual((await readIndicatorContext(api,e.id,'allowance')).data.allowance,a);assert.equal(s.getServiceProjection(e.id).comparison,'different')
 const r=s.saveRank(e.id,{...rank,documentType:'Рішення ради',documentNumber:'8',documentDate:'2020-01-03',reviewOn:'2030-01-01'});assert.deepEqual((await readIndicatorContext(api,e.id,'rank')).data.rank,r);assert.equal(s.getRankProjection(e.id).status,'retained_higher_rank')
 s.saveAllowance(e.id,{...allowance,percentage:15});assert.equal(s.getServiceProjection(e.id).comparison,'matches');assert.deepEqual(s.getRank(e.id),r)
 s.clearAllowance(e.id);assert.equal((await readIndicatorContext(api,e.id,'allowance')).data.allowance,null);assert.deepEqual(s.getRank(e.id),r)
 const final=s.saveAllowance(e.id,{...allowance,percentage:0});assert.equal(final.percentage,0)
 s.clearRank(e.id);assert.equal((await readIndicatorContext(api,e.id,'rank')).data.rank,null);assert.equal(s.getRankProjection(e.id).reason,'missing_rank');assert.deepEqual(s.getAllowance(e.id),final)
 assert.deepEqual(snapshot(),before);assert.equal(c.schemaVersion,21);assert.deepEqual(c.database.pragma('foreign_key_check'),[]);assert.equal(c.database.pragma('integrity_check',{simple:true}),'ok')
})
