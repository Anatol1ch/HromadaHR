import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { runInNewContext } from 'node:vm'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
const basis = { documentType: null, documentNumber: null, documentDate: null, reviewOn: null }
const allowance = { ...basis, status: 'confirmed', percentage: 0, effectiveOn: '2020-01-01' }
const rank = { ...basis, rank: 15, assignedOn: '2020-01-01', effectiveOn: null }
const code = expected => error => error.code === expected
function integrity(db) {
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  assert.deepEqual(db.pragma('foreign_key_check'), [])
}
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hr-seniority-'))
  const file = join(root, 'test.db')
  let connection = await openStorageSafely(file, migrations.slice(0,12))
  const ledger = connection.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
  connection.close()
  connection = await openStorageSafely(file)
  assert.equal(connection.schemaVersion,15)
  assert.deepEqual(connection.database.prepare('SELECT * FROM schema_migrations WHERE version<=12 ORDER BY version').all(),ledger)
  const storage = { getDatabase: () => connection.database }
  const personnel = new PersonnelService(storage, () => false)
  const service = new SeniorityRanksService(storage, () => false)
  const departmentId = personnel.createDepartment({ name: 'Тест' }).id
  const positionId = personnel.createPosition({ name: 'Тест' }).id
  const details = { firstName: 'Тест', lastName: 'Синтетичний', middleName: null, birthDate: null, hireDate: '2026-01-01', employeeType: 'official', departmentId, positionId }
  const employee = personnel.createEmployee(details)
  const other = personnel.createEmployee(details)
  t.after(() => {
    connection.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep) && basename(root).startsWith('hr-seniority-'))
    rmSync(root,{recursive:true,force:true,maxRetries:5})
  })
  return { service, personnel, employee, other, details, storage, get db() { return connection.database }, async reopen() { connection.close(); connection = await openStorageSafely(file) } }
}
test('v12→v13, current indicators, integrity, atomic failure, cascade and live connection', async t => {
  const f = await fixture(t), { service:s, personnel:p, employee:e, other, details } = f
  assert.equal(s.getAllowance(e.id),null)
  assert.equal(s.getRank(e.id),null)
  assert.equal(s.saveAllowance(e.id,allowance).percentage,0)
  const first = s.getAllowance(e.id)
  assert.ok(first.confirmedAt)
  await new Promise(resolve => setTimeout(resolve,5))
  assert.notEqual(s.saveAllowance(e.id,allowance).confirmedAt,first.confirmedAt)
  assert.equal(s.saveAllowance(e.id,{...allowance,percentage:40,reviewOn:'2099-01-01'}).percentage,40)
  assert.equal(s.saveAllowance(e.id,{...basis,status:'not_applicable',percentage:null,effectiveOn:null}).status,'not_applicable')
  assert.equal(s.getAllowance(e.id).percentage,null)
  s.clearAllowance(e.id); s.clearAllowance(e.id)
  assert.equal(s.getAllowance(e.id),null)
  s.saveAllowance(other.id,allowance)
  assert.equal(s.saveRank(e.id,rank).effectiveOn,null)
  assert.equal(s.saveRank(e.id,{...rank,rank:1,documentDate:'2021-02-01'}).rank,1)
  assert.throws(()=>p.updateEmployee(e.id,{...details,employeeType:'staff'}),code('EMPLOYEE_HAS_CURRENT_RANK'))
  assert.throws(()=>f.db.prepare("UPDATE employees SET employee_type='staff' WHERE id=?").run(e.id))
  s.clearRank(e.id)
  p.updateEmployee(e.id,{...details,employeeType:'staff'})
  assert.throws(()=>s.saveRank(e.id,rank),code('RANK_REQUIRES_OFFICIAL'))
  assert.throws(()=>f.db.prepare('INSERT INTO employee_current_ranks(employee_id,rank,assigned_on,confirmed_at) VALUES (?,?,?,?)').run(e.id,1,'2020-01-01',new Date().toISOString()))
  s.saveAllowance(e.id,allowance)
  p.updateEmployee(e.id,details)
  assert.equal(s.getRank(e.id),null)
  s.saveRank(e.id,rank)
  const overview=s.listOverview()
  assert.equal(overview.find(row=>row.employee.id===e.id).rank.rank,15)
  assert.equal(overview.find(row=>row.employee.id===other.id).allowance.percentage,0)
  const before = s.getAllowance(e.id)
  f.db.exec("CREATE TRIGGER test_abort AFTER UPDATE ON employee_seniority_allowances BEGIN SELECT RAISE(ABORT,'synthetic failure'); END")
  assert.throws(()=>s.saveAllowance(e.id,{...allowance,percentage:40}),code('CONFLICT'))
  assert.deepEqual(s.getAllowance(e.id),before)
  f.db.exec('DROP TRIGGER test_abort')
  assert.deepEqual(s.getAllowance(other.id).percentage,0)
  integrity(f.db)
  await f.reopen()
  assert.equal(s.getRank(e.id).rank,15)
  assert.equal(s.listOverview().find(row=>row.employee.id===e.id).rank.rank,15)
  assert.equal(s.getAllowance(e.id).percentage,0)
  assert.throws(()=>new SeniorityRanksService(f.storage,()=>true).getRank(e.id),code('BUSY'))
  assert.throws(()=>new SeniorityRanksService({getDatabase(){throw Error('private path')}},()=>false).getRank(e.id),code('STORAGE_UNAVAILABLE'))
  for (const method of ['getAllowance','getRank','clearAllowance','clearRank']) assert.throws(()=>s[method](randomUUID()),code('NOT_FOUND'))
  assert.throws(()=>s.saveRank(randomUUID(),rank),code('NOT_FOUND'))
  assert.throws(()=>s.saveAllowance(randomUUID(),allowance),code('NOT_FOUND'))
  const leave = new LeaveService(f.storage,()=>false)
  leave.saveServiceLeaveStart(e.id,'2020-05-01')
  s.saveAllowance(e.id,allowance); s.saveRank(e.id,rank)
  assert.equal(leave.getServiceLeaveStart(e.id),'2020-05-01')
  for (const table of ['employee_seniority_allowances','employee_current_ranks']) {
    const columns=f.db.pragma(`table_info(${table})`).map(c=>c.name)
    assert.equal(columns.some(c=>c.includes('acquired')||c.includes('leave')),false)
  }
  p.deleteEmployee(e.id)
  for (const table of ['employee_seniority_allowances','employee_current_ranks']) assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE employee_id=?`).get(e.id).n,0)
  assert.equal(s.getAllowance(other.id).percentage,0)
  integrity(f.db)
})
test('Zod and SQLite reject invalid indicators and dates', async t => {
  const f=await fixture(t),s=f.service,id=f.employee.id
  for(const v of [{percentage:5},{percentage:10.5},{percentage:null},{status:'unknown'},{effectiveOn:'2026-02-30'},{effectiveOn:'2099-01-01'},{status:'not_applicable'},{confirmedAt:'2020-01-01T00:00:00.000Z'},{documentDate:'2025-02-29'}]) assert.throws(()=>s.saveAllowance(id,{...allowance,...v}),code('INVALID_ARGUMENTS'))
  for(const v of [{rank:0},{rank:16},{rank:1.5},{assignedOn:'2099-01-01'},{effectiveOn:'2099-01-01'},{assignedOn:'2025-02-29'}]) assert.throws(()=>s.saveRank(id,{...rank,...v}),code('INVALID_ARGUMENTS'))
  s.saveAllowance(id,allowance);s.saveRank(id,rank)
  for(const sql of ["UPDATE employee_seniority_allowances SET percentage=5", "UPDATE employee_seniority_allowances SET status='not_applicable'", "UPDATE employee_seniority_allowances SET effective_on='2025-02-29'", "UPDATE employee_current_ranks SET rank=16", "UPDATE employee_current_ranks SET assigned_on='2099-01-01'", "UPDATE employee_current_ranks SET effective_on='2099-01-01'", "UPDATE employee_current_ranks SET assigned_on=NULL"]) assert.throws(()=>f.db.exec(sql))
  integrity(f.db)
})
test('preload IPC roundtrip, sender guards, payloads and sanitized failures',async t=>{
 const f=await fixture(t),handlers=new Map(),url='file:///hr/index.html'
 const contents={isDestroyed:()=>false,mainFrame:{url}},win={isDestroyed:()=>false,webContents:contents}
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>win,url,()=>({}),()=>({}),{},()=>{},f.personnel,new LeaveService(f.storage,()=>false),undefined,undefined,undefined,f.service)
 const event={sender:contents,senderFrame:contents.mainFrame}
 let exposed
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{exposed=v}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args)}})})
 const api=exposed.seniorityRanks,id=f.employee.id
 const overview=await api.listOverview()
 assert.equal(overview.ok,true)
 assert.equal(overview.data.length,2)
 assert.equal(overview.data.find(row=>row.employee.id===id).allowance,null)
 const overviewHandler=handlers.get(ipcChannels.seniorityListOverview)
 assert.equal(overviewHandler({...event,sender:{} }).error.code,'FORBIDDEN')
 assert.equal(overviewHandler({...event,senderFrame:null}).error.code,'FORBIDDEN')
 assert.equal(overviewHandler({...event,senderFrame:{url}}).error.code,'FORBIDDEN')
 assert.equal(overviewHandler(event,'extra').error.code,'INVALID_ARGUMENTS')
 contents.mainFrame.url='https://invalid.test/'
 assert.equal(overviewHandler(event).error.code,'FORBIDDEN');contents.mainFrame.url=url
 assert.deepEqual(Object.keys(api).sort(),['clearAllowance','clearRank','clearServiceBaseline','getAllowance','getRank','getServiceBaseline','getServiceProjection','listOverview','saveAllowance','saveRank','saveServiceBaseline'])
 for(const [save,get,clear,value] of [['saveAllowance','getAllowance','clearAllowance',allowance],['saveRank','getRank','clearRank',rank]]) {
  assert.equal((await api[get](id)).data,null)
  assert.equal((await api[save](id,value)).ok,true)
  assert.equal((await api[get](id)).data.employeeId,id)
  assert.equal((await api[clear](id)).ok,true)
  assert.equal((await api[get](id)).data,null)
 }
 for (const [name,args] of [['GetAllowance',[id]],['SaveAllowance',[id,allowance]],['ClearAllowance',[id]],['GetRank',[id]],['SaveRank',[id,rank]],['ClearRank',[id]]]) {
  const handle=handlers.get(ipcChannels['seniority'+name])
  for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}]) assert.equal(handle(bad,...args).error.code,'FORBIDDEN')
  assert.equal(handle(event,...args,'extra').error.code,'INVALID_ARGUMENTS')
 }
 const h=handlers.get(ipcChannels.senioritySaveRank)
 for(const args of [[id],[id,{...rank,rank:16}],[id,{...rank,confirmedAt:'injected'}],['bad',rank],[id,rank,'extra']]) assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}]) assert.equal(h(bad,id,rank).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://invalid.test/'
 assert.equal(h(event,id,rank).error.code,'FORBIDDEN');contents.mainFrame.url=url
 assert.equal((await api.getRank(randomUUID())).error.code,'NOT_FOUND')
 f.db.exec("CREATE TRIGGER test_private BEFORE INSERT ON employee_current_ranks BEGIN SELECT RAISE(ABORT,'private SQL path'); END")
 assert.deepEqual(h(event,id,rank),{ok:false,error:{code:'CONFLICT'}})
})
