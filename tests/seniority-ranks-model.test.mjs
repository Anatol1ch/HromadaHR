import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { allowanceInput, rankInput, draftFor, validateDraft, allowanceLabel, rankLabel, filterOverview, overviewStructure, nextReview, updateIndicator, directionsFor, documentTypeOptions, documentTypes, documentLabel, toggleSeparateDate, canCopyDocumentDate, copyDocumentDate } from '../src/components/seniority-ranks/model.ts'
import { personnelMessage } from '../src/employees/model.ts'
const basis={documentType:null,documentNumber:null,documentDate:null,reviewOn:null}
const confirmed={...basis,status:'confirmed',percentage:0,effectiveOn:'2020-02-29'}
const notApplicable={...basis,status:'not_applicable',percentage:null,effectiveOn:null}
const rank={...basis,origin:'unknown', reviewAnchorOn:null, originNote:null, rank:13,assignedOn:'2020-02-29',effectiveOn:null}
function row(id,type,allowance=null,current=null) { return {employee:{id,lastName:id,firstName:'Тест',middleName:null,employeeType:type,position:{name:'Інспектор'},department:{name:'Відділ'}},allowance,rank:current} }
test('missing, zero, not applicable and staff ranks remain distinct in registry filters',()=>{
 assert.equal(allowanceLabel(null),'Не внесено')
 assert.equal(allowanceLabel(confirmed),'0%')
 assert.equal(allowanceLabel(notApplicable),'Не застосовується')
 assert.equal(rankLabel(row('a','staff')),'Не застосовується')
 assert.equal(rankLabel(row('b','official')),'Не внесено')
 const rows=[row('Я','official',null),row('Б','official',confirmed,rank),row('А','staff',notApplicable)]
 const filters={query:'',type:'',allowance:'',rank:''}
 assert.deepEqual(filterOverview(rows,filters).map(r=>r.employee.id),['А','Б','Я'])
 assert.deepEqual(filterOverview(rows,{...filters,rank:'missing'}).map(r=>r.employee.id),['Я'])
 assert.equal(filterOverview(rows,{...filters,rank:'assigned'}).length,1)
 assert.equal(filterOverview(rows,{...filters,allowance:'confirmed'})[0].allowance.percentage,0)
 assert.equal(filterOverview(rows,{...filters,allowance:'not_applicable'})[0].employee.employeeType,'staff')
 assert.equal(filterOverview(rows,{...filters,query:'інспектор ВІДДІЛ'}).length,3)
 assert.equal(filterOverview(rows,{...filters,type:'staff',rank:'missing'}).length,0)
})
test('forms require explicit values and keep optional rank effective date null',()=>{
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
 const reviewed={...draftFor(rank),reviewOn:'01.01.2099',documentDate:'01.01.2099'}
 assert.equal(rankInput(reviewed).reviewOn,'2099-01-01')
 assert.equal(rankInput(reviewed).documentDate,'2099-01-01')
})
test('calendar drafts, future dates, mandatory fields and text limits are validated before conversion',()=>{
 const base=draftFor(confirmed)
 for(const effectiveOn of ['29.02.2025','31.04.2020','2020-01-01','01.01.2099','']) {
  assert.ok(validateDraft('allowance',{...base,effectiveOn}).effectiveOn)
  assert.throws(()=>allowanceInput({...base,effectiveOn}))
 }
 assert.ok(validateDraft('allowance',{...base,documentDate:'некоректно'}).documentDate)
 assert.ok(validateDraft('allowance',{...base,reviewOn:'31.02.2025'}).reviewOn)
 assert.ok(validateDraft('allowance',{...base,documentType:'x'.repeat(201)}).documentType)
 assert.ok(validateDraft('rank',{...draftFor(rank),documentNumber:'x'.repeat(101)}).documentNumber)
 assert.ok(validateDraft('rank',{...draftFor(rank),assignedOn:'01.01.2099'}).assignedOn)
 assert.deepEqual(validateDraft('allowance',base,'2020-02-29'),{})
 assert.match(personnelMessage('RANK_REQUIRES_OFFICIAL'),/посадової особи/)
 assert.match(personnelMessage('EMPLOYEE_HAS_CURRENT_RANK'),/очистіть поточний ранг/)
})

test('seniority registry shares department/position order, directory names and stable Ukrainian name ties',()=>{
 const dirs={department:[{id:'second',name:'Відділ 2'},{id:'first',name:'Відділ 1'}],position:[{id:'chief',name:'Керівник'},{id:'expert',name:'Фахівець'}]}
 const make=(id,name,departmentId,positionId)=>({...row(id,'official'),employee:{...row(id,'official').employee,lastName:name,departmentId,positionId}})
 const rows=[make('z','Яворів','first','chief'),make('b','Іваненко','second','expert'),make('a','Іваненко','second','expert'),make('c','Яворів','second','chief')]
 const groups=overviewStructure(filterOverview(rows,{query:'',type:'',rank:'',allowance:''}),dirs)
 assert.deepEqual(groups.map(g=>g.id),['second','first'])
 assert.deepEqual(groups[0].rows.map(e=>e.id),['c','a','b'])
 assert.equal(groups[0].rows[0].position.name,'Керівник')
 assert.equal(groups[0].rows[0].department.name,'Відділ 2')
 assert.equal(overviewStructure(rows,{...dirs,position:[]}),null)
})
test('nearest manual review date and independent indicator updates preserve the other value',()=>{
 const original=row('a','official',{...confirmed,reviewOn:'2028-01-01'},{...rank,reviewOn:'2027-01-01'})
 assert.equal(nextReview(original),'2027-01-01')
 assert.equal(nextReview(row('empty','staff')),null)
 const updated=updateIndicator(original,'allowance',notApplicable)
 assert.equal(updated.rank,original.rank)
 assert.equal(updated.employee,original.employee)
 assert.equal(updateIndicator(original,'rank',null).allowance,original.allowance)
 assert.equal(original.allowance.percentage,0)
 const draft={...draftFor(rank),effectiveOn:''}
 assert.equal(rankInput(draft).effectiveOn,null)
})

test('rank precedes allowance for officials; staff opens allowance; navigation uses the accepted name',()=>{
 assert.deepEqual(directionsFor('official'),['rank','allowance'])
 assert.deepEqual(directionsFor('staff'),['allowance'])
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(app,/id: 'service'/)
 assert.match(app,/id: 'documents', title: 'Документи'/)
 for(const file of ['src/App.tsx','src/employees/model.ts','src/components/seniority-ranks/IndicatorEditor.tsx','src/components/seniority-ranks/SeniorityRanksWorkspace.tsx']) {
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  assert.equal(source.includes('Стаж і ранги'),false)
 }
})
test('document Select roundtrips null, all supported values and preserved legacy values',()=>{
 assert.equal(documentTypeOptions('')[0].label,'Не зазначено')
 assert.equal(allowanceInput(draftFor(confirmed)).documentType,null)
 for(const documentType of [...documentTypes,'Наказ попереднього роботодавця']) {
  const saved={...rank,documentType}
  assert.ok(documentTypeOptions(documentType).some(option=>option.value===documentType))
  assert.equal(rankInput(draftFor(saved)).documentType,documentType)
  assert.equal(allowanceInput({...draftFor(confirmed),documentType}).documentType,documentType)
 }
 assert.equal(documentTypeOptions(documentTypes[0]).length,4)
 assert.equal(documentTypeOptions('Наказ').length,5)
 assert.equal(documentLabel({...basis,documentType:'Розпорядження голови',documentNumber:'125-р',documentDate:'2026-09-01'}),'Розпорядження голови № 125-р від 01.09.2026')
 assert.equal(documentLabel(null),'')
})
test('separate rank date is explicit, initializes from assigned date and clears to null without duplicates',()=>{
 const initial=draftFor(rank)
 const enabled=toggleSeparateDate(initial,true)
 assert.equal(enabled.effectiveOn,initial.assignedOn)
 assert.equal(rankInput(enabled).effectiveOn,null)
 const custom={...enabled,effectiveOn:'01.03.2020'}
 assert.equal(rankInput(custom).effectiveOn,'2020-03-01')
 assert.equal(rankInput(toggleSeparateDate(custom,false)).effectiveOn,null)
 assert.equal(initial.effectiveOn,'')
 assert.equal(toggleSeparateDate({...initial,assignedOn:'не дата'},true).effectiveOn,'')
 assert.equal(draftFor({...rank,effectiveOn:'2020-03-01'}).effectiveOn,'01.03.2020')
 assert.ok(validateDraft('rank',{...enabled,effectiveOn:'31.02.2020'}).effectiveOn)
})
test('copying document date is one explicit bounded change and preserves unrelated drafts',()=>{
 const initial={...draftFor(confirmed),documentDate:'01.03.2020',reviewOn:'незавершена чернетка'}
 const copied=copyDocumentDate(initial,'2026-11-11')
 assert.equal(canCopyDocumentDate(initial,'2026-11-11'),true)
 assert.equal(copied.effectiveOn,'01.03.2020')
 assert.equal(copied.reviewOn,initial.reviewOn)
 assert.equal(initial.effectiveOn,'29.02.2020')
 assert.equal({...copied,documentDate:'02.03.2020'}.effectiveOn,'01.03.2020')
 for(const documentDate of ['','31.02.2020','12.11.2026']) {
  const draft={...initial,documentDate}
  assert.equal(canCopyDocumentDate(draft,'2026-11-11'),false)
  assert.equal(copyDocumentDate(draft,'2026-11-11'),draft)
 }
 const original=row('a','official',confirmed,rank)
 const result=updateIndicator(original,'allowance',allowanceInput({...copied,reviewOn:''}))
 assert.equal(result.rank,original.rank)
})
