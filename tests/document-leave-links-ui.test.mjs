import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leaveLinkReason,verifyLeaveLink } from '../src/components/documents/leave-links-model.ts'
import { requestDocumentNavigation } from '../src/components/documents/navigation.ts'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { confirmModalClose,getCloseConfirmation,finishCloseConfirmation } from '../src/components/closeConfirmation.ts'
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8')
const document={id:'doc',employeeIds:['worker'],number:'0015-К',issuedOn:'2026-11-12'}
const record={id:'leave',employeeId:'worker',status:'active',orderNumber:'№ 0015-к',orderDate:'2026-11-12'}
const input={documentId:'doc',leaveRecordId:'leave',expectedDocumentRevision:0,expectedLeaveRevision:0}

test('candidate availability uses the same worker, normalized requisites, active state and explicit link ownership',()=>{
 assert.equal(leaveLinkReason(document,record,null),null)
 assert.equal(leaveLinkReason({...document,employeeIds:[]},record,null),'DOCUMENT_EMPLOYEE_REQUIRED')
 assert.equal(leaveLinkReason({...document,employeeIds:['worker','second']},record,null),'DOCUMENT_EMPLOYEE_REQUIRED')
 assert.equal(leaveLinkReason(document,{...record,employeeId:'other'},null),'DOCUMENT_EMPLOYEE_MISMATCH')
 assert.equal(leaveLinkReason(document,{...record,orderNumber:null},null),'DOCUMENT_REQUISITES_MISSING')
 assert.equal(leaveLinkReason(document,{...record,orderDate:null},null),'DOCUMENT_REQUISITES_MISSING')
 assert.equal(leaveLinkReason(document,{...record,orderNumber:'15-к'},null),'DOCUMENT_REQUISITES_MISMATCH')
 assert.equal(leaveLinkReason(document,{...record,orderDate:'2026-11-11'},null),'DOCUMENT_REQUISITES_MISMATCH')
 assert.equal(leaveLinkReason(document,{...record,status:'cancelled'},null),'LEAVE_CANCELLED')
 assert.equal(leaveLinkReason(document,record,'other'),'DOCUMENT_LEAVE_CONFLICT')
 assert.equal(leaveLinkReason(document,{...record,status:'cancelled'},'doc'),'ALREADY_LINKED')
})

test('uncertain link/unlink verification only reads actual state and never repeats a mutation',async()=>{
 let current=null,reads=0,writes=0
 const api={getLeaveDocument:async()=>{reads++;return {ok:true,data:current}},listLeaveLinks:async()=>({ok:true,data:{document,links:current?[record]:[]}}),
   linkLeaveRecord:()=>{writes++;throw Error('must not write')},unlinkLeaveRecord:()=>{writes++;throw Error('must not write')}}
 assert.equal((await verifyLeaveLink(api,input,false)).data.applied,false)
 assert.equal((await verifyLeaveLink(api,input,true)).data.applied,true)
 current={document,leaveRecordId:'leave',linkedAt:'2026-11-12T00:00:00.000Z'}
 assert.equal((await verifyLeaveLink(api,input,false)).data.applied,true)
 assert.equal((await verifyLeaveLink(api,input,true)).data.applied,false)
 current={...current,document:{...document,id:'other'}}
 assert.equal((await verifyLeaveLink(api,input,false)).error.code,'DOCUMENT_LEAVE_CONFLICT')
 api.getLeaveDocument=async()=>{throw Error('transport')};assert.equal((await verifyLeaveLink(api,input,true)).error.code,'UNAVAILABLE')
 assert.equal(reads,5);assert.equal(writes,0)
})

test('document deep-link closes the current preview only after the shared guard accepts, with no second navigation confirmation',()=>{
 const guards=createCloseGuards(),owner={isConnected:true};let intent,closed=0,busy=false
 guards.register({dirty:()=>true,busy:()=>busy,confirm:(dirty,next)=>confirmModalClose(dirty,next,owner)})
 const open=()=>requestDocumentNavigation('doc',4,next=>guards.requestAll(next),value=>{intent=value},()=>{closed++})
 open();const request=getCloseConfirmation();open();assert.equal(getCloseConfirmation(),request)
 finishCloseConfirmation(request,false);assert.equal(intent,undefined);assert.equal(closed,0)
 busy=true;open();assert.equal(getCloseConfirmation(),null);assert.equal(closed,0)
 busy=false;open();finishCloseConfirmation(getCloseConfirmation(),true)
 assert.deepEqual(intent,{documentId:'doc',requestId:4});assert.equal(closed,1);assert.equal(getCloseConfirmation(),null)
})

test('document, leave preview and employee profile reuse existing editors with scoped reads and typed guarded navigation',()=>{
 const details=read('components/documents/PersonnelDocumentDetails.tsx'),links=read('components/documents/DocumentLeaveLinksPanel.tsx'),dialog=read('components/documents/DocumentLeaveLinkDialog.tsx')
 const action=read('components/leave/LeaveRecordAction.tsx'),form=read('components/leave/LeaveRegistrationForm.tsx'),editor=read('components/documents/PersonnelDocumentEditor.tsx')
 assert.match(details,/<DocumentLeaveLinksPanel/);assert.match(links,/title="Пов’язані відпустки"/)
 assert.match(links,/ConfirmDialog title="Розірвати зв’язок/);assert.match(links,/Реєстрацію відпустки скасовано/)
 assert.match(links,/if\(pending.current\|\|!unlink/);assert.match(links,/verifyLeaveLink/)
 assert.match(dialog,/leave.listRecords\(snapshot.data.document.employeeIds\[0\]\)/);assert.doesNotMatch(dialog,/LeaveJournal|listRecords\(null\)/)
 assert.match(dialog,/expectedDocumentRevision:document.revision/);assert.match(dialog,/expectedLeaveRevision:row.record.revision/)
 assert.match(action,/documents.getLeaveDocument\(record.data.id\)/);assert.match(action,/<LeaveDocumentInfo/)
 assert.match(form,/documentLinked/);assert.match(form,/disabled=\{busy \|\| !!uncertain \|\| documentLinked\}/)
 assert.match(editor,/documents.listLeaveLinks\(props.id\)/);assert.match(editor,/identityLocked&&key!=='title'/)
 const employee=read('components/documents/EmployeeDocuments.tsx')
 assert.match(employee,/documents.listDocuments\(\)/);assert.match(employee,/row.employeeIds.includes\(employeeId\)/)
 assert.doesNotMatch(employee,/createDocument|updateDocument|deleteDocument/)
 assert.match(read('components/employees/EmployeeProfilePage.tsx'),/<EmployeeDocuments employeeId=\{id\}/)
 assert.match(read('App.tsx'),/requestDocumentNavigation\(id,[\s\S]*navigationGuard.current/)
 assert.match(read('components/documents/LeaveDocumentInfo.tsx'),/open\(link.document.id,onClose\)/)
 assert.match(read('components/documents/PersonnelDocumentsPanel.tsx'),/setSelected\(initialIntent.documentId\)/)
})
