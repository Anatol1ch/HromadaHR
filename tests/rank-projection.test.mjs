import test from 'node:test'
import assert from 'node:assert/strict'
import { projectRank,categoryRanks } from '../dist-electron/shared/rank-projection.js'
import { positionCategories } from '../dist-electron/shared/personnel.js'
import { rankOrigins } from '../dist-electron/shared/seniority-ranks.js'
import { draftFor,rankInput,validateDraft } from '../src/components/seniority-ranks/model.ts'
const e={employeeType:'official',positionCategory:'VII',positionStartedOn:'2024-06-15'}
const rank={employeeId:'11111111-1111-4111-8111-111111111111',rank:15,assignedOn:'2023-01-01',effectiveOn:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:'2030-01-01',confirmedAt:'2024-01-01T00:00:00.000Z',origin:'oms_assigned',reviewAnchorOn:null,originNote:null}
const run=(employee=e,r=rank,on='2026-01-01')=>projectRank(employee,r,on)
test('all category bounds and one-number progression share one matrix',()=>{
 positionCategories.forEach((category,index)=>{
  const range=categoryRanks[category]
  assert.equal(range.length,3);assert.equal(range[0],index*2+1);assert.equal(range[2],index*2+3)
  for(const current of range){
   const result=run({...e,positionCategory:category},{...rank,rank:current})
   if(current===range[0]){assert.equal(result.status,'category_limit_reached');assert.equal(result.nextRank,null)}
   else {assert.equal(result.status,'projected');assert.equal(result.nextRank,current-1);assert.ok(range.includes(result.nextRank))}
  }
 })
 assert.equal(run().nextRank,14)
 assert.equal(run({...e,positionCategory:'VI'},{...rank,rank:13}).nextRank,12)
 for(const [category,current] of [['VII',13],['VI',11],['V',9]])assert.equal(run({...e,positionCategory:category},{...rank,rank:current}).status,'category_limit_reached')
})
test('higher retained rank, below-range rank, missing facts and staff never fabricate an ordinary next rank',()=>{
 const higher=run(e,{...rank,rank:6});assert.equal(higher.status,'retained_higher_rank');assert.equal(higher.rank.rank,6);assert.equal(higher.nextRank,null);assert.equal(higher.reviewOn,null)
 const lower=run({...e,positionCategory:'VI'},rank);assert.equal(lower.reason,'lower_rank');assert.equal(lower.nextRank,null)
 assert.equal(run({...e,positionCategory:null}).reason,'missing_category')
 assert.equal(run({...e,positionStartedOn:null}).reason,'missing_appointment')
 assert.equal(run(e,null).reason,'missing_rank')
 assert.equal(run({...e,employeeType:'staff',positionCategory:null}).status,'not_applicable')
})
test('origins require suitable explicit anchors, preserve special cases and manual dates',()=>{
 assert.equal(run(e,{...rank,origin:'unknown'}).reason,'unknown_origin')
 assert.equal(run(e,{...rank,origin:'pension_exception',reviewAnchorOn:'2024-01-01'}).reason,'pension_exception')
 for(const origin of rankOrigins.filter(o=>!['unknown','oms_assigned','pension_exception'].includes(o))){
  assert.equal(run(e,{...rank,origin}).reason,'missing_anchor')
  const projected=run(e,{...rank,origin,reviewAnchorOn:'2025-01-01'})
  assert.equal(projected.status,'projected');assert.equal(projected.reviewOn,'2027-01-01');assert.equal(projected.reason,'explicit_anchor')
 }
 const earlier=run({...e,positionStartedOn:'2021-01-01'},{...rank,origin:'civil_service_equivalence',assignedOn:'2025-01-01',reviewAnchorOn:'2022-01-01'})
 assert.equal(earlier.reviewOn,'2024-01-01');assert.equal(earlier.timing,'past');assert.equal(earlier.rank.reviewOn,'2030-01-01')
 assert.equal(run(e,{...rank,reviewAnchorOn:'2099-01-01'}).reason,'future_anchor')
})
test('two calendar years clamp leap day and timing includes today without inventing entitlement',()=>{
 const leap={...e,positionStartedOn:'2024-02-29'},r={...rank,assignedOn:'2024-01-01'}
 for(const [on,timing] of [['2026-02-27','future'],['2026-02-28','today'],['2026-03-01','past']]){
  const result=run(leap,r,on);assert.equal(result.reviewOn,'2026-02-28');assert.equal(result.anchorOn,'2024-02-29');assert.equal(result.accuracy,'estimate');assert.equal(result.timing,timing)
 }
 assert.equal(run(e,rank).reviewOn,'2026-06-15')
 assert.equal(run({...e,positionStartedOn:'9998-01-01'},{...rank,assignedOn:'9998-01-01'},'9999-01-01').reason,'date_range')
 for(const patch of [{assignedOn:'2026-02-30'},{assignedOn:'2099-01-01'},{reviewAnchorOn:'bad'},{rank:16},{origin:'invalid'}])assert.equal(run(e,{...rank,...patch}).status,'requires_review')
})
test('rank form roundtrips origin facts and validates only rank-specific drafts',()=>{
 const draft=draftFor({...rank,origin:'oms_retained',reviewAnchorOn:'2020-02-29',originNote:'Документальне пояснення'})
 const input=rankInput(draft)
 assert.equal(input.origin,'oms_retained');assert.equal(input.reviewAnchorOn,'2020-02-29');assert.equal(input.originNote,'Документальне пояснення')
 for(const patch of [{origin:'bad'},{reviewAnchorOn:'31.02.2024'},{originNote:'x'.repeat(501)}])assert.ok(Object.keys(validateDraft('rank',{...draft,...patch})).length)
 const clean={...draft,reviewAnchorOn:'',originNote:''};assert.equal(rankInput(clean).reviewAnchorOn,null);assert.equal(rankInput(clean).originNote,null)
 const copy=structuredClone(rank);run(e,rank);assert.deepEqual(rank,copy)
})
