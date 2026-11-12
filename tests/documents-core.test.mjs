import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { runInNewContext } from 'node:vm'
import { Storage, openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { DocumentsService } from '../dist-electron/electron/documents/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { personnelDocumentKinds, documentNumberKey } from '../dist-electron/shared/documents.js'
const error = code => value => value.code === code
const rootDir = () => mkdtempSync(join(tmpdir(),'hr-documents-'))
function clean(root) { assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep) && basename(root).startsWith('hr-documents-')); rmSync(root,{recursive:true,force:true,maxRetries:5}) }
const input = (changes={}) => ({kind:'head_order',customKind:null,number:'0015-к',issuedOn:'2026-11-12',title:'Про кадрові питання',note:null,employeeIds:[],requestId:randomUUID(),...changes})
const fields = ({id,revision,createdAt,updatedAt,...value}) => value
const integrity = db => { assert.deepEqual(db.pragma('foreign_key_check'),[]); assert.equal(db.pragma('integrity_check',{simple:true}),'ok') }
async function fixture(t) {
  const root=rootDir(),storage=new Storage();await storage.initializeSafely(()=>join(root,'data','test.db'))
  t.after(()=>{storage.close();clean(root)})
  const personnel=new PersonnelService(storage,()=>false),service=new DocumentsService(storage,()=>false)
  const departmentId=personnel.createDepartment({name:'Синтетичний відділ'}).id,positionId=personnel.createPosition({name:'Синтетична посада'}).id
  const base={lastName:'Приклад',firstName:'Умовний',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',positionStartedOn:null,positionCategory:null,departmentId,positionId}
  const a=personnel.createEmployee(base),b=personnel.createEmployee({...base,firstName:'Другий'})
  return {root,storage,personnel,service,a,b,get db(){return storage.getDatabase()}}
}

test('v18→v19 protects the original manifest, ledger and facts; STRICT/CHECK/FK/indexes apply',async t=>{
  assert.equal(createHash('sha256').update(JSON.stringify(migrations.slice(0,18))).digest('hex'),'e00577d4b3d0308e71acce44889c231261bc71385ef38ea5dced31ddfa8416be')
  assert.equal(migrations[18].requiresBackup,true)
  const root=rootDir(),file=join(root,'test.db');let connection=await openStorageSafely(file,migrations.slice(0,18))
  const old=connection.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();connection.close()
  connection=await openStorageSafely(file);t.after(()=>{connection.close();clean(root)})
  const db=connection.database
  assert.equal(connection.schemaVersion,21);assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=18 ORDER BY version').all(),old)
  assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='personnel_documents'").get().strict,1)
  assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='personnel_document_employees'").get().strict,1)
  const service=new DocumentsService({getDatabase:()=>db},()=>false),doc=service.createDocument(input())
  for (const assignment of ["kind='bad'","custom_kind='не застосовується'","issued_on='2026-02-30'","issued_on='0000-01-01'","number=''","title=''","note=''","revision=-1","request_fingerprint='invalid'"]) {
    assert.throws(()=>db.prepare('UPDATE personnel_documents SET '+assignment+' WHERE id=?').run(doc.id))
  }
  assert.throws(()=>db.prepare('INSERT INTO personnel_document_employees VALUES (?,?)').run(doc.id,randomUUID()))
  assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().some(row=>row.name==='personnel_documents_number'))
  integrity(db)
})

test('all kinds and optional semantics, textual suffixes, Unicode/year/kind uniqueness',async t=>{
  const f=await fixture(t),s=f.service
  for(const kind of personnelDocumentKinds){const v=s.createDocument(input({kind,customKind:kind==='other'?'Довідка':null}));assert.equal(v.kind,kind);assert.equal(v.revision,0)}
  assert.equal(documentNumberKey(' № 0015-К '),'0015-к')
  assert.equal(documentNumberKey(' 123/2026 '),'123/2026')
  assert.throws(()=>s.createDocument(input({number:'№ 0015-К'})),error('DOCUMENT_NUMBER_CONFLICT'))
  assert.throws(()=>s.createDocument(input({kind:'other',customKind:'Інша назва'})),error('DOCUMENT_NUMBER_CONFLICT'))
  const next=s.createDocument(input({issuedOn:'2027-01-01',note:'  ',number:'  0015-к  '}));assert.equal(next.note,null);assert.equal(next.number,'0015-к')
  assert.equal(s.createDocument(input({number:'15-к'})).number,'15-к')
  assert.equal(s.createDocument(input({number:'123/2026'})).number,'123/2026')
  const a=s.createDocument(input({number:'А  Б',title:'  Заголовок  '}));assert.equal(a.title,'Заголовок')
  assert.throws(()=>s.createDocument(input({number:'а\u00a0\u00a0б'})),error('DOCUMENT_NUMBER_CONFLICT'))
  s.createDocument(input({number:'и\u0306'}));assert.throws(()=>s.createDocument(input({number:'Й'})),error('DOCUMENT_NUMBER_CONFLICT'))
  assert.equal(s.listDocuments().length,10);assert.equal('note' in s.listDocuments()[0],false)
  integrity(f.db)
})

test('input validation rejects malformed kinds, dates, lengths, duplicate/missing employees and privileged fields',async t=>{
  const f=await fixture(t),s=f.service
  for(const change of [{kind:'bad'},{kind:'other'},{kind:'other',customKind:' '},{kind:'head_order',customKind:'Назва'},
    {issuedOn:'2026-02-29'},{issuedOn:'2026-04-31'},{issuedOn:'01.01.2026'},{issuedOn:'0000-01-01'},
    {number:''},{number:'№'},{number:'x'.repeat(81)},{title:' '},{title:'x'.repeat(501)},{note:'x'.repeat(2001)},
    {kind:'other',customKind:'x'.repeat(121)},{employeeIds:['bad']},{employeeIds:[f.a.id,f.a.id]},
    {revision:5},{createdAt:new Date().toISOString()},{updatedAt:new Date().toISOString()},{requestId:'bad'}]) {
    assert.throws(()=>s.createDocument(input(change)),error('INVALID_ARGUMENTS'),JSON.stringify(change))
  }
  assert.throws(()=>s.createDocument(input({employeeIds:[randomUUID()]})),error('DOCUMENT_EMPLOYEE_NOT_FOUND'))
  assert.equal(s.listDocuments().length,0)
  assert.equal(s.createDocument(input({issuedOn:'2024-02-29'})).issuedOn,'2024-02-29')
  assert.equal(s.createDocument(input({number:'limit',issuedOn:'9999-12-31'})).issuedOn,'9999-12-31')
})

test('CRUD controls revisions and references; idempotent retries preserve actual updates without extra writes',async t=>{
  const f=await fixture(t),s=f.service,v=input({employeeIds:[f.b.id,f.a.id]}),doc=s.createDocument(v)
  const total=()=>f.db.prepare('SELECT total_changes() AS n').get().n
  const before=total();assert.deepEqual(s.createDocument({...v,employeeIds:[f.a.id,f.b.id]}),doc);assert.equal(total(),before)
  assert.throws(()=>s.createDocument({...v,title:'Інший payload'}),error('DOCUMENT_REQUEST_CONFLICT'))
  const changed=s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,title:'Виправлено',employeeIds:[f.b.id]})
  assert.equal(changed.revision,1);assert.equal(changed.createdAt,doc.createdAt);assert.deepEqual(changed.employeeIds,[f.b.id])
  assert.deepEqual(s.createDocument(v),changed)
  for(const revision of [-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>s.deleteDocument(doc.id,revision),error('INVALID_ARGUMENTS'))
  assert.throws(()=>s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0}),error('STALE_REVISION'))
  assert.throws(()=>s.deleteDocument(doc.id,0),error('STALE_REVISION'))
  const another=s.createDocument(input({number:'22'}))
  assert.throws(()=>s.updateDocument({...fields(changed),id:changed.id,expectedRevision:1,number:another.number}),error('DOCUMENT_NUMBER_CONFLICT'))
  assert.deepEqual(s.getDocument(doc.id),changed)
  s.deleteDocument(doc.id,1);assert.throws(()=>s.getDocument(doc.id),error('NOT_FOUND'))
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM personnel_document_employees WHERE document_id=?').get(doc.id).n,0)
  integrity(f.db)
})

test('writes roll back the document and all links on failure, including after partial link replacement',async t=>{
  const f=await fixture(t),s=f.service,doc=s.createDocument(input({employeeIds:[f.a.id]}))
  f.db.exec(`CREATE TRIGGER test_fail_link BEFORE INSERT ON personnel_document_employees WHEN NEW.employee_id='${f.b.id}' BEGIN SELECT RAISE(ABORT,'synthetic'); END`)
  assert.throws(()=>s.createDocument(input({number:'fail',employeeIds:[f.a.id,f.b.id]})),error('CONFLICT'))
  assert.equal(s.listDocuments().length,1)
  assert.throws(()=>s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,title:'Не має зберегтись',employeeIds:[f.a.id,f.b.id]}),error('CONFLICT'))
  assert.deepEqual(s.getDocument(doc.id),doc)
  assert.throws(()=>s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,employeeIds:[randomUUID()]}),error('DOCUMENT_EMPLOYEE_NOT_FOUND'))
  assert.deepEqual(s.getDocument(doc.id),doc);integrity(f.db)
})

test('employee RESTRICT and controlled deletion are atomic; documents never mutate leave, rank, allowance or baseline facts',async t=>{
  const f=await fixture(t),s=f.service,leave=new LeaveService(f.storage,()=>false),ranks=new SeniorityRanksService(f.storage,()=>false)
  ranks.saveServiceBaseline(f.a.id,{years:4,months:0,days:0,asOfDate:'2020-01-01',basisNote:null,autoAccrueAfterBaseline:true})
  ranks.saveAllowance(f.a.id,{status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:null})
  ranks.saveRank(f.a.id,{rank:6,assignedOn:'2020-01-01',effectiveOn:null,origin:'unknown',reviewAnchorOn:null,originNote:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:null})
  leave.saveRights(f.a.id,[{leaveType:'annual_main',status:'has_right'}])
  leave.saveServiceLeaveStart(f.a.id,'2020-01-01')
  leave.savePeriods(f.a.id,[{leaveType:'annual_main',periodStart:'2020-01-01',periodEnd:'2020-12-31',accountingBasis:'initial_balance',confirmedDays:10,referenceEntitlementDays:null}])
  const period=leave.getBalances(f.a.id).find(value=>value.leaveType==='annual_main')
  leave.registerLeave({requestId:randomUUID(),employeeId:f.a.id,leaveType:'annual_main',startDate:'2027-01-04',endDate:'2027-01-05',usedDays:2,orderNumber:'99-ос',orderDate:'2026-12-31',durationExplanation:null,allocations:[{periodId:period.id,days:2}]})
  const tables=['employees','employee_current_ranks','employee_seniority_allowances','employee_service_baselines','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations']
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]))
  const before=snapshot(),doc=s.createDocument(input({employeeIds:[f.a.id]}))
  assert.throws(()=>f.personnel.deleteEmployee(f.a.id),error('EMPLOYEE_HAS_DOCUMENTS'))
  assert.throws(()=>f.db.prepare('DELETE FROM employees WHERE id=?').run(f.a.id))
  assert.throws(()=>f.db.prepare('INSERT INTO personnel_document_employees VALUES (?,?)').run(doc.id,f.a.id))
  assert.deepEqual(snapshot(),before);assert.deepEqual(s.getDocument(doc.id).employeeIds,[f.a.id])
  f.db.pragma('query_only=ON');s.listDocuments();s.getDocument(doc.id);f.db.pragma('query_only=OFF')
  s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,note:'Тест'});s.deleteDocument(doc.id,1)
  assert.deepEqual(snapshot(),before);f.personnel.deleteEmployee(f.a.id);assert.throws(()=>f.personnel.getEmployee(f.a.id),error('NOT_FOUND'));integrity(f.db)
})

test('same live service reads after reopen and actual backup/restore; BUSY/unavailable/errors are controlled',async t=>{
  const f=await fixture(t),s=f.service,original=input({employeeIds:[f.a.id]}),doc=s.createDocument(original)
  f.storage.close();await f.storage.reopen();assert.deepEqual(s.getDocument(doc.id),doc);assert.deepEqual(s.createDocument(original),doc)
  const backup=new BackupService(f.storage);t.after(()=>{backup.stop();backup.invalidateSelections()})
  const folders=[join(f.root,'one'),join(f.root,'two')];folders.forEach(path=>mkdirSync(path))
  const a=await backup.chooseFolder(1,async()=>folders[0]),b=await backup.chooseFolder(2,async()=>folders[1]);await backup.saveConfig([a.token,b.token]);await backup.runManual()
  const copy=join(folders[0],readdirSync(folders[0]).find(name=>name.includes('-manual-')&&name.endsWith('.db')))
  s.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,title:'Після копії'})
  const selected=await backup.chooseRestore(async()=>copy);assert.deepEqual(await backup.confirmRestore(selected.token,async()=>true),{restored:true})
  assert.deepEqual(s.getDocument(doc.id),doc);assert.deepEqual(s.createDocument(original),doc);assert.deepEqual(s.createDocument(input({requestId:randomUUID(),number:'new'})).revision,0)
  assert.throws(()=>new DocumentsService(f.storage,()=>true).listDocuments(),error('BUSY'))
  assert.throws(()=>new DocumentsService({getDatabase(){throw Error('secret path')}},()=>false).listDocuments(),error('STORAGE_UNAVAILABLE'))
  assert.throws(()=>new DocumentsService({getDatabase:()=>({transaction(){throw Error('private SQL')}})},()=>false).listDocuments(),error('INTERNAL_ERROR'))
  integrity(f.db)
})

test('preload and typed IPC validate input/output, sender/frame/URL and return only controlled errors',async t=>{
  const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url}}
  const event={sender:contents,senderFrame:contents.mainFrame}
  registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.personnel,new LeaveService(f.storage,()=>false),undefined,undefined,undefined,undefined,undefined,f.service)
  let api
  runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(key,value)=>{api=value.documents}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
  const v=input(),created=await api.createDocument(v);assert.equal(created.ok,true)
  const doc=created.data;assert.equal((await api.getDocument(doc.id)).data.id,doc.id);assert.equal((await api.listDocuments()).data.length,1)
  assert.equal((await api.createDocument(v)).data.id,doc.id)
  assert.deepEqual(await api.createDocument({...v,revision:10}),{ok:false,error:{code:'INVALID_ARGUMENTS'}})
  assert.deepEqual(await api.createDocument({...v,requestId:randomUUID()}),{ok:false,error:{code:'DOCUMENT_NUMBER_CONFLICT'}})
  for(const bad of [{...event,sender:{}},{...event,senderFrame:{}},{...event,senderFrame:{url:'https://evil.example'}}])assert.deepEqual(handlers.get(ipcChannels.documentsList)(bad),{ok:false,error:{code:'FORBIDDEN'}})
  assert.deepEqual(await api.getDocument('bad'),{ok:false,error:{code:'INVALID_ARGUMENTS'}})
  assert.equal((await api.updateDocument({...fields(doc),id:doc.id,expectedRevision:0,title:'Оновлено'})).data.revision,1)
  assert.deepEqual(await api.deleteDocument(doc.id,0),{ok:false,error:{code:'STALE_REVISION'}})
  assert.equal((await api.deleteDocument(doc.id,1)).ok,true)
  assert.deepEqual(await api.getDocument(doc.id),{ok:false,error:{code:'NOT_FOUND'}})
  f.service.getDocument=()=>{throw Error('private database error')};assert.deepEqual(await api.getDocument(randomUUID()),{ok:false,error:{code:'INTERNAL_ERROR'}})
  f.service.listDocuments=()=>[{private:'invalid response'}];assert.deepEqual(await api.listDocuments(),{ok:false,error:{code:'INTERNAL_ERROR'}})
})
