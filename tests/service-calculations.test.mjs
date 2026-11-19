import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateService, projectService, allowanceForDuration, allowanceThresholds } from '../dist-electron/shared/service-calculations.js'
const duration=(years,months,days)=>({years,months,days})
const snapshot={mode:'snapshot',years:0,months:0,days:0,asOfDate:'2024-01-31'}
const period=(startDate,endDate,id)=>({id:id??`${startDate}-${endDate??'open'}`,startDate,endDate})
test('missing service data, confirmed zero, continuous and snapshot sources are distinct',()=>{
 assert.equal(calculateService(null,'2024-01-31').status,'missing_service_data')
 assert.deepEqual(calculateService({...snapshot},snapshot.asOfDate).current,duration(0,0,0))
 assert.equal(calculateService({...snapshot,years:4,months:8,days:12},snapshot.asOfDate).accuracy,'confirmed')
 assert.deepEqual(calculateService({mode:'continuous',startDate:'2024-01-31'},'2024-01-31').current,duration(0,0,0))
 assert.deepEqual(calculateService({mode:'continuous',startDate:'2024-01-31'},'2024-02-29').current,duration(0,1,0))
 assert.equal(calculateService({mode:'continuous',startDate:'2024-02-01'},'2024-01-31').reason,'before_baseline')
 assert.equal(calculateService({...snapshot,years:4,asOfDate:'2024-02-01'},'2024-01-31').reason,'before_baseline')
})
test('snapshot anchor anniversaries use real month lengths, leap days and the existing carry convention',()=>{
 for(const [anchor,on,expected] of [
  ['2024-01-31','2024-02-01',duration(0,0,1)],['2024-01-31','2024-02-29',duration(0,1,0)],['2023-01-31','2023-02-28',duration(0,1,0)],
  ['2023-01-31','2023-03-30',duration(0,1,30)],['2023-01-31','2023-03-31',duration(0,2,0)],['2024-02-29','2025-02-28',duration(1,0,0)],
  ['2024-02-29','2025-03-01',duration(1,0,1)],['2023-12-31','2024-01-01',duration(0,0,1)],['2024-04-30','2024-05-30',duration(0,1,0)],
 ])assert.deepEqual(calculateService({...snapshot,asOfDate:anchor},on).current,expected,anchor+' '+on)
 const short={...snapshot,years:2,months:11,days:30,asOfDate:'2023-02-01'}
 assert.deepEqual(calculateService(short,'2023-02-01').current,duration(2,11,30));assert.deepEqual(calculateService(short,'2023-02-02').current,duration(3,0,3))
})
test('period accounting sums inclusive real calendar days and handles gaps, adjacency, leap days and closed history',()=>{
 for(const [periods,on,expected,accrues] of [
  [[period('2024-01-01','2024-01-01')],'2024-01-01',duration(0,0,1),false],
  [[period('2024-01-01','2024-01-31'),period('2024-02-01','2024-02-29')],'2024-02-29',duration(0,2,0),false],
  [[period('2024-01-01','2024-01-10'),period('2024-01-11','2024-01-20')],'2024-01-20',duration(0,0,20),false],
  [[period('2024-01-01','2024-01-10'),period('2024-03-01',null)],'2024-03-02',duration(0,0,12),true],
 ]) {
  const result=calculateService({mode:'periods',periods},on);assert.equal(result.status,'calculated');assert.deepEqual(result.current,expected);assert.equal(result.accrues,accrues);assert.equal(result.accuracy,'estimate')
 }
})
test('period validator rejects intersections, unsorted/open ordering, duplicate IDs, invalid and future dates',()=>{
 const valid=[period('2020-01-01','2020-01-31'),period('2020-02-01',null)]
 const cases=[
  [[period('2020-01-01','2020-02-02'),period('2020-02-01',null)],'overlap'],
  [[period('2020-01-01',null),period('2020-02-01','2020-02-02')],'period_order'],
  [[period('2020-02-01','2020-02-02'),period('2020-01-01','2020-01-31')],'overlap'],
  [[period('2020-01-01','2020-01-31','same'),period('2020-02-01',null,'same')],'invalid_input'],
  [[period('2020-02-30',null)],'invalid_input'],[[period('2020-01-01','2025-01-01')],'invalid_input'],
  [[period('2025-01-01',null)],'invalid_input'],[[period('2020-01-01',null),period('2020-02-01',null)],'multiple_open_periods'],
 ]
 for(const [periods,reason] of cases)assert.equal(calculateService({mode:'periods',periods},'2024-01-01').reason,reason)
 assert.equal(calculateService({mode:'periods',periods:valid},'2020-01-01').reason,'invalid_input')
})
test('allowance thresholds remain strict and forecasts require a source that accrues',()=>{
 let prior=0
 for(const threshold of allowanceThresholds){
  assert.equal(allowanceForDuration(duration(threshold.years,0,0)).percentage,prior)
  assert.equal(allowanceForDuration(duration(threshold.years,0,1)).percentage,threshold.percentage)
  const source={mode:'snapshot',years:threshold.years,months:0,days:0,asOfDate:'2026-01-01'}
  const result=projectService(source,'2026-01-01','official',null)
  assert.equal(result.percentage,prior);assert.equal(result.nextThreshold.years,threshold.years);assert.equal(result.reviewOn,'2026-01-02')
  prior=threshold.percentage
 }
 const closed={mode:'periods',periods:[period('2020-01-01','2025-01-01')]}
 assert.equal(calculateService(closed,'2025-01-01').accrues,false)
 assert.equal(projectService(closed,'2025-01-01','official',null).reviewOn,null)
 const open={mode:'periods',periods:[period('2020-01-01',null)]}
 assert.ok(calculateService(open,'2025-01-01').current.years>=5)
 assert.equal(projectService(open,'2025-01-01','official',null).reviewOn,'2030-01-01')
 assert.equal(projectService({...closed,periods:[period('2020-01-01','2025-01-01')]},'2025-01-01','staff',null).status,'not_applicable')
})
test('invalid snapshot data, numeric overflow and year boundaries never produce fake dates',()=>{
 for(const patch of [{years:-1},{years:Number.MAX_SAFE_INTEGER+1},{months:12},{days:31},{asOfDate:'2025-02-29'}])assert.equal(calculateService({...snapshot,...patch},'2026-01-01').status,'requires_review')
 assert.equal(calculateService(snapshot,'not a date').reason,'invalid_input')
 assert.equal(calculateService({...snapshot,years:Number.MAX_SAFE_INTEGER,months:11},'2025-01-31').reason,'overflow')
 assert.equal(projectService({...snapshot,years:3,asOfDate:'9999-12-30'},'9999-12-30','official',null).reviewOn,null)
})
