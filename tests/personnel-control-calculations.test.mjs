import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPersonnelIssues,controlDay,comparePersonnelIssues } from '../dist-electron/shared/personnel-control-calculations.js'
import { warningHorizons } from '../dist-electron/shared/personnel-control.js'
import { requestEmployeeNavigation } from '../src/employees/navigation.ts'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { createControlRequests } from '../src/components/personnel-control/requests.ts'
const base={years:4,months:0,days:0,asOfDate:'2026-01-01',autoAccrueAfterBaseline:true,basisNote:null}
const allowance={employeeId:'e',status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:null,confirmedAt:'2020-01-01T00:00:00.000Z'}
const rank={employeeId:'e',rank:15,origin:'oms_assigned',assignedOn:'2025-01-01',effectiveOn:null,reviewAnchorOn:null,originNote:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:null,confirmedAt:'2020-01-01T00:00:00.000Z'}
const employee={id:'e',lastName:'Тест',firstName:'Анна',middleName:null,employeeType:'official',positionCategory:'VII',positionStartedOn:'2025-01-01',positionId:'p',departmentId:'d'}
const facts={employee,baseline:base,allowance,rank,leave:{acquiredOn:null,rightStatus:'has_right',periods:[]}}
const items=(f=facts,on='2026-01-01',horizon=30)=>buildPersonnelIssues(f,on,horizon)
const control=(rows,direction)=>rows.find(i=>i.direction===direction&&i.id.endsWith(':control'))

test('inclusive warning horizons, manual dates, deduplication and phase transitions are stable',()=>{
 for(const days of warningHorizons){
  const on='2026-01-01',date=controlDay(on,days)
  const f={...facts,allowance:{...allowance,reviewOn:date}}
  const issue=control(items(f,on,days),'allowance');assert.equal(issue.category,'upcoming');assert.equal(issue.date,date)
  assert.equal(control(items({...f,allowance:{...allowance,reviewOn:controlDay(on,days+1)}},on,days),'allowance'),undefined)
  const tomorrow=control(items(f,'2026-01-02',days),'allowance')
  assert.equal(tomorrow.id,issue.id);assert.equal(tomorrow.fingerprintData,issue.fingerprintData)
  const due=control(items(f,date,days),'allowance');assert.equal(due.category,'due');assert.notEqual(due.fingerprintData,issue.fingerprintData)
  assert.equal(control(items(f,controlDay(date,1),days),'allowance').fingerprintData,due.fingerprintData)
 }
 const f={...facts,baseline:{...base,years:5},allowance:{...allowance,reviewOn:'2026-01-02'}}
 const rows=items(f);assert.equal(rows.filter(i=>i.direction==='allowance'&&i.id.endsWith('control')).length,1)
 assert.deepEqual(control(rows,'allowance').dates,[{source:'manual',date:'2026-01-02'},{source:'projection',date:'2026-01-02'}])
})
test('all three projections produce issues without new formulas, and crossed thresholds survive as due',()=>{
 const near={...facts,baseline:{...base,asOfDate:'2025-02-01'},rank:{...rank,assignedOn:'2024-02-01'},employee:{...employee,positionStartedOn:'2024-02-01'}}
 const rows=items(near,'2026-01-15')
 assert.equal(control(rows,'allowance').date,'2026-02-02');assert.equal(control(rows,'allowance').category,'upcoming')
 assert.equal(control(rows,'rank').date,'2026-02-01');assert.match(control(rows,'rank').title,/14/)
 const due=control(items(near,'2026-02-02'),'allowance');assert.equal(due.category,'review_needed');assert.equal(due.date,'2026-02-02')
 const service={...facts,baseline:{...base,years:10,asOfDate:'2025-02-01'}}
 assert.equal(control(items(service,'2026-01-15'),'service_leave').date,'2026-02-02')
 assert.match(control(items(service,'2026-01-15'),'service_leave').explanation,/понад 11 років — 7 к. дн./)
 const unknown={...service,leave:{...service.leave,rightStatus:'unknown'}}
 assert.equal(control(items(unknown,'2026-01-15'),'service_leave').category,'review_needed')
 assert.equal(control(items({...service,leave:{...service.leave,rightStatus:'no_right'}},'2026-01-15'),'service_leave').category,'review_needed')
 assert.deepEqual(items({...facts,employee:{...employee,employeeType:'staff'}}),[])
})
test('missing data is separate; special ranks are never called illegal or given an ordinary next rank',()=>{
 const missing=items({...facts,baseline:null,rank:null,allowance:null,employee:{...employee,positionCategory:null,positionStartedOn:null}})
 assert.ok(missing.length);assert.ok(missing.every(i=>i.category==='data_incomplete'));assert.equal(missing.find(i=>i.direction==='rank').tab,'general')
 for(const patch of [{rank:13},{rank:6},{rank:15,origin:'unknown'},{rank:15,origin:'civil_service_equivalence'}]){
  const rows=items({...facts,rank:{...rank,...patch}},'2028-01-01')
  assert.equal(control(rows,'rank'),undefined)
 }
 const manual=control(items({...facts,rank:{...rank,rank:6,reviewOn:'2026-01-01'}},'2026-01-01'),'rank')
 assert.equal(manual.category,'due');assert.doesNotMatch(manual.title,/присвоєння/)
 assert.equal(items({...facts,rank:{...rank,rank:6,origin:'unknown'}}).find(i=>i.direction==='rank').category,'data_incomplete')
 const frozen=items({...facts,baseline:{...base,autoAccrueAfterBaseline:false}},'2030-01-01')
 assert.equal(control(frozen,'allowance'),undefined);assert.equal(control(frozen,'service_leave'),undefined)
})
test('historical balances are not normative discrepancies; new comparable confirmations are advisory',()=>{
 const period={id:'b',employeeId:'e',leaveType:'oms_service_additional',periodStart:'2027-01-01',periodEnd:'2027-12-31',accountingBasis:'initial_balance',confirmedDays:3,referenceEntitlementDays:null,status:'confirmed'}
 const f={...facts,baseline:{...base,years:16,asOfDate:'2027-01-01'},leave:{...facts.leave,periods:[period]}}
 assert.equal(control(items(f,'2027-01-01'),'service_leave'),undefined)
 const current=control(items({...f,leave:{...f.leave,periods:[{...period,accountingBasis:'confirmed_entitlement'}]}},'2027-01-01'),'service_leave')
 assert.equal(current.category,'review_needed');assert.match(current.explanation,/не є залишком/)
 const stamped=items({...facts,rank:{...rank,reviewOn:'2026-01-05'},allowance:{...allowance,confirmedAt:'2026-01-01T00:00:00.000Z'}})
 assert.equal(control(stamped,'rank').fingerprintData,control(items({...facts,rank:{...rank,reviewOn:'2026-01-05'}}),'rank').fingerprintData)
 const reversed=Object.fromEntries(Object.entries({...rank,reviewOn:'2026-01-05'}).reverse())
 assert.equal(control(items({...facts,rank:reversed}),'rank').fingerprintData,control(stamped,'rank').fingerprintData)
})
test('calendar shifts and priority order are deterministic, bounded and independent of DST',()=>{
 assert.equal(controlDay('2024-02-28',1),'2024-02-29');assert.equal(controlDay('2024-12-31',1),'2025-01-01')
 assert.equal(controlDay('9999-12-31',1),null);assert.equal(controlDay('0001-01-01',-1),null);assert.equal(controlDay('2026-02-30',1),null)
 assert.equal(controlDay('2026-01-01',Number.MAX_SAFE_INTEGER),null)
 const rows=[{id:'z',category:'data_incomplete',date:null,employeeName:'Яна'},{id:'b',category:'upcoming',date:'2026-01-02',employeeName:'Богдан'},{id:'a',category:'due',date:'2026-01-01',employeeName:'Анна'},{id:'c',category:'review_needed',date:null,employeeName:'Віра'}]
 assert.deepEqual(rows.sort(comparePersonnelIssues).map(r=>r.id),['a','c','b','z'])
})
test('navigation carries only identity and tab and obeys the existing draft guard exactly once',()=>{
 const guards=createCloseGuards();let dirty=true,confirmation,accepted,closed=0
 guards.register({dirty:()=>dirty,busy:()=>false,confirm:(changed,proceed)=>{confirmation=proceed}})
 requestEmployeeNavigation({employeeId:'employee',tab:'rank'},9,proceed=>guards.requestAll(proceed),intent=>{accepted=intent},()=>closed++)
 assert.equal(accepted,undefined);assert.equal(closed,0)
 dirty=false;confirmation();assert.deepEqual(accepted,{employeeId:'employee',tab:'rank',requestId:9});assert.equal(closed,1)
})
test('late reads, lifetime changes and duplicate mutations cannot overwrite the current control snapshot',async()=>{
 const requests=createControlRequests();requests.activate()
 let acceptFirst,acceptSecond,result
 const read=()=>{const version=requests.beginRead();return new Promise(resolve=>resolve(version)).then(version=>new Promise(resolve=>{
  const accept=value=>{if(requests.current(version))result=value;resolve()}
  if(!acceptFirst)acceptFirst=accept;else acceptSecond=accept
 }))}
 const first=read();await Promise.resolve();const second=read();await Promise.resolve()
 acceptSecond('new');acceptFirst('old');await Promise.all([first,second]);assert.equal(result,'new')
 const obsolete=requests.beginRead(),lifetime=requests.lifetime()
 requests.stop();requests.activate();assert.equal(requests.current(obsolete),false);assert.equal(requests.currentLifetime(lifetime),false)
 assert.equal(requests.beginMutation(),true);assert.equal(requests.pending.current,true);assert.equal(requests.beginMutation(),false)
 requests.endMutation();assert.equal(requests.pending.current,false);assert.equal(requests.beginMutation(),true)
 requests.endMutation();requests.stop();assert.equal(requests.beginMutation(),false)
})
