import test from 'node:test'
import assert from 'node:assert/strict'
import {submitDocument,updateOutcome} from '../src/components/documents/mutations.ts'
import {documentRows,emptyDocumentFilters,documentSeriesLabel} from '../src/components/documents/model.ts'

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

test('series names participate in search, series filter is independent and update verification includes seriesId',()=>{
 const base={id:'d1',kind:'head_order',customKind:null,number:'001-к',issuedOn:'2027-01-01',title:'Приклад',note:null,employeeIds:[],seriesId:'s1',revision:1}
 const rows=[base,{...base,id:'d2',seriesId:'s2'},{...base,id:'d3',seriesId:null}]
 const series=[{id:'s1',name:'Службова серія'},{id:'s2',name:'Інша серія'}],sort={key:'issuedOn',direction:'desc'}
 assert.deepEqual(documentRows(rows,[],{...emptyDocumentFilters,query:'СЛУЖБОВА'},sort,series).map(d=>d.id),['d1'])
 assert.deepEqual(documentRows(rows,[],{...emptyDocumentFilters,series:'s2'},sort,series).map(d=>d.id),['d2'])
 const {revision,...input}=base
 const payload={...input,expectedRevision:0}
 assert.equal(updateOutcome(base,payload),'saved');assert.equal(updateOutcome({...base,seriesId:'s2'},payload),'stale')
})

test('equal document numbers and equal series names remain distinguishable by series code without treating archived series as invalid',()=>{
 const active={id:'s1',name:'Кадрові документи',code:'alpha',active:true},archived={...active,id:'s2',code:'beta',active:false}
 assert.equal(documentSeriesLabel(active),'Кадрові документи · alpha')
 assert.equal(documentSeriesLabel(archived),'Кадрові документи · beta')
 assert.notEqual(documentSeriesLabel(active),documentSeriesLabel(archived))
 assert.equal(documentSeriesLabel(undefined),'Серія недоступна')
 const base={kind:'head_order',customKind:null,number:'001-к',issuedOn:'2027-01-01',title:'Приклад',employeeIds:[]}
 const rows=[{...base,id:'doc-a',seriesId:'s1'},{...base,id:'doc-b',seriesId:'s2'}]
 assert.deepEqual(documentRows(rows,[],{...emptyDocumentFilters,query:'001-к'},{key:'issuedOn',direction:'desc'},[active,archived]).map(r=>r.id),['doc-a','doc-b'])
})
