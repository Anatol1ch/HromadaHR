import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash,randomUUID } from 'node:crypto'
import { mkdtempSync,rmSync,mkdirSync,readdirSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve,sep,basename } from 'node:path'
import { runInNewContext } from 'node:vm'
import { Storage,openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { DocumentsService } from '../dist-electron/electron/documents/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
const error=code=>value=>value.code===code
const docInput=(employeeIds,change={})=>({requestId:randomUUID(),kind:'head_order',customKind:null,number:'0015-К',issuedOn:'2026-11-12',title:'Про відпустку',note:null,employeeIds,...change})
const docFields=({id,revision,createdAt,updatedAt,...fields})=>fields
const pair=(d,r)=>({documentId:d.id,leaveRecordId:r.id,expectedDocumentRevision:d.revision,expectedLeaveRevision:r.revision})
const update=r=>({id:r.id,expectedRevision:r.revision,leaveType:r.leaveType,startDate:r.startDate,endDate:r.endDate,usedDays:r.usedDays,orderNumber:r.orderNumber,orderDate:r.orderDate,durationExplanation:r.durationExplanation,grantBasis:r.grantBasis,allocations:r.allocations})
const integrity=db=>{assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}
function clean(root){assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-doc-links-'));rmSync(root,{recursive:true,force:true,maxRetries:5})}
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'hr-doc-links-')),storage=new Storage();await storage.initializeSafely(()=>join(root,'data','test.db'))
 t.after(()=>{storage.close();clean(root)})
 const personnel=new PersonnelService(storage,()=>false),docs=new DocumentsService(storage,()=>false),leave=new LeaveService(storage,()=>false),ranks=new SeniorityRanksService(storage,()=>false)
 const departmentId=personnel.createDepartment({name:'Умовний відділ'}).id,positionId=personnel.createPosition({name:'Умовна посада'}).id
 const values={departmentId,positionId,lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',positionStartedOn:null,positionCategory:null}
 const a=personnel.createEmployee(values),b=personnel.createEmployee({...values,firstName:'Другий'})
 for(const person of [a,b]){leave.saveRights(person.id,[{leaveType:'annual_main',status:'has_right'}]);leave.savePeriods(person.id,[{leaveType:'annual_main',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:30,referenceEntitlementDays:null}])}
 let day=0
 const record=(employeeId=a.id,change={})=>{
   const date='2027-01-'+String(++day).padStart(2,'0'),period=leave.getBalances(employeeId).find(p=>p.leaveType==='annual_main')
   return leave.registerLeave({requestId:randomUUID(),employeeId,leaveType:'annual_main',startDate:date,endDate:date,usedDays:1,orderNumber:'№ 0015-к',orderDate:'2026-11-12',durationExplanation:null,allocations:[{periodId:period.id,days:1}],...change})
 }
 return {root,storage,personnel,docs,leave,ranks,a,b,record,get db(){return storage.getDatabase()}}
}

test('v19→v20 keeps checksums 1–19, creates strict restrictive indexed links and never backfills matches',async t=>{
 assert.equal(createHash('sha256').update(JSON.stringify(migrations.slice(0,19))).digest('hex'),'26e64ee02c09c199c47b90ba812fb7ba1cefe1e12bdab88e59771cade9fb4f71')
 const root=mkdtempSync(join(tmpdir(),'hr-doc-links-')),file=join(root,'test.db');let c=await openStorageSafely(file,migrations.slice(0,19))
 const ledger=c.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();c.close();c=await openStorageSafely(file);t.after(()=>{c.close();clean(root)})
 assert.equal(c.schemaVersion,21);assert.equal(migrations[19].requiresBackup,true)
 assert.deepEqual(c.database.prepare('SELECT * FROM schema_migrations WHERE version<=19 ORDER BY version').all(),ledger)
 assert.equal(c.database.prepare("SELECT strict FROM pragma_table_list WHERE name='personnel_document_leave_records'").get().strict,1)
 assert.equal(c.database.prepare('SELECT count(*) AS n FROM personnel_document_leave_records').get().n,0)
 assert.ok(c.database.pragma('foreign_key_list(personnel_document_leave_records)').every(row=>row.on_delete==='RESTRICT'))
 assert.throws(()=>c.database.prepare('INSERT INTO personnel_document_leave_records VALUES (?,?,?)').run(randomUUID(),randomUUID(),new Date().toISOString()))
 integrity(c.database)
})

test('one document links several leaves of its worker; normalized requisites and factual no-op retries preserve all accounting facts',async t=>{
 const f=await fixture(t),d=f.docs.createDocument(docInput([f.a.id])),r=f.record(),r2=f.record()
 f.ranks.saveServiceBaseline(f.a.id,{years:4,months:0,days:0,asOfDate:'2020-01-01',autoAccrueAfterBaseline:true,basisNote:null})
 f.ranks.saveRank(f.a.id,{rank:6,assignedOn:'2020-01-01',effectiveOn:null,origin:'unknown',originNote:null,reviewAnchorOn:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:null})
 f.ranks.saveAllowance(f.a.id,{status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:null})
 const tables=['employees','leave_records','leave_allocations','leave_period_balances','employee_leave_rights','employee_service_leave_start','employee_service_baselines','employee_seniority_allowances','employee_current_ranks']
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]))
 const before=snapshot();assert.equal(f.docs.getLeaveDocument(r.id),null)
 const linked=f.docs.linkLeaveRecord(pair(d,r));assert.equal(linked.document.revision,1);assert.equal(linked.links.length,1)
 assert.equal(f.docs.getLeaveDocument(r.id).document.id,d.id);assert.equal(linked.links[0].orderNumber,'№ 0015-к')
 const changes=f.db.prepare('SELECT total_changes() AS n').get().n
 assert.deepEqual(f.docs.linkLeaveRecord(pair(d,r)),linked);assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,changes)
 const second=f.docs.linkLeaveRecord(pair(linked.document,r2));assert.equal(second.links.length,2);assert.equal(second.document.revision,2)
 assert.deepEqual(snapshot(),before)
 f.db.pragma('query_only=ON');assert.equal(f.docs.listLeaveLinks(d.id).links.length,2);assert.equal(f.docs.getLeaveDocument(r.id).document.revision,2);f.db.pragma('query_only=OFF')
 const unlinked=f.docs.unlinkLeaveRecord(pair(second.document,r));assert.equal(unlinked.document.revision,3);assert.equal(unlinked.links.length,1)
 const count=f.db.prepare('SELECT total_changes() AS n').get().n
 assert.deepEqual(f.docs.unlinkLeaveRecord(pair(second.document,r)),unlinked);assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,count)
 assert.deepEqual(snapshot(),before);assert.equal(f.docs.getLeaveDocument(r.id),null);integrity(f.db)
})

test('missing entities, ownership, missing/mismatched requisites, stale revisions and other document conflicts are controlled',async t=>{
 const f=await fixture(t),d=f.docs.createDocument(docInput([f.a.id])),r=f.record()
 for(const input of [{...pair(d,r),documentId:randomUUID()},{...pair(d,r),leaveRecordId:randomUUID()}])assert.throws(()=>f.docs.linkLeaveRecord(input),error('NOT_FOUND'))
 for(const ids of [[],[f.a.id,f.b.id]]){const other=f.docs.createDocument(docInput(ids,{number:randomUUID()}));assert.throws(()=>f.docs.linkLeaveRecord(pair(other,r)),error('DOCUMENT_EMPLOYEE_REQUIRED'))}
 const wrong=f.docs.createDocument(docInput([f.b.id],{kind:'employer_order'}));assert.throws(()=>f.docs.linkLeaveRecord(pair(wrong,r)),error('DOCUMENT_EMPLOYEE_MISMATCH'))
 for(const change of [{orderNumber:null},{orderDate:null},{orderNumber:'№'}])assert.throws(()=>f.docs.linkLeaveRecord(pair(d,f.record(f.a.id,change))),error('DOCUMENT_REQUISITES_MISSING'))
 for(const change of [{orderNumber:'15-к'},{orderDate:'2026-11-11'}])assert.throws(()=>f.docs.linkLeaveRecord(pair(d,f.record(f.a.id,change))),error('DOCUMENT_REQUISITES_MISMATCH'))
 for(const change of [{expectedDocumentRevision:10},{expectedLeaveRevision:10}])assert.throws(()=>f.docs.linkLeaveRecord({...pair(d,r),...change}),error('STALE_REVISION'))
 const linked=f.docs.linkLeaveRecord(pair(d,r)),other=f.docs.createDocument(docInput([f.a.id],{kind:'executive_decision'}))
 assert.throws(()=>f.docs.linkLeaveRecord(pair(other,r)),error('DOCUMENT_LEAVE_CONFLICT'));assert.throws(()=>f.docs.unlinkLeaveRecord(pair(other,r)),error('DOCUMENT_LEAVE_CONFLICT'))
 assert.throws(()=>f.docs.unlinkLeaveRecord(pair(d,r)),error('STALE_REVISION'))
 assert.throws(()=>f.db.prepare('INSERT INTO personnel_document_leave_records VALUES (?,?,?)').run(other.id,r.id,new Date().toISOString()))
 assert.equal(f.docs.listLeaveLinks(d.id).document.revision,linked.document.revision);integrity(f.db)
})

test('linked identity and physical deletion are protected, title/note and other leave edits remain available; cancellation preserves the link',async t=>{
 const f=await fixture(t),d=f.docs.createDocument(docInput([f.a.id],{kind:'other',customKind:'Кадровий акт'})),r=f.record(),linked=f.docs.linkLeaveRecord(pair(d,r)).document
 for(const change of [{number:'another'},{issuedOn:'2026-11-11'},{kind:'head_order',customKind:null},{customKind:'Інший акт'},{employeeIds:[]},{employeeIds:[f.b.id]}])assert.throws(()=>f.docs.updateDocument({...docFields(linked),id:d.id,expectedRevision:linked.revision,...change}),error('DOCUMENT_HAS_LEAVE_LINKS'))
 assert.throws(()=>f.docs.updateDocument({...docFields(d),id:d.id,expectedRevision:d.revision}),error('STALE_REVISION'))
 const title=f.docs.updateDocument({...docFields(linked),id:d.id,expectedRevision:linked.revision,title:'Виправлений заголовок',note:'Примітка'});assert.equal(title.revision,2)
 assert.throws(()=>f.docs.deleteDocument(d.id,title.revision),error('DOCUMENT_HAS_LEAVE_LINKS'))
 assert.throws(()=>f.db.prepare('DELETE FROM personnel_documents WHERE id=?').run(d.id));assert.throws(()=>f.db.prepare('DELETE FROM leave_records WHERE id=?').run(r.id))
 assert.deepEqual(f.leave.getRecord(r.id),r);assert.deepEqual(f.docs.getDocument(d.id),title)
 for(const change of [{orderNumber:'0015-к'},{orderDate:'2026-11-11'}])assert.throws(()=>f.leave.updateLeave({...update(r),...change}),error('LEAVE_DOCUMENT_REQUISITES_LOCKED'))
 const edited=f.leave.updateLeave({...update(r),durationExplanation:'Уточнення'});assert.equal(edited.revision,r.revision+1)
 const cancelled=f.leave.cancelLeave(r.id,edited.revision,'Помилковий запис');assert.equal(f.docs.listLeaveLinks(d.id).links[0].status,'cancelled');assert.equal(f.docs.getLeaveDocument(r.id).document.id,d.id)
 const r2=f.record(),c2=f.leave.cancelLeave(r2.id,r2.revision,'Тест');assert.throws(()=>f.docs.linkLeaveRecord(pair(title,c2)),error('LEAVE_CANCELLED'))
 const unlinked=f.docs.unlinkLeaveRecord(pair(title,cancelled));assert.deepEqual(f.leave.getRecord(r.id),cancelled)
 f.docs.deleteDocument(d.id,unlinked.document.revision);integrity(f.db)
})

test('link/unlink and document revision bump roll back together on SQL failure',async t=>{
 const f=await fixture(t),d=f.docs.createDocument(docInput([f.a.id])),r=f.record()
 f.db.exec("CREATE TRIGGER fail_revision BEFORE UPDATE ON personnel_documents BEGIN SELECT RAISE(ABORT,'test failure'); END")
 assert.throws(()=>f.docs.linkLeaveRecord(pair(d,r)),error('CONFLICT'));assert.equal(f.docs.getLeaveDocument(r.id),null);assert.equal(f.docs.getDocument(d.id).revision,0)
 f.db.exec('DROP TRIGGER fail_revision');const linked=f.docs.linkLeaveRecord(pair(d,r))
 f.db.exec("CREATE TRIGGER fail_revision BEFORE UPDATE ON personnel_documents BEGIN SELECT RAISE(ABORT,'test failure'); END")
 assert.throws(()=>f.docs.unlinkLeaveRecord(pair(linked.document,r)),error('CONFLICT'));assert.deepEqual(f.docs.listLeaveLinks(d.id),linked);integrity(f.db)
})

test('links survive reopen and actual backup/restore with live services; controlled errors and IPC guards remain narrow',async t=>{
 const f=await fixture(t),d=f.docs.createDocument(docInput([f.a.id])),r=f.record(),linked=f.docs.linkLeaveRecord(pair(d,r))
 f.storage.close();await f.storage.reopen();assert.deepEqual(f.docs.listLeaveLinks(d.id),linked)
 const backup=new BackupService(f.storage);t.after(()=>{backup.stop();backup.invalidateSelections()})
 const folders=[join(f.root,'one'),join(f.root,'two')];folders.forEach(path=>mkdirSync(path))
 const a=await backup.chooseFolder(1,async()=>folders[0]),b=await backup.chooseFolder(2,async()=>folders[1]);await backup.saveConfig([a.token,b.token]);await backup.runManual()
 const copy=join(folders[0],readdirSync(folders[0]).find(name=>name.includes('-manual-')&&name.endsWith('.db')))
 f.docs.unlinkLeaveRecord(pair(linked.document,r));const selected=await backup.chooseRestore(async()=>copy);await backup.confirmRestore(selected.token,async()=>true)
 assert.deepEqual(f.docs.listLeaveLinks(d.id),linked);assert.equal(f.docs.getLeaveDocument(r.id).document.id,d.id)
 const handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:contents.mainFrame}
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.personnel,f.leave,undefined,undefined,undefined,f.ranks,undefined,f.docs)
 let api;runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.documents}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 assert.equal((await api.listLeaveLinks(d.id)).data.links.length,1);assert.equal((await api.getLeaveDocument(r.id)).data.document.id,d.id)
 assert.equal((await api.unlinkLeaveRecord(pair(linked.document,r))).data.links.length,0)
 assert.equal((await api.linkLeaveRecord(pair(f.docs.getDocument(d.id),r))).data.links.length,1)
 assert.equal((await api.linkLeaveRecord({...pair(d,r),expectedLeaveRevision:-1})).error.code,'INVALID_ARGUMENTS')
 for(const channel of [ipcChannels.documentsLeaveLinks,ipcChannels.documentsLeaveDocument,ipcChannels.documentsLinkLeave,ipcChannels.documentsUnlinkLeave]){
   for(const bad of [{...event,sender:{}},{...event,senderFrame:{}},{...event,senderFrame:{url:'https://evil.example'}}])assert.equal(handlers.get(channel)(bad).error.code,'FORBIDDEN')
 }
 assert.throws(()=>new DocumentsService(f.storage,()=>true).listLeaveLinks(d.id),error('BUSY'));assert.throws(()=>new DocumentsService({getDatabase(){throw Error('private')}},()=>false).getLeaveDocument(r.id),error('STORAGE_UNAVAILABLE'));integrity(f.db)
})
