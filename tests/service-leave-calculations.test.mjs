import test from 'node:test'
import assert from 'node:assert/strict'
import { projectOmsServiceLeave,serviceLeaveDays,nextServiceLeaveThreshold,serviceLeaveThresholds } from '../dist-electron/shared/service-leave-calculations.js'
import { calculateService } from '../dist-electron/shared/service-calculations.js'
import { serviceLeaveSuggestion,applyServiceLeaveSuggestion,serviceDraftIdentity } from '../src/components/leave/service-leave-draft.ts'
import { buildChanges } from '../src/components/leave/draft.ts'
const baseline={years:12,months:0,days:1,asOfDate:'2028-01-01',basisNote:null,autoAccrueAfterBaseline:true}
const facts={acquiredOn:null,rightStatus:'has_right',periods:[]}
const project=(b=baseline,on=b?.asOfDate??'2028-01-01',type='official',f=facts)=>projectOmsServiceLeave(b,on,type,f)
const period={id:'p',employeeId:'e',leaveType:'oms_service_additional',periodStart:'2028-01-01',periodEnd:'2028-12-31',accountingBasis:'confirmed_entitlement',confirmedDays:3,referenceEntitlementDays:null,status:'confirmed'}

test('all strict leave thresholds preserve equality and change only after the boundary',()=>{
 assert.deepEqual(serviceLeaveThresholds.map(t=>t.days),[5,7,9,11,13,15])
 let prior=0
 for(const t of serviceLeaveThresholds){
  assert.equal(serviceLeaveDays({years:t.years,months:0,days:0}),prior)
  assert.equal(serviceLeaveDays({years:t.years,months:0,days:1}),t.days)
  assert.equal(serviceLeaveDays({years:t.years,months:1,days:0}),t.days)
  assert.equal(nextServiceLeaveThreshold({years:t.years,months:0,days:0}).years,t.years)
  const p=project({...baseline,years:t.years,months:0,days:0})
  assert.equal(p.recommendedDays,prior);assert.equal(p.reviewOn,'2028-01-02');assert.equal(p.reviewAccuracy,'estimate')
  assert.equal(project({...baseline,years:t.years,months:0,days:0},'2028-01-02').recommendedDays,t.days)
  prior=t.days
 }
 assert.equal(serviceLeaveDays({years:0,months:0,days:0}),0)
 const max=project({...baseline,years:26});assert.equal(max.recommendedDays,15);assert.equal(max.nextThreshold,null);assert.equal(max.reviewOn,null)
})
test('missing, zero, frozen historical baseline, staff and invalid facts are distinct',()=>{
 assert.equal(project(null).status,'missing_baseline');assert.equal(project(null).recommendedDays,null)
 assert.equal(project({...baseline,years:0,days:0}).recommendedDays,0)
 const frozen=project({...baseline,autoAccrueAfterBaseline:false},'2030-01-01')
 assert.equal(frozen.status,'baseline_only');assert.equal(frozen.recommendedDays,9);assert.equal(frozen.reviewOn,null)
 assert.equal(project(baseline,baseline.asOfDate,'staff').status,'not_applicable');assert.equal(project(baseline,baseline.asOfDate,'staff').recommendedDays,null)
 for(const patch of [{years:-1},{days:31},{months:12},{asOfDate:'2028-02-30'}])assert.equal(project({...baseline,...patch},'2028-03-01').status,'requires_review')
 assert.equal(project(baseline,'2027-12-31').calculation.reason,'before_baseline')
 assert.equal(project(baseline,baseline.asOfDate,'official',{...facts,acquiredOn:'2028-02-30'}).status,'requires_review')
})
test('calendar threshold estimates reuse the service convention across month and leap boundaries',()=>{
 for(const [b,on,current,review] of [
  [{...baseline,years:9,months:11,days:0,asOfDate:'2024-01-31'},'2024-02-29',{years:10,months:0,days:0},'2024-03-01'],
  [{...baseline,years:9,months:0,days:0,asOfDate:'2024-02-29'},'2025-02-28',{years:10,months:0,days:0},'2025-03-01'],
  [{...baseline,years:10,months:0,days:0,asOfDate:'2023-12-31'},'2024-01-01',{years:10,months:0,days:1},'2025-01-01'],
  [{...baseline,years:11,months:8,days:12,asOfDate:'2024-01-31'},'2024-01-31',{years:11,months:8,days:12},'2024-05-20'],
 ]){
  const p=project(b,on);assert.deepEqual(p.calculation.current,current);assert.equal(p.reviewOn,review)
  assert.deepEqual(p.calculation,calculateService(b,on))
 }
 const edge=project({...baseline,years:10,days:0,asOfDate:'9999-12-30'})
 assert.equal(edge.reviewOn,null);assert.equal(edge.reviewAccuracy,null)
 assert.equal(project({...baseline,asOfDate:'0001-01-01',years:10,days:0}).reviewOn,'0001-01-02')
 assert.equal(project({...baseline,years:Number.MAX_SAFE_INTEGER,months:11},'2029-01-01').status,'requires_review')
})
test('right status is evidence, historical remaining days are not normative duration, and comparison is advisory',()=>{
 for(const rightStatus of ['unknown','has_right','no_right']){
  const p=project(baseline,baseline.asOfDate,'official',{...facts,rightStatus,periods:[period]})
  assert.equal(p.rightStatus,rightStatus);assert.equal(p.recommendedDays,9);assert.equal(p.currentPeriods[0].comparison,'different');assert.equal(p.currentPeriods[0].confirmedDays,3)
 }
 const historical={...period,accountingBasis:'initial_balance'}
 const p=project(baseline,baseline.asOfDate,'official',{...facts,periods:[historical]})
 assert.equal(p.historicalBalancePresent,true);assert.equal(p.currentPeriods[0].comparison,'not_comparable')
 assert.equal(project({...baseline,autoAccrueAfterBaseline:false},baseline.asOfDate,'official',{...facts,periods:[period]}).currentPeriods[0].comparison,'not_comparable')
 assert.equal(project(baseline,baseline.asOfDate,'official',{...facts,periods:[{...period,confirmedDays:9}]}).currentPeriods[0].comparison,'matches')
 assert.deepEqual(project(baseline,baseline.asOfDate,'official',{...facts,periods:[{...period,periodStart:'2029-01-01',periodEnd:'2029-12-31'}]}).currentPeriods,[])
})
test('explicit suggestion changes one eligible blank draft and preserves IPC conversion and all other rows',()=>{
 const proposed={...period,status:'proposed'},row={period:proposed,days:''},other={period:{...proposed,periodStart:'2029-01-01',periodEnd:'2029-12-31'},days:'8'},rows=[row,other]
 const p=project(),copy=structuredClone(rows)
 assert.equal(serviceLeaveSuggestion(row,p,'2028-01-01'),9)
 const filled=applyServiceLeaveSuggestion(rows,serviceDraftIdentity(row),p,'2028-01-01')
 assert.deepEqual(rows,copy);assert.equal(filled[1],other);assert.equal(filled[0].days,'9');assert.equal(filled[0].suggestedFromProjection,true)
 assert.equal(buildChanges(filled)[0].confirmedDays,9);assert.equal('suggestedFromProjection' in buildChanges(filled)[0],false)
 assert.equal(serviceLeaveSuggestion(filled[0],p,'2028-01-01'),null)
 const manual={id:0,start:'01.01.2028',end:'31.12.2028',startIso:'2028-01-01',endIso:'2028-12-31',days:''}
 assert.equal(serviceLeaveSuggestion(manual,p,'2028-01-01'),9)
 for(const bad of [
  {...row,days:'0'},{...row,days:'4'},{period,days:''},
  {period:{...proposed,accountingBasis:'initial_balance'},days:''},
  {period:{...proposed,periodStart:'2029-01-01',periodEnd:'2029-12-31'},days:''},
  {period:{...proposed,periodStart:'2027-01-01',periodEnd:'2027-12-31'},days:''},
  {...manual,start:'31.02.2028'},
 ])assert.equal(serviceLeaveSuggestion(bad,p,'2028-01-01'),null)
 for(const bad of [null,{...p,status:'baseline_only'},{...p,status:'not_applicable'},{...p,rightStatus:'unknown'},{...p,rightStatus:'no_right'},{...p,currentPeriods:[period]}]) {
  assert.equal(serviceLeaveSuggestion(row,bad,'2028-01-01'),null)
  assert.equal(applyServiceLeaveSuggestion(rows,serviceDraftIdentity(row),bad,'2028-01-01'),rows)
 }
 assert.equal(serviceLeaveSuggestion(row,p,'2028-01-02'),null)
})
