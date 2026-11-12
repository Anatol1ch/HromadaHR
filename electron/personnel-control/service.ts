import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import { SeniorityRanksService } from '../seniority-ranks/service.js'
import type { ServiceBaselineInput } from '../../shared/seniority-ranks.js'
import type { ConfirmedLeavePeriod } from '../../shared/leave.js'
import type { ControlOverview,ControlSettings,ReminderStateInput,PersonnelIssue } from '../../shared/personnel-control.js'
import { buildPersonnelIssues,comparePersonnelIssues,controlDay } from '../../shared/personnel-control-calculations.js'
import { todayIsoDate } from '../../src/lib/dates.js'
import * as schemas from './schemas.js'
export class PersonnelControlError extends Error {
 constructor(readonly code:'BUSY'|'STORAGE_UNAVAILABLE'|'INVALID_ARGUMENTS'|'STALE_REMINDER'|'CONFLICT'){super(code)}
}
type StateRow={employeeId:string;issueKey:string;fingerprint:string;state:'reviewed'|'snoozed';snoozedUntil:string|null}
export class PersonnelControlService {
 constructor(private readonly storage:Pick<Storage,'getDatabase'>,private readonly isBusy:()=>boolean,private readonly today:()=>string=todayIsoDate){}
 private run<T>(write:boolean,operation:(db:Database.Database)=>T):T {
  if(this.isBusy())throw new PersonnelControlError('BUSY')
  let db:Database.Database
  try{db=this.storage.getDatabase()}catch{throw new PersonnelControlError('STORAGE_UNAVAILABLE')}
  try{const tx=db.transaction(()=>operation(db));return write?tx.immediate():tx.deferred()}
  catch(error){
   if(error instanceof PersonnelControlError)throw error
   const code=error&&typeof error==='object'&&'code' in error?String(error.code):''
   if(/^SQLITE_(BUSY|LOCKED)/.test(code))throw new PersonnelControlError('BUSY')
   if(code.startsWith('SQLITE_CONSTRAINT'))throw new PersonnelControlError('CONFLICT')
   throw error
  }
 }
 private parse<T>(schema:{parse:(value:unknown)=>T},value:unknown):T{try{return schema.parse(value)}catch{throw new PersonnelControlError('INVALID_ARGUMENTS')}}
 private settings(db:Database.Database):ControlSettings{return db.prepare<[],ControlSettings>('SELECT horizon_days AS horizonDays FROM personnel_control_settings WHERE id=1').get()!}
 getSettings=()=>this.run(false,db=>this.settings(db))
 saveSettings=(input:ControlSettings)=>{
  const value=this.parse(schemas.settings,input)
  return this.run(true,db=>{db.prepare('UPDATE personnel_control_settings SET horizon_days=? WHERE id=1').run(value.horizonDays);return this.settings(db)})
 }
 private overview(db:Database.Database):ControlOverview {
  const on=this.today(),settings=this.settings(db)
  const people=new SeniorityRanksService(this.storage,this.isBusy).listOverview()
  const baselineRows=db.prepare<[],Omit<ServiceBaselineInput,'autoAccrueAfterBaseline'>&{employeeId:string;autoAccrueAfterBaseline:number}>('SELECT employee_id AS employeeId,years,months,days,as_of_date AS asOfDate,basis_note AS basisNote,auto_accrue_after_baseline AS autoAccrueAfterBaseline FROM employee_service_baselines').all()
  const baselines=new Map(baselineRows.map(row=>[row.employeeId,{...row,autoAccrueAfterBaseline:Number(row.autoAccrueAfterBaseline)===1}]))
  const starts=new Map(db.prepare<[],{employeeId:string;date:string}>('SELECT employee_id AS employeeId,acquired_on AS date FROM employee_service_leave_start').all().map(r=>[r.employeeId,r.date]))
  const rights=new Map(db.prepare<[],{employeeId:string;status:'has_right'|'no_right'}>("SELECT employee_id AS employeeId,status FROM employee_leave_rights WHERE leave_type='oms_service_additional'").all().map(r=>[r.employeeId,r.status]))
  const periods=db.prepare<[],Omit<ConfirmedLeavePeriod,'status'>>(`SELECT id,employee_id AS employeeId,leave_type AS leaveType,period_start AS periodStart,period_end AS periodEnd,accounting_basis AS accountingBasis,confirmed_days AS confirmedDays,reference_entitlement_days AS referenceEntitlementDays FROM leave_period_balances WHERE leave_type='oms_service_additional' ORDER BY period_start,id`).all().map(p=>({...p,status:'confirmed' as const}))
  const states=new Map(db.prepare<[],StateRow>('SELECT employee_id AS employeeId,issue_key AS issueKey,fingerprint,state,snoozed_until AS snoozedUntil FROM personnel_reminder_states').all().map(s=>[s.issueKey,s]))
  const issues:PersonnelIssue[]=people.flatMap(row=>buildPersonnelIssues({employee:row.employee,allowance:row.allowance,rank:row.rank,baseline:baselines.get(row.employee.id)??null,
   leave:{acquiredOn:starts.get(row.employee.id)??null,rightStatus:rights.get(row.employee.id)??'unknown',periods:periods.filter(p=>p.employeeId===row.employee.id)}},on,settings.horizonDays)).map(({fingerprintData,...issue})=>{
    const fingerprint=createHash('sha256').update(fingerprintData).digest('hex'),saved=states.get(issue.id)
    const valid=saved?.employeeId===issue.employeeId&&saved.fingerprint===fingerprint
    const state=valid&&saved.state==='reviewed'?'reviewed':valid&&saved.state==='snoozed'&&(saved.snoozedUntil??'')>on?'snoozed':'active'
    return {...issue,fingerprint,state,snoozedUntil:state==='snoozed'?saved!.snoozedUntil:null}
   })
  issues.sort(comparePersonnelIssues)
  return {calculatedOn:on,settings,issues,activeCount:issues.filter(i=>i.state==='active'&&i.category!=='data_incomplete').length}
 }
 getOverview=()=>this.run(false,db=>this.overview(db))
 setReminderState=(input:ReminderStateInput)=>{
  const value=this.parse(schemas.stateInput,input)
  return this.run(true,db=>{
   const overview=this.overview(db),issue=overview.issues.find(i=>i.id===value.id)
   if(!issue||issue.fingerprint!==value.fingerprint)throw new PersonnelControlError('STALE_REMINDER')
   if(value.state==='active')db.prepare('DELETE FROM personnel_reminder_states WHERE employee_id=? AND issue_key=?').run(issue.employeeId,issue.id)
   else {
    const until=value.state==='snoozed'?controlDay(overview.calculatedOn,value.days):null
    if(value.state==='snoozed'&&!until)throw new PersonnelControlError('INVALID_ARGUMENTS')
    db.prepare(`INSERT INTO personnel_reminder_states(employee_id,issue_key,fingerprint,state,snoozed_until,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(employee_id,issue_key) DO UPDATE SET fingerprint=excluded.fingerprint,state=excluded.state,snoozed_until=excluded.snoozed_until,updated_at=excluded.updated_at`)
     .run(issue.employeeId,issue.id,issue.fingerprint,value.state,until,new Date().toISOString())
   }
   return this.overview(db)
  })
 }
}
