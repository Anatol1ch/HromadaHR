import test from 'node:test'
import assert from 'node:assert/strict'
import { documentDraft, documentInput, documentDraftErrors, selectDocumentEmployee, reconcileDocumentEmployees } from '../src/components/documents/model.ts'
import { submitDocument, updateOutcome } from '../src/components/documents/mutations.ts'
const record={id:'d1',kind:'head_order',customKind:null,number:'001-к',issuedOn:'2026-11-12',title:'Про відпустку',note:null,employeeIds:['e1'],revision:0,createdAt:'2026-11-12T10:00:00.000Z',updatedAt:'2026-11-12T10:00:00.000Z'}
const input=()=>documentInput(documentDraft(record))
const payload=()=>({kind:'create',input:{...input(),requestId:'same-draft-request'}})
const attempt=()=>({pending:false,unresolved:null})
const ok=data=>({ok:true,data})
const fail=code=>({ok:false,error:{code}})

test('legacy multiple employee links remain intact until explicit reconciliation and cannot be truncated by Select or submit',()=>{
 const original=documentDraft({...record,employeeIds:['e1','e2']}),copy=[...original.employeeIds]
 assert.deepEqual(original.employeeIds,copy);assert.ok(documentDraftErrors(original).employeeIds)
 assert.throws(()=>documentInput(original));assert.throws(()=>selectDocumentEmployee(original,'e3'))
 const reconciled=reconcileDocumentEmployees(original)
 assert.deepEqual(reconciled.employeeIds,[]);assert.deepEqual(original.employeeIds,copy)
 assert.deepEqual(documentInput(selectDocumentEmployee(reconciled,'e3')).employeeIds,['e3'])
})

test('uncertain create retains the same request and immutable payload through BUSY and a changed caller draft',async()=>{
 const state=attempt(),sent=[];let calls=0
 const api={createDocument:async value=>{sent.push(structuredClone(value));if(++calls===1)throw Error('transport after commit');if(calls===2)return fail('BUSY');return ok(record)}}
 const original=payload();assert.equal((await submitDocument(api,state,original)).error.code,'UNAVAILABLE')
 assert.ok(state.unresolved);original.input.title='Changed outside attempt';original.input.employeeIds.push('e2')
 const different=payload();different.input.number='999'
 assert.equal((await submitDocument(api,state,different)).error.code,'BUSY');assert.ok(state.unresolved)
 assert.deepEqual(await submitDocument(api,state,different),ok(record));assert.equal(state.unresolved,null)
 assert.deepEqual(sent[0],sent[1]);assert.deepEqual(sent[0],sent[2]);assert.equal(sent[0].number,'001-к');assert.deepEqual(sent[0].employeeIds,['e1'])
})

test('a pending document mutation admits no second invocation; definitive errors preserve the editable draft',async()=>{
 const state=attempt();let complete,calls=0
 const api={createDocument:()=>{calls++;return new Promise(resolve=>{complete=resolve})}}
 const first=submitDocument(api,state,payload());assert.equal(state.pending,true)
 assert.equal(await submitDocument(api,state,payload()),null);assert.equal(calls,1)
 complete(fail('DOCUMENT_NUMBER_CONFLICT'));assert.equal((await first).error.code,'DOCUMENT_NUMBER_CONFLICT')
 assert.equal(state.pending,false);assert.equal(state.unresolved,null)
})

test('uncertain update requires read verification instead of blind repeat; revision and every field determine the result',async()=>{
 const state=attempt(),change={...input(),id:record.id,expectedRevision:0,title:'Оновлено'};let calls=0
 const api={updateDocument:async()=>{calls++;throw Error('transport')}}
 await submitDocument(api,state,{kind:'edit',input:change});assert.equal(calls,1)
 await submitDocument(api,state,{kind:'edit',input:change});assert.equal(calls,1)
 assert.equal(updateOutcome({...record,title:'Оновлено',revision:1},change),'saved')
 assert.equal(updateOutcome(record,change),'unchanged')
 assert.equal(updateOutcome({...record,revision:1},change),'stale')
 assert.equal(updateOutcome({...record,title:'Оновлено',revision:2},change),'stale')
 assert.equal(updateOutcome({...record,title:'Оновлено',employeeIds:[],revision:1},change),'stale')
 const seriesChange={...change,seriesId:'series-a'}
 assert.equal(updateOutcome({...record,title:'Оновлено',seriesId:'series-a',revision:1},seriesChange),'saved')
 assert.equal(updateOutcome({...record,title:'Оновлено',seriesId:'series-b',revision:1},seriesChange),'stale')
})

test('uncertain automatic creation retains initial intent/requestId without an invented number or a second pending write',async()=>{
 const input={requestId:'one-draft',seriesId:'s1',kind:'head_order',customKind:null,issuedOn:'2027-01-01',title:'Приклад',note:null,employeeIds:[]}
 const state={pending:false,unresolved:null},sent=[];let finish
 const api={createAutoNumberedDocument:async input=>{sent.push(structuredClone(input));if(sent.length===1)throw Error('transport after commit');return new Promise(resolve=>{finish=resolve})}}
 await submitDocument(api,state,{kind:'automatic',input});input.seriesId='changed'
 const repeat=submitDocument(api,state,{kind:'automatic',input})
 assert.equal(await submitDocument(api,state,{kind:'automatic',input}),null)
 assert.deepEqual(sent[0],sent[1]);assert.equal('number' in sent[1],false);assert.equal(sent[1].seriesId,'s1')
 finish({ok:true,data:{id:'d1',number:'001-к'}});assert.equal((await repeat).data.number,'001-к');assert.equal(state.unresolved,null)
})
