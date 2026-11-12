import { Worker } from 'node:worker_threads'
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
function clean(root){assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-numbering-'));rmSync(root,{recursive:true,force:true,maxRetries:5})}
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'hr-numbering-')),storage=new Storage();await storage.initializeSafely(()=>join(root,'data','test.db'))
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

import { formatDocumentNumber,parseDocumentOrdinal,validNumberPattern } from '../dist-electron/shared/document-numbering.js'

const seriesInput=(changes={})=>({kind:'head_order',code:'test',name:'Синтетична серія',pattern:'{N}-к',minDigits:3,startAt:1,...changes})
const autoInput=(seriesId,changes={})=>{const {number,...value}=docInput([],changes);return {...value,seriesId}}
const seriesFields=({id,revision,createdAt,updatedAt,active,used,...fields})=>fields

test('v20→v21 keeps manifest 1–20 and historical linked documents; STRICT, FK, indexes, no seeded series',async t=>{
 assert.equal(createHash('sha256').update(JSON.stringify(migrations.slice(0,20))).digest('hex'),'00881e96c15d1070688478a66f7a422ce8993406aab0cb6d0433b8742a80b9c3')
 assert.equal(migrations[20].requiresBackup,true)
 const root=mkdtempSync(join(tmpdir(),'hr-numbering-')),file=join(root,'old.db');let c=await openStorageSafely(file,migrations.slice(0,20))
 const old=c.database,storage={getDatabase:()=>old},p=new PersonnelService(storage,()=>false),l=new LeaveService(storage,()=>false)
 const person=p.createEmployee({departmentId:p.createDepartment({name:'Тест'}).id,positionId:p.createPosition({name:'Тест'}).id,lastName:'Приклад',firstName:'Умовний',middleName:null,birthDate:null,employeeType:'staff',hireDate:'2020-01-01',positionStartedOn:null,positionCategory:null})
 l.saveRights(person.id,[{leaveType:'annual_main',status:'has_right'}]);l.savePeriods(person.id,[{leaveType:'annual_main',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:30,referenceEntitlementDays:null}])
 const r=l.registerLeave({requestId:randomUUID(),employeeId:person.id,leaveType:'annual_main',startDate:'2027-01-01',endDate:'2027-01-01',usedDays:1,orderNumber:'0015-К',orderDate:'2026-11-12',durationExplanation:null,allocations:[{periodId:l.getBalances(person.id)[0].id,days:1}]})
 const input=docInput([person.id]),{requestId,...value}=input,id=randomUUID(),now=new Date().toISOString(),fp=createHash('sha256').update(JSON.stringify({...value,employeeIds:[...value.employeeIds].sort()})).digest('hex')
 old.prepare('INSERT INTO personnel_documents VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?)').run(id,value.kind,null,value.number,'0015-к',value.issuedOn,value.title,null,now,now,requestId,fp)
 old.prepare('INSERT INTO personnel_document_employees VALUES (?,?)').run(id,person.id)
 old.prepare('INSERT INTO personnel_document_leave_records VALUES (?,?,?)').run(id,r.id,now)
 const before=old.prepare('SELECT * FROM personnel_documents').get(),ledger=old.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),allocations=old.prepare('SELECT * FROM leave_allocations').all();c.close()
 c=await openStorageSafely(file);t.after(()=>{c.close();clean(root)})
 const db=c.database,s=new DocumentsService({getDatabase:()=>db},()=>false)
 assert.equal(c.schemaVersion,21);assert.deepEqual(db.prepare('SELECT * FROM personnel_documents').get(),{...before,series_id:null})
 assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=20 ORDER BY version').all(),ledger)
 assert.deepEqual(db.prepare('SELECT * FROM leave_allocations').all(),allocations)
 assert.equal(s.listLeaveLinks(id).links[0].leaveRecordId,r.id);assert.equal(s.createDocument(input).id,id)
 assert.equal(s.listSeries().length,0)
 for(const table of ['personnel_document_series','personnel_document_number_claims'])assert.equal(db.prepare('SELECT strict FROM pragma_table_list WHERE name=?').get(table).strict,1)
 integrity(db)
})

test('bounded format, Unicode literal matching, padding, year, invalid patterns and series lifecycle',async t=>{
 for(const pattern of ['{N}','{N}/{YYYY}','К-{N}/{YYYY}'])assert.equal(validNumberPattern(pattern),true)
 for(const pattern of ['1','{N}{N}','{N}/{YYYY}/{YYYY}','{X}-{N}','{N}\n','{n}','{N}'+'x'.repeat(60)])assert.equal(validNumberPattern(pattern),false)
 const f=await fixture(t),s=f.docs,series=s.createSeries(seriesInput())
 assert.equal(formatDocumentNumber(series,15,2027),'015-к');assert.equal(parseDocumentOrdinal(series,'15-К',2027),15)
 assert.equal(parseDocumentOrdinal({...series,pattern:'{N}/{YYYY}'},'15/2026',2027),null)
 assert.equal(formatDocumentNumber({...series,pattern:'К-{N}/{YYYY}'},15,2027),'К-015/2027')
 assert.throws(()=>s.createSeries(seriesInput({code:'TEST'})),error('SERIES_CODE_CONFLICT'))
 for(const assignment of ["min_digits=0","start_at=0","active=2","revision=-1","created_at='bad'","pattern='{N}{N}'"])assert.throws(()=>f.db.prepare('UPDATE personnel_document_series SET '+assignment+' WHERE id=?').run(series.id))

 for(const change of [{pattern:'{X}'},{minDigits:0},{minDigits:10},{startAt:0},{code:'bad code'},{name:' '}])assert.throws(()=>s.createSeries(seriesInput(change)),error('INVALID_ARGUMENTS'))
 let edited=s.updateSeries({...seriesFields(series),id:series.id,expectedRevision:0,pattern:'{N}/{YYYY}',code:'new'})
 assert.equal(edited.revision,1);const doc=s.createAutoNumberedDocument(autoInput(series.id));assert.equal(doc.number,'001/2026')
 const used=s.listSeries()[0];assert.equal(used.used,true)
 for(const change of [{pattern:'{N}'},{code:'changed'},{minDigits:2},{startAt:50},{kind:'employer_order'}])assert.throws(()=>s.updateSeries({...seriesFields(used),id:used.id,expectedRevision:used.revision,...change}),error('SERIES_USED'))
 edited=s.updateSeries({...seriesFields(used),id:used.id,expectedRevision:used.revision,name:'Нова назва'});assert.equal(edited.name,'Нова назва')
 assert.throws(()=>s.setSeriesActive(edited.id,0,false),error('STALE_REVISION'))
 const archived=s.setSeriesActive(edited.id,edited.revision,false);assert.equal(archived.active,false)
 assert.throws(()=>s.createAutoNumberedDocument(autoInput(edited.id)),error('SERIES_INACTIVE'))
 assert.throws(()=>s.createDocument(docInput([],{seriesId:edited.id,number:'7/2026'})),error('SERIES_INACTIVE'))
 assert.equal(s.setSeriesActive(archived.id,archived.revision,true).active,true);integrity(f.db)
})

test('independent series/year sequences; manual claims, normalized duplicate ordinals, idempotency and no reuse after delete',async t=>{
 const f=await fixture(t),s=f.docs,a=s.createSeries(seriesInput({startAt:15})),b=s.createSeries(seriesInput({code:'other'}))
 const input=autoInput(a.id),first=s.createAutoNumberedDocument(input);assert.equal(first.number,'015-к')
 const changes=f.db.prepare('SELECT total_changes() AS n').get().n
 assert.deepEqual(s.createAutoNumberedDocument(input),first);assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,changes)
 assert.throws(()=>s.createAutoNumberedDocument({...input,title:'Інший'}),error('DOCUMENT_REQUEST_CONFLICT'))
 assert.equal(s.createAutoNumberedDocument(autoInput(b.id)).number,'001-к')
 assert.equal(s.createAutoNumberedDocument(autoInput(a.id,{issuedOn:'2027-01-01'})).number,'015-к')
 const manual=s.createDocument(docInput([],{seriesId:a.id,number:'50-К'}));assert.equal(manual.number,'50-К')
 assert.throws(()=>s.createDocument(docInput([],{seriesId:a.id,number:'050-к'})),error('SERIES_NUMBER_TAKEN'))
 assert.throws(()=>s.createDocument(docInput([],{seriesId:a.id,number:'50-К'})),error('DOCUMENT_NUMBER_CONFLICT'))
 assert.throws(()=>s.createDocument(docInput([],{seriesId:a.id,number:'51-ос'})),error('SERIES_PATTERN_MISMATCH'))
 assert.throws(()=>s.createAutoNumberedDocument(autoInput(a.id,{kind:'council_decision'})),error('SERIES_KIND_MISMATCH'))
 assert.throws(()=>s.createAutoNumberedDocument(autoInput(randomUUID())),error('SERIES_NOT_FOUND'))
 assert.equal(s.createDocument(docInput([],{number:'015-к'})).seriesId,null)
 s.deleteDocument(manual.id,manual.revision)
 assert.equal(f.db.prepare('SELECT document_id FROM personnel_document_number_claims WHERE series_id=? AND ordinal=50').get(a.id).document_id,null)
 assert.throws(()=>s.createDocument(docInput([],{seriesId:a.id,number:'050-К'})),error('SERIES_NUMBER_TAKEN'))
 assert.equal(s.createAutoNumberedDocument(autoInput(a.id)).number,'051-к')
 const now=new Date().toISOString()
 for(const [seriesId,year,ordinal,key,doc] of [[a.id,2026,50,'different',null],[a.id,2026,99,'50-к',null],[randomUUID(),2026,1,'1',null],[a.id,0,1,'1',null],[a.id,2026,0,'0',null],[a.id,2026,99,'99',randomUUID()]])assert.throws(()=>f.db.prepare('INSERT INTO personnel_document_number_claims VALUES (?,?,?,?,?,?)').run(seriesId,year,ordinal,key,doc,now))
 assert.throws(()=>f.db.prepare('DELETE FROM personnel_document_series WHERE id=?').run(a.id))
 const last=s.createSeries(seriesInput({code:'last',startAt:999999999}));s.createAutoNumberedDocument(autoInput(last.id))
 assert.throws(()=>s.createAutoNumberedDocument(autoInput(last.id)),error('SERIES_EXHAUSTED'));integrity(f.db)
})

test('explicit reassignment retains old claims; linked documents block series changes; leave accounting is untouched',async t=>{
 const f=await fixture(t),s=f.docs,series=s.createSeries(seriesInput()),d=s.createDocument(docInput([],{number:'old'}))
 const updated=s.updateDocument({...docFields(d),id:d.id,expectedRevision:0,seriesId:series.id,number:'020-к'})
 const renamed=s.updateDocument({...docFields(updated),id:d.id,expectedRevision:1,number:'025-к'})
 assert.equal(renamed.number,'025-к');assert.equal(f.db.prepare('SELECT document_id FROM personnel_document_number_claims WHERE series_id=? AND ordinal=20').get(series.id).document_id,null)
 assert.throws(()=>s.updateDocument({...docFields(renamed),id:d.id,expectedRevision:2,number:'020-к'}),error('SERIES_NUMBER_TAKEN'))
 assert.deepEqual(s.getDocument(d.id),renamed)
 const r=f.record(),doc=s.createDocument(docInput([f.a.id])),linked=s.linkLeaveRecord(pair(doc,r)).document
 const snapshot=()=>Object.fromEntries(['leave_records','leave_allocations','leave_period_balances','employee_leave_rights','employee_service_baselines','employee_current_ranks','employee_seniority_allowances'].map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot();assert.throws(()=>s.updateDocument({...docFields(linked),id:doc.id,expectedRevision:linked.revision,seriesId:series.id}),error('DOCUMENT_HAS_LEAVE_LINKS'))
 const auto=s.createAutoNumberedDocument(autoInput(series.id,{employeeIds:[f.a.id]}))
 assert.throws(()=>s.linkLeaveRecord(pair(auto,r)),error('DOCUMENT_LEAVE_CONFLICT'))
 const unrelated=f.record();assert.throws(()=>s.linkLeaveRecord(pair(auto,unrelated)),error('DOCUMENT_REQUISITES_MISMATCH'))
 // Only the explicit fixture registration changed accounting, never the numbering operation.
 const afterRegistration=snapshot();s.deleteDocument(auto.id,0);assert.deepEqual(snapshot(),afterRegistration)
 assert.deepEqual(f.leave.getRecord(r.id),r);assert.equal(before.leave_allocations.length,1);integrity(f.db)
})

test('failure rolls back claims and document; two connections serialize automatic assignments without gaps from failed writes',async t=>{
 const f=await fixture(t),s=f.docs,series=s.createSeries(seriesInput()),input=autoInput(series.id)
 f.db.exec("CREATE TRIGGER fail_number_claim AFTER INSERT ON personnel_document_number_claims BEGIN SELECT RAISE(ABORT,'synthetic'); END")
 assert.throws(()=>s.createAutoNumberedDocument(input),error('CONFLICT'));assert.equal(s.listDocuments().length,0);assert.equal(s.listSeries()[0].used,false)
 f.db.exec('DROP TRIGGER fail_number_claim');assert.equal(s.createAutoNumberedDocument(input).number,'001-к')
 f.db.exec("CREATE TRIGGER fail_number_claim AFTER INSERT ON personnel_document_number_claims BEGIN SELECT RAISE(ABORT,'synthetic'); END")
 const doc=s.listDocuments()[0];assert.throws(()=>s.updateDocument({...docFields(s.getDocument(doc.id)),id:doc.id,expectedRevision:0,number:'005-к'}),error('CONFLICT'));assert.equal(s.getDocument(doc.id).number,'001-к')
 f.db.exec('DROP TRIGGER fail_number_claim')
 const parallel=()=>new Promise((resolve,reject)=>{const worker=new Worker(new URL('./helpers/document-numbering-worker.mjs',import.meta.url),{workerData:{file:join(f.root,'data','test.db'),seriesId:series.id}});worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('Worker failed: '+code))})})
 const results=(await Promise.all([parallel(),parallel()])).flat()
 assert.equal(new Set(results).size,12);assert.ok(results.includes('002-к'));assert.ok(results.includes('013-к'));integrity(f.db)
})

test('series, claims and links survive real backup/restore and restart; new preload operations enforce secure IPC',async t=>{
 const f=await fixture(t),s=f.docs,series=s.createSeries(seriesInput({startAt:15,minDigits:4})),input=autoInput(series.id,{employeeIds:[f.a.id]}),d=s.createAutoNumberedDocument(input),r=f.record()
 const linked=s.linkLeaveRecord(pair(d,r));f.storage.close();await f.storage.reopen();assert.deepEqual(s.createAutoNumberedDocument(input),linked.document)
 const backup=new BackupService(f.storage);t.after(()=>{backup.stop();backup.invalidateSelections()})
 const folders=[join(f.root,'one'),join(f.root,'two')];folders.forEach(path=>mkdirSync(path))
 const a=await backup.chooseFolder(1,async()=>folders[0]),b=await backup.chooseFolder(2,async()=>folders[1]);await backup.saveConfig([a.token,b.token]);await backup.runManual()
 const copy=join(folders[0],readdirSync(folders[0]).find(name=>name.includes('-manual-')&&name.endsWith('.db')))
 s.createAutoNumberedDocument(autoInput(series.id));const selected=await backup.chooseRestore(async()=>copy);await backup.confirmRestore(selected.token,async()=>true)
 assert.deepEqual(s.listLeaveLinks(d.id),linked);assert.equal(s.createAutoNumberedDocument(autoInput(series.id)).number,'0016-к')
 const handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}},event={sender:contents,senderFrame:contents.mainFrame}
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.personnel,f.leave,undefined,undefined,undefined,f.ranks,undefined,s)
 let api;runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.documents}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 const created=await api.createSeries(seriesInput({code:'ipc'}));assert.equal(created.ok,true)
 const renamed=await api.updateSeries({...seriesFields(created.data),id:created.data.id,expectedRevision:0,name:'IPC'});assert.equal(renamed.ok,true)
 assert.equal((await api.setSeriesActive(renamed.data.id,1,false)).data.active,false)
 assert.equal((await api.listSeries()).data.length,2)
 assert.equal((await api.createAutoNumberedDocument(autoInput(series.id))).data.number,'0017-к')
 assert.equal((await api.createAutoNumberedDocument({...autoInput(series.id),number:'injected'})).error.code,'INVALID_ARGUMENTS')
 for(const channel of [ipcChannels.documentsSeriesList,ipcChannels.documentsSeriesCreate,ipcChannels.documentsSeriesUpdate,ipcChannels.documentsSeriesActive,ipcChannels.documentsAutoCreate])for(const bad of [{...event,sender:{}},{...event,senderFrame:{}},{...event,senderFrame:{url:'https://evil.example'}}])assert.equal(handlers.get(channel)(bad).error.code,'FORBIDDEN')
 integrity(f.db)
})
