import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,mkdirSync,rmSync,readdirSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve,sep,basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { Storage,openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { SeniorityRanksService } from '../dist-electron/electron/seniority-ranks/service.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { PersonnelControlService } from '../dist-electron/electron/personnel-control/service.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
const code=c=>e=>e.code===c
function temp(){return mkdtempSync(join(tmpdir(),'hr-control-'))}
function clean(root){assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&basename(root).startsWith('hr-control-'));rmSync(root,{recursive:true,force:true,maxRetries:5})}
async function fixture(t){
 const root=temp(t),storage=new Storage(),file=join(root,'data','test.db');await storage.initializeSafely(()=>file)
 const cleanup=[];t.after(()=>{cleanup.forEach(fn=>fn());storage.close();clean(root)})
 const p=new PersonnelService(storage,()=>false),s=new SeniorityRanksService(storage,()=>false),leave=new LeaveService(storage,()=>false),clock={on:'2026-01-01'}
 const control=new PersonnelControlService(storage,()=>false,()=>clock.on)
 const departmentId=p.createDepartment({name:'Тест'}).id,positionId=p.createPosition({name:'Тест'}).id
 const input={lastName:'Синтетичний',firstName:'Приклад',middleName:null,birthDate:null,employeeType:'official',hireDate:'2020-01-01',departmentId,positionId,positionCategory:'VII',positionStartedOn:'2024-01-02'}
 const e=p.createEmployee(input),staff=p.createEmployee({...input,employeeType:'staff',positionCategory:null})
 const base={years:4,months:0,days:0,asOfDate:'2026-01-01',autoAccrueAfterBaseline:true,basisNote:null}
 s.saveServiceBaseline(e.id,base)
 s.saveAllowance(e.id,{status:'confirmed',percentage:10,effectiveOn:'2020-01-01',documentType:null,documentNumber:null,documentDate:null,reviewOn:null})
 s.saveRank(e.id,{rank:15,assignedOn:'2024-01-02',effectiveOn:null,origin:'oms_assigned',reviewAnchorOn:null,originNote:null,documentType:null,documentNumber:null,documentDate:null,reviewOn:'2026-01-02'})
 leave.saveRights(e.id,[{leaveType:'oms_service_additional',status:'has_right'}]);leave.saveServiceLeaveStart(e.id,'2020-01-01')
 return {root,file,storage,p,s,leave,clock,control,e,staff,base,cleanup,get db(){return storage.getDatabase()}}
}
const rankIssue=f=>f.control.getOverview().issues.find(i=>i.direction==='rank'&&i.category!=='data_incomplete')
const integrity=db=>{assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok')}

test('v17→v18 retains the old ledger and facts, singleton defaults and strict FK/CHECK state structure',async t=>{
 const root=temp(t),file=join(root,'test.db');let c=await openStorageSafely(file,migrations.slice(0,17))
 const old=c.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();c.close();c=await openStorageSafely(file);t.after(()=>{c.close();clean(root)})
 assert.equal(c.schemaVersion,21);assert.deepEqual(c.database.prepare('SELECT * FROM schema_migrations WHERE version<=17 ORDER BY version').all(),old)
 assert.deepEqual(c.database.prepare('SELECT * FROM personnel_control_settings').all(),[{id:1,horizon_days:30}])
 for(const sql of ['UPDATE personnel_control_settings SET horizon_days=15','INSERT INTO personnel_control_settings VALUES (2,30)'])assert.throws(()=>c.database.exec(sql))
 const f=await fixture(t),issue=rankIssue(f),insert=f.db.prepare('INSERT INTO personnel_reminder_states VALUES (?,?,?,?,?,?)')
 for(const args of [[randomUUID(),issue.id,issue.fingerprint,'reviewed',null,'stamp'],[f.e.id,issue.id,'bad','reviewed',null,'stamp'],[f.e.id,issue.id,issue.fingerprint,'bad',null,'stamp'],[f.e.id,issue.id,issue.fingerprint,'snoozed',null,'stamp'],[f.e.id,issue.id,issue.fingerprint,'reviewed','2026-02-30','stamp'],[f.e.id,issue.id,issue.fingerprint,'snoozed','2026-02-30','stamp']])assert.throws(()=>insert.run(...args))
 integrity(c.database);integrity(f.db)
})
test('overview is read-only; states expire, repeat on due, ignore technical stamps and reject stale fact fingerprints',async t=>{
 const f=await fixture(t),{control,clock}=f
 const snapshot=()=>Object.fromEntries(['employees','employee_service_baselines','employee_seniority_allowances','employee_current_ranks','employee_service_leave_start','employee_leave_rights','leave_period_balances','leave_records','leave_allocations'].map(table=>[table,f.db.prepare('SELECT * FROM '+table).all()]))
 const before=snapshot(),changes=f.db.prepare('SELECT total_changes() AS n').get().n
 f.db.pragma('query_only=ON');const initial=control.getOverview();f.db.pragma('query_only=OFF')
 assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.equal(initial.activeCount,1);assert.deepEqual(snapshot(),before)
 assert.ok(initial.issues.every(i=>i.employeeId!==f.staff.id))
 const upcoming=rankIssue(f);assert.equal(upcoming.category,'upcoming')
 control.setReminderState({id:upcoming.id,fingerprint:upcoming.fingerprint,state:'reviewed'});assert.equal(rankIssue(f).state,'reviewed');assert.equal(control.getOverview().activeCount,0)
 clock.on='2026-01-02';const due=rankIssue(f);assert.equal(due.category,'due');assert.equal(due.state,'active');assert.notEqual(due.fingerprint,upcoming.fingerprint)
 assert.throws(()=>control.setReminderState({id:upcoming.id,fingerprint:upcoming.fingerprint,state:'reviewed'}),code('STALE_REMINDER'))
 control.setReminderState({id:due.id,fingerprint:due.fingerprint,state:'snoozed',days:7});assert.equal(rankIssue(f).snoozedUntil,'2026-01-09')
 clock.on='2026-01-08';assert.equal(rankIssue(f).state,'snoozed')
 clock.on='2026-01-09';assert.equal(rankIssue(f).state,'active');assert.equal(rankIssue(f).fingerprint,due.fingerprint)
 control.setReminderState({id:due.id,fingerprint:due.fingerprint,state:'reviewed'});clock.on='2026-01-10';assert.equal(rankIssue(f).state,'reviewed')
 const saved=f.s.getRank(f.e.id);const {employeeId,confirmedAt,...input}=saved
 f.s.saveRank(f.e.id,input);assert.equal(rankIssue(f).state,'reviewed')
 f.s.saveRank(f.e.id,{...input,originNote:'Нова підтверджена обставина'});const updated=rankIssue(f);assert.equal(updated.state,'active');assert.notEqual(updated.fingerprint,due.fingerprint)
 control.setReminderState({id:updated.id,fingerprint:updated.fingerprint,state:'snoozed',days:1})
 control.setReminderState({id:updated.id,fingerprint:updated.fingerprint,state:'active'});assert.equal(rankIssue(f).state,'active');assert.equal(f.db.prepare('SELECT count(*) AS n FROM personnel_reminder_states').get().n,0)
 const {id:cardId,position,department,...details}=f.p.getEmployee(f.e.id)
 const quality=f.p.createEmployee({...details,lastName:'Без відомостей',positionCategory:null,positionStartedOn:null})
 assert.ok(control.getOverview().issues.some(i=>i.employeeId===quality.id&&i.category==='data_incomplete'))
 assert.equal(control.getOverview().activeCount,1)
 control.setReminderState({id:updated.id,fingerprint:updated.fingerprint,state:'reviewed'})
 f.p.deleteEmployee(f.e.id);assert.equal(f.db.prepare('SELECT count(*) AS n FROM personnel_reminder_states').get().n,0);integrity(f.db)
})
test('settings survive restart; live owner after actual protected backup/restore restores states and settings',async t=>{
 const f=await fixture(t),{control,storage}=f
 for(const horizonDays of [7,14,30,60,90])assert.equal(control.saveSettings({horizonDays}).horizonDays,horizonDays)
 assert.throws(()=>control.saveSettings({horizonDays:45}),code('INVALID_ARGUMENTS'))
 assert.throws(()=>control.setReminderState({id:'bad',fingerprint:'x',state:'snoozed',days:3}),code('INVALID_ARGUMENTS'))
 storage.close();await storage.reopen();assert.equal(control.getSettings().horizonDays,90)
 const issue=rankIssue(f);control.setReminderState({id:issue.id,fingerprint:issue.fingerprint,state:'reviewed'})
 const backup=new BackupService(storage);f.cleanup.push(()=>{backup.stop();backup.invalidateSelections()})
 const folders=[join(f.root,'one'),join(f.root,'two')];folders.forEach(p=>mkdirSync(p))
 const a=await backup.chooseFolder(1,async()=>folders[0]),b=await backup.chooseFolder(2,async()=>folders[1]);await backup.saveConfig([a.token,b.token]);await backup.runManual()
 const copy=join(folders[0],readdirSync(folders[0]).find(n=>n.includes('-manual-')&&n.endsWith('.db')))
 control.saveSettings({horizonDays:7});control.setReminderState({id:issue.id,fingerprint:issue.fingerprint,state:'active'})
 const selected=await backup.chooseRestore(async()=>copy);assert.deepEqual(await backup.confirmRestore(selected.token,async()=>true),{restored:true})
 assert.equal(control.getSettings().horizonDays,90);assert.equal(rankIssue(f).state,'reviewed');integrity(f.db)
 assert.throws(()=>new PersonnelControlService(storage,()=>true).getOverview(),code('BUSY'))
 assert.throws(()=>new PersonnelControlService({getDatabase(){throw Error('private')}},()=>false).getOverview(),code('STORAGE_UNAVAILABLE'))
})
test('typed IPC, notification subscription, sender/frame/URL guards and post-commit invalidation are narrow',async t=>{
 const f=await fixture(t),handlers=new Map(),listeners=new Map(),sent=[],url='file:///hr/index.html',contents={isDestroyed:()=>false,mainFrame:{url},send:(...args)=>{sent.push(args);listeners.get(args[0])?.({private:'event'})}},event={sender:contents,senderFrame:null};event.senderFrame=contents.mainFrame
 registerIpcHandlers({handle:(c,h)=>handlers.set(c,h)},()=>({isDestroyed:()=>false,webContents:contents}),url,()=>({}),()=>({}),{},()=>{},f.p,f.leave,undefined,undefined,undefined,f.s,f.control)
 let api
 runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(k,v)=>{api=v.personnelControl}},ipcRenderer:{invoke:(c,...args)=>handlers.get(c)(event,...args),on:(c,h)=>listeners.set(c,h),removeListener:(c,h)=>{if(listeners.get(c)===h)listeners.delete(c)}}})})
 let changes=0,argsReceived;const off=api.onChanged((...args)=>{changes++;argsReceived=args})
 assert.equal((await api.getOverview()).data.activeCount,1)
 assert.equal((await api.saveSettings({horizonDays:14})).ok,true);assert.equal(changes,1);assert.equal(argsReceived.length,0)
 const issue=rankIssue(f);assert.equal((await api.setReminderState({id:issue.id,fingerprint:issue.fingerprint,state:'reviewed'})).ok,true);assert.equal(changes,2)
 const h=handlers.get(ipcChannels.controlSetState),input={id:issue.id,fingerprint:issue.fingerprint,state:'active'}
 for(const args of [[],[{}],[{...input,state:'snoozed',days:3}],[{...input,employeeId:f.e.id}],[input,'extra']])assert.equal(h(event,...args).error.code,'INVALID_ARGUMENTS')
 for(const bad of [{...event,sender:{}},{...event,senderFrame:null},{...event,senderFrame:{url}}])assert.equal(h(bad,input).error.code,'FORBIDDEN')
 contents.mainFrame.url='https://foreign.test';assert.equal(h(event,input).error.code,'FORBIDDEN');contents.mainFrame.url=url
 const previous=changes;assert.equal(handlers.get(ipcChannels.controlOverview)(event).ok,true);assert.equal(changes,previous)
 off();await api.saveSettings({horizonDays:30});assert.equal(changes,previous)
 contents.send=()=>{throw Error('Cannot notify')};assert.equal((await api.saveSettings({horizonDays:60})).ok,true)
 f.control.getOverview=()=>{throw Error('SQL private path')};assert.deepEqual(handlers.get(ipcChannels.controlOverview)(event),{ok:false,error:{code:'INTERNAL_ERROR'}})
 assert.ok(sent.every(args=>args.length===1&&args[0]==='personnelControl:changed'))
})
