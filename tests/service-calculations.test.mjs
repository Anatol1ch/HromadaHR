import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateService, projectService, allowanceForDuration, allowanceThresholds } from '../dist-electron/shared/service-calculations.js'
const base={years:0,months:0,days:0,asOfDate:'2024-01-31',autoAccrueAfterBaseline:true,basisNote:null}
const duration=(years,months,days)=>({years,months,days})
test('baseline identity, zero, opt-out, missing and historical dates have explicit states',()=>{
 assert.equal(calculateService(null,'2024-01-31').status,'missing_baseline')
 assert.deepEqual(calculateService(base,base.asOfDate).current,duration(0,0,0))
 assert.deepEqual(calculateService({...base,years:4,months:8,days:12},base.asOfDate).current,duration(4,8,12))
 const frozen=calculateService({...base,years:4,autoAccrueAfterBaseline:false},'2030-01-01')
 assert.equal(frozen.status,'baseline_only');assert.deepEqual(frozen.current,duration(4,0,0))
 assert.equal(calculateService(base,'2024-01-30').reason,'before_baseline')
 assert.equal(projectService({...base,years:4,autoAccrueAfterBaseline:false},'2030-01-01','official',null).reviewOn,null)
})
test('anchor anniversaries handle real month lengths, leap years and year transitions',()=>{
 for(const [anchor,on,expected] of [
 ['2024-01-31','2024-02-01',duration(0,0,1)],['2024-01-31','2024-02-29',duration(0,1,0)],
 ['2023-01-31','2023-02-28',duration(0,1,0)],['2023-01-31','2023-03-30',duration(0,1,30)],
 ['2023-01-31','2023-03-31',duration(0,2,0)],['2024-02-29','2025-02-28',duration(1,0,0)],
 ['2024-02-29','2025-03-01',duration(1,0,1)],['2023-12-31','2024-01-01',duration(0,0,1)],
 ['2024-04-30','2024-05-30',duration(0,1,0)],['2024-01-31','2025-01-31',duration(1,0,0)],
 ])assert.deepEqual(calculateService({...base,asOfDate:anchor},on).current,expected,anchor+' '+on)
 assert.deepEqual(calculateService({...base,years:4,months:8,days:12},'2024-02-29').current,duration(4,9,12))
 // Ambiguous pre-existing 30-day remainder: same-date identity, real short-interval carry afterwards.
 const short={...base,years:2,months:11,days:30,asOfDate:'2023-02-01'}
 assert.deepEqual(calculateService(short,'2023-02-01').current,duration(2,11,30))
 assert.deepEqual(calculateService(short,'2023-02-02').current,duration(3,0,3))
 assert.equal(calculateService(short,'2023-02-02').accuracy,'estimate')
})
test('every strict threshold keeps the prior rate at equality and changes one credited day later',()=>{
 let prior=0
 for(const threshold of allowanceThresholds){
  assert.equal(allowanceForDuration(duration(threshold.years,0,0)).percentage,prior)
  assert.equal(allowanceForDuration(duration(threshold.years,0,1)).percentage,threshold.percentage)
  const v={...base,years:threshold.years,asOfDate:'2026-01-01'}
  const exact=projectService(v,'2026-01-01','official',null)
  assert.equal(exact.percentage,prior);assert.equal(exact.nextThreshold.years,threshold.years)
  assert.equal(exact.reviewOn,'2026-01-02');assert.equal(exact.reviewAccuracy,'estimate')
  assert.equal(projectService(v,'2026-01-02','official',null).percentage,threshold.percentage)
  prior=threshold.percentage
 }
 const maximum=projectService({...base,years:26},base.asOfDate,'official',null)
 assert.equal(maximum.percentage,40);assert.equal(maximum.nextThreshold,null);assert.equal(maximum.reviewOn,null)
 const upcoming=projectService({...base,years:4,months:8,days:12},base.asOfDate,'official',null)
 assert.equal(upcoming.reviewOn,'2024-05-20')
 assert.equal(projectService({...base,years:4,months:8,days:12},'2024-05-19','official',null).percentage,10)
 assert.equal(projectService({...base,years:4,months:8,days:12},'2024-05-20','official',null).percentage,15)
})
test('staff, missing/not-applicable confirmed allowance and estimated mismatches remain distinct',()=>{
 const v={...base,years:5,days:1}
 const allowance={status:'confirmed',percentage:10}
 const p=projectService(v,v.asOfDate,'official',allowance)
 assert.equal(p.percentage,15);assert.equal(p.comparison,'different');assert.equal(allowance.percentage,10)
 assert.equal(projectService(v,v.asOfDate,'official',null).comparison,'missing')
 assert.equal(projectService(v,v.asOfDate,'official',{status:'not_applicable'}).comparison,'not_applicable')
 assert.equal(projectService({...v,autoAccrueAfterBaseline:false},v.asOfDate,'official',allowance).comparison,'unavailable')
 const staff=projectService(v,v.asOfDate,'staff',allowance)
 assert.equal(staff.status,'not_applicable');assert.equal(staff.percentage,null);assert.equal(staff.reviewOn,null)
})
test('invalid values, calendar bounds and numeric overflow never produce fake dates',()=>{
 for(const patch of [{years:-1},{years:Number.MAX_SAFE_INTEGER+1},{months:12},{days:31},{asOfDate:'2025-02-29'},{autoAccrueAfterBaseline:1}])assert.equal(calculateService({...base,...patch},'2026-01-01').status,'requires_review')
 assert.equal(calculateService(base,'not a date').reason,'invalid_input')
 assert.equal(calculateService({...base,years:Number.MAX_SAFE_INTEGER,months:11},'2025-01-31').reason,'overflow')
 const end=projectService({...base,asOfDate:'9999-12-30',years:3},'9999-12-30','official',null)
 assert.equal(end.reviewOn,null)
 assert.equal(end.reviewAccuracy,null)
})

test('calendar credit remains monotone across short-month carries, supporting the threshold search',()=>{
 for(const anchor of ['2023-01-31','2024-02-29','2023-02-01'])for(const days of [0,30]) {
  let previous=-1
  for(let offset=0;offset<800;offset++) {
   const day=new Date(anchor+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+offset)
   const result=calculateService({...base,asOfDate:anchor,years:2,months:11,days},day.toISOString().slice(0,10))
   assert.equal(result.status,'calculated')
   const d=result.current,score=(d.years*12+d.months)*31+d.days
   assert.ok(score>=previous,`${anchor} +${offset}, baseline days ${days}`)
   previous=score
  }
 }
})
