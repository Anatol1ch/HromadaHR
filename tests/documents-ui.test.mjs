import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { documentRows, emptyDocumentFilters, documentDraft, documentInput, documentDraftErrors, changeDocumentKind, selectDocumentEmployee, reconcileDocumentEmployees, kindLabel } from '../src/components/documents/model.ts'
import { submitDocument, updateOutcome } from '../src/components/documents/mutations.ts'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { confirmModalClose, getCloseConfirmation, finishCloseConfirmation } from '../src/components/closeConfirmation.ts'
const read=name=>readFileSync(new URL('../src/components/documents/'+name,import.meta.url),'utf8')
const worker={id:'e1',lastName:'Коваль',firstName:'Олена',middleName:'Іванівна'}
const record={id:'d1',kind:'head_order',customKind:null,number:'001-к',issuedOn:'2026-11-12',title:'Про відпустку',note:null,employeeIds:['e1'],revision:0,createdAt:'2026-11-12T10:00:00.000Z',updatedAt:'2026-11-12T10:00:00.000Z'}
const input=()=>documentInput(documentDraft(record))
const payload=()=>({kind:'create',input:{...input(),requestId:'same-draft-request'}})
const attempt=()=>({pending:false,unresolved:null})
const ok=data=>({ok:true,data})
const fail=code=>({ok:false,error:{code}})

test('registry searches all supported fields in Unicode, filters kind/year/worker and sorts text with stable ties',()=>{
 const rows=[record,{...record,id:'d2',kind:'other',customKind:'Довідка',number:'123/2026',issuedOn:'2025-01-01',title:'И\u0306нше',employeeIds:[]}, {...record,id:'d0'}]
 const select=(filters={},sort={key:'issuedOn',direction:'desc'})=>documentRows(rows,[worker],{...emptyDocumentFilters,...filters},sort).map(row=>row.id)
 assert.deepEqual(select(),['d0','d1','d2'])
 for(const query of ['001-к','ВІДПУСТКУ','Коваль ОЛЕНА','розпорядження селищного голови'])assert.deepEqual(select({query}),['d0','d1'])
 assert.deepEqual(select({query:'Йнше'}),['d2']);assert.deepEqual(select({query:'ДОВІДКА'}),['d2'])
 assert.deepEqual(select({kind:'other',year:'2025'}),['d2']);assert.deepEqual(select({employee:'e1',year:'2026'}),['d0','d1'])
 assert.deepEqual(select({employee:'missing'}),[])
 for(const key of ['issuedOn','number','kind','title'])assert.equal(select({}, {key,direction:'asc'}).length,3)
 assert.equal(rows[0].number,'001-к');assert.deepEqual(rows.map(row=>row.id),['d1','d2','d0'])
 assert.equal(kindLabel(rows[1]),'Довідка')
})

test('one employee Select maps to a singleton or empty array without changing number/date semantics',()=>{
 const original=documentDraft(record),changed=selectDocumentEmployee(original,'e2')
 assert.deepEqual(documentInput(changed).employeeIds,['e2']);assert.deepEqual(original.employeeIds,['e1'])
 assert.deepEqual(documentInput(selectDocumentEmployee(changed,'')).employeeIds,[])
 assert.equal(documentInput(original).number,'001-к');assert.equal(original.issuedOn,'12.11.2026');assert.equal(documentInput(original).issuedOn,'2026-11-12')
 const other=changeDocumentKind({...original,customKind:'Довідка'},'other');assert.equal(documentInput(other).customKind,'Довідка')
 const ordinary=changeDocumentKind(other,'head_order');assert.equal(ordinary.customKind,'');assert.equal(documentInput(ordinary).customKind,null)
 assert.equal(documentInput({...ordinary,note:'   '}).note,null)
 assert.ok(documentDraftErrors({...original,issuedOn:'31.02.2026'}).issuedOn)
})

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
})

test('tab changes use the shared guard once; rejecting exit preserves the selected screen and busy blocks navigation',()=>{
 const guards=createCloseGuards(),owner={isConnected:true};let busy=false,view='documents'
 guards.register({dirty:()=>true,busy:()=>busy,confirm:(dirty,next)=>confirmModalClose(dirty,next,owner)})
 const navigate=()=>guards.requestAll(()=>{view='leave'})
 navigate();const confirmation=getCloseConfirmation();navigate();assert.equal(getCloseConfirmation(),confirmation)
 finishCloseConfirmation(confirmation,false);assert.equal(view,'documents')
 busy=true;navigate();assert.equal(getCloseConfirmation(),null);assert.equal(view,'documents')
 busy=false;navigate();finishCloseConfirmation(getCloseConfirmation(),true);assert.equal(view,'leave')
})

test('component boundaries retain both registries, fresh reads, one employee Select and safe read/delete/editor states',()=>{
 const workspace=read('DocumentsWorkspace.tsx'),registry=read('PersonnelDocumentsRegistry.tsx'),editor=read('PersonnelDocumentEditor.tsx'),details=read('PersonnelDocumentDetails.tsx'),panel=read('PersonnelDocumentsPanel.tsx'),leave=read('LeaveDocumentsJournal.tsx')
 assert.match(workspace,/useState<'documents'\|'leave'>\('documents'\)/)
 assert.match(workspace,/navigationGuard.current/);assert.match(workspace,/hidden=\{view!=='documents'\} inert=/)
 assert.match(workspace,/<PersonnelDocumentsPanel/);assert.match(workspace,/leaveVisited&&<LeaveDocumentsJournal/)
 assert.match(panel,/hidden=\{selected!==null\}/);assert.doesNotMatch(panel,/selected===null&&<PersonnelDocumentsRegistry/)
 assert.match(registry,/documents.listDocuments\(\)/);assert.match(registry,/personnel.listEmployees\(\)/);assert.doesNotMatch(registry,/getDocument\(/)
 assert.match(editor,/documents.getDocument\(props.id\)/);assert.match(details,/documents.getDocument\(id\)/)
 assert.match(editor,/useState\(\(\)=>crypto.randomUUID\(\)\)/);assert.match(editor,/useUnsavedChanges/)
 assert.match(editor,/label="Працівник документа" searchable/);assert.match(editor,/onClear=/);assert.doesNotMatch(editor,/multiselect|addDocumentEmployee|Прибрати працівника/)
 assert.match(editor,/missing\|\|multiple/);assert.match(editor,/ConfirmDialog title="Узгодити зв’язки документа/)
 assert.match(editor,/requestClose\(reloadRecord\)/);assert.match(editor,/returnFocus=\{props.returnFocus\}/)
 assert.match(editor,/const current=record\?\.key===key/);assert.match(editor,/if\(!alive.current\|\|!result\)return/)
 assert.match(details,/documents.deleteDocument\(id,record.revision\)/);assert.match(details,/ConfirmDialog title="Видалити запис/)
 assert.match(details,/STALE_REVISION/);assert.match(details,/юридичний акт/);assert.match(details,/Формування DOCX/)
 assert.match(leave,/<LeaveJournal active=\{active\}/);assert.match(leave,/active && creating &&/);assert.match(leave,/suspended: !active \|\| context !== null/)
 assert.match(leave,/key=\{selected \|\| 'new'\}/);assert.match(leave,/onResume=\{\(\) => setContext\(null\)\}/)
})
