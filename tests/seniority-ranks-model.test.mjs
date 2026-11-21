import test from 'node:test'
import assert from 'node:assert/strict'
import { allowanceInput, rankInput, draftFor, validateDraft, canSaveAllowanceDraft, canSaveRankDraft, allowanceHireDateDraft } from '../src/components/seniority-ranks/model.ts'
import { personnelMessage } from '../src/employees/model.ts'
const basis={documentType:null,documentNumber:null,documentDate:null}
const confirmed={...basis,status:'confirmed',percentage:0,effectiveOn:'2020-02-29'}
const notApplicable={...basis,status:'not_applicable',percentage:null,effectiveOn:null}
const rank={...basis,origin:'oms_assigned',reviewAnchorOn:null,rank:13,assignedOn:'2020-02-29'}
test('forms require explicit rank origin and use assignment date as the only rank date',()=>{
 const empty=draftFor(null)
 assert.equal(empty.percentage,'');assert.equal(empty.rank,'')
 assert.ok(validateDraft('allowance',empty).percentage)
 assert.ok(validateDraft('allowance',empty).effectiveOn)
 assert.ok(validateDraft('rank',empty).rank)
 assert.ok(validateDraft('rank',empty).assignedOn)
 assert.throws(()=>allowanceInput(empty))
 assert.deepEqual(allowanceInput(draftFor(confirmed)),confirmed)
 assert.deepEqual(rankInput(draftFor(rank)),rank)
 assert.deepEqual(allowanceInput({...draftFor(confirmed),status:'not_applicable'}),notApplicable)
 const reviewed={...draftFor(rank),documentDate:'01.01.2099'}
 assert.ok(validateDraft('rank',{...reviewed,assignedOn:'01.01.2099'}).assignedOn)
 assert.equal(rankInput(reviewed).documentDate,'2099-01-01')
 assert.equal(validateDraft('rank',empty).origin,'Оберіть один із чинних варіантів походження рангу.')
})
test('calendar drafts, future dates, mandatory fields and text limits are validated before conversion',()=>{
 const base=draftFor(confirmed)
 for(const effectiveOn of ['29.02.2025','31.04.2020','2020-01-01','01.01.2099','']) {
  assert.ok(validateDraft('allowance',{...base,effectiveOn}).effectiveOn)
  assert.throws(()=>allowanceInput({...base,effectiveOn}))
 }
 assert.ok(validateDraft('allowance',{...base,documentDate:'некоректно'}).documentDate)
 assert.equal(validateDraft('allowance',{...base,reviewOn:'31.02.2025'}).reviewOn,undefined)
 assert.ok(validateDraft('allowance',{...base,documentType:'x'.repeat(201)}).documentType)
 assert.ok(validateDraft('rank',{...draftFor(rank),documentNumber:'x'.repeat(101)}).documentNumber)
 assert.ok(validateDraft('rank',{...draftFor(rank),assignedOn:'01.01.2099'}).assignedOn)
 assert.deepEqual(validateDraft('allowance',base,'2020-02-29'),{})
 assert.match(personnelMessage('RANK_REQUIRES_OFFICIAL'),/посадової особи/)
 assert.match(personnelMessage('EMPLOYEE_HAS_CURRENT_RANK'),/очистіть поточний ранг/)
})
test('allowance save requires a changed valid draft, permits explicitly selected not-applicable and optional documents',()=>{
 const initial=draftFor(null),valid={...initial,percentage:'10',effectiveOn:'01.01.2020'}
 assert.equal(canSaveAllowanceDraft(initial,false,false),false)
 assert.equal(canSaveAllowanceDraft(valid,false,false),false)
 assert.equal(canSaveAllowanceDraft(initial,true,false),false)
 assert.equal(canSaveAllowanceDraft({...valid,documentDate:'31.02.2020'},true,false),false)
 assert.equal(canSaveAllowanceDraft(valid,true,true),false)
 assert.equal(canSaveAllowanceDraft(valid,true,false),true)
 const notApplicable={...initial,status:'not_applicable'}
 assert.equal(canSaveAllowanceDraft(notApplicable,true,false),true)
 assert.equal(canSaveAllowanceDraft({...notApplicable,documentType:'x'.repeat(201)},true,false),false)
 assert.equal(canSaveRankDraft(draftFor(rank),false,false),false)
 assert.equal(canSaveRankDraft(draftFor(rank),true,true),false)
 assert.equal(canSaveRankDraft(draftFor(rank),true,false),true)
})
test('allowance hire-date shortcut accepts only valid non-future dates',()=>{
 assert.equal(allowanceHireDateDraft('2020-02-29','2026-11-21'),'29.02.2020')
 assert.equal(allowanceHireDateDraft('2026-11-22','2026-11-21'),null)
 assert.equal(allowanceHireDateDraft('2026-02-30','2026-11-21'),null)
 assert.equal(allowanceHireDateDraft('','2026-11-21'),null)
})
