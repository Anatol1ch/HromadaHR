import type { EmployeeCard } from './personnel.js'
import type { Allowance,CurrentRank,ServiceBaselineInput } from './seniority-ranks.js'
import { projectService } from './service-calculations.js'
import { projectRank } from './rank-projection.js'
import { projectOmsServiceLeave,type OmsServiceLeaveFacts } from './service-leave-calculations.js'
import type { ControlDirection,ControlCategory,PersonnelIssue,EmployeeCardTab } from './personnel-control.js'
import { isIsoCalendarDate } from '../src/lib/dates.js'
export interface ControlFacts {employee:EmployeeCard;baseline:ServiceBaselineInput|null;allowance:Allowance|null;rank:CurrentRank|null;leave:OmsServiceLeaveFacts}
export type DraftIssue=Omit<PersonnelIssue,'fingerprint'|'state'|'snoozedUntil'>&{fingerprintData:string}
/** Bounded Gregorian calendar day shift, UTC serial only; no local-time/DST arithmetic. */
export function controlDay(on:string,days:number):string|null {
 if(!isIsoCalendarDate(on)||!Number.isSafeInteger(days)||Math.abs(days)>3652059)return null
 const date=new Date(on+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days)
 const iso=date.toISOString().slice(0,10)
 return isIsoCalendarDate(iso)?iso:null
}
function withoutStamp(value:unknown):unknown {
 if(Array.isArray(value))return value.map(withoutStamp)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['confirmedAt','checkedAt'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,withoutStamp(v)]))
 return value
}
/** Interpret existing projections only. Follow their next thresholds, never reproduce their scales. */
function thresholdEvent<T extends {reviewOn:string|null;nextThreshold:object|null}>(baseline:ServiceBaselineInput|null,on:string,through:string,forecast:(date:string)=>T,resolved:(threshold:NonNullable<T['nextThreshold']>,date:string)=>boolean) {
 if(!baseline?.autoAccrueAfterBaseline)return []
 let date=baseline.asOfDate,pending:{date:string;threshold:object}|null=null
 for(let i=0;i<8;i++) {
  const p=forecast(date)
  if(!p.reviewOn||!p.nextThreshold||p.reviewOn<=date||p.reviewOn>through)break
  if(!resolved(p.nextThreshold,p.reviewOn)) {
   const event={date:p.reviewOn,threshold:p.nextThreshold}
   if(event.date<=on)pending=event
   else return pending?[pending,event]:[event]
  }
  date=p.reviewOn
 }
 return pending?[pending]:[]
}
export function buildPersonnelIssues(f:ControlFacts,on:string,horizon:number):DraftIssue[] {
 const e=f.employee
 if(e.employeeType!=='official'||!isIsoCalendarDate(on))return []
 const through=controlDay(on,horizon)??'9999-12-31',issues:DraftIssue[]=[]
 const name=[e.lastName,e.firstName,e.middleName].filter(Boolean).join(' ')
 const service=projectService(f.baseline,on,e.employeeType,f.allowance)
 const rank=projectRank(e,f.rank,on),leave=projectOmsServiceLeave(f.baseline,on,e.employeeType,f.leave)
 function add(direction:ControlDirection,subject:string,title:string,explanation:string,category:ControlCategory,dates:PersonnelIssue['dates'],tab:EmployeeCardTab,source:unknown) {
  const relevant=dates.filter(d=>d.date<=through).sort((a,b)=>a.date.localeCompare(b.date)||a.source.localeCompare(b.source))
  const date=relevant[0]?.date??null
  const phase=category==='data_incomplete'?'data':relevant.some(d=>d.date<=on)?'due':category==='review_needed'?'review':'upcoming'
  issues.push({id:`${e.id}:${direction}:${subject}`,employeeId:e.id,employeeName:name,direction,category,title,explanation,date,dates:relevant,tab,
   fingerprintData:JSON.stringify([withoutStamp(source),relevant,phase])})
 }
 const allowanceEvent=service.status==='calculated'?thresholdEvent(f.baseline,on,through,date=>projectService(f.baseline,date,e.employeeType,f.allowance),threshold=>f.allowance?.status==='confirmed'&&f.allowance.percentage>=(threshold as {percentage:number}).percentage):[]
 const allowanceDates:PersonnelIssue['dates']=[]
 if(f.allowance?.reviewOn&&f.allowance.reviewOn<=through)allowanceDates.push({source:'manual',date:f.allowance.reviewOn})
 for(const event of allowanceEvent)allowanceDates.push({source:'projection',date:event.date})
 const different=service.comparison==='different'
 if(different||allowanceDates.length)add('allowance','control','Перевірити надбавку за вислугу',
  [different?`Розрахунковий показник — ${service.percentage}%, підтверджений — ${f.allowance?.percentage}%. Перевірте підстави для зміни.`:'Перевірте кадрові підстави та умови застосування надбавки.',allowanceEvent.map(event=>`Поріг понад ${(event.threshold as {years:number}).years} років — ${(event.threshold as {percentage:number}).percentage}%. Розрахункова дата ${event.date<=on?'настала':'наближається'} й залишається орієнтовною.`).join(' '),'Ручний строк і прогноз показані окремо; рішення автоматично не змінюється.'].filter(Boolean).join(' '),
  different?'review_needed':allowanceDates.some(d=>d.date<=on)?'due':'upcoming',allowanceDates,'service',[f.baseline,f.allowance,allowanceEvent])
 const rankDates:PersonnelIssue['dates']=[]
 if(f.rank?.reviewOn&&f.rank.reviewOn<=through)rankDates.push({source:'manual',date:f.rank.reviewOn})
 if(rank.status==='projected'&&rank.reviewOn&&rank.reviewOn<=through)rankDates.push({source:'projection',date:rank.reviewOn})
 if(rankDates.length)add('rank','control',rank.status==='projected'?`Перевірити можливість присвоєння ${rank.nextRank}-го рангу`:'Перевірити підтверджені відомості рангу',
  rank.status==='projected'?'Орієнтовний строк кадрової перевірки. Потрібна перевірка результатів роботи та інших застосовних умов.':`Ручний контрольний строк. ${rank.explanation}`,
  rankDates.some(d=>d.date<=on)?'due':'upcoming',rankDates,'rank',[f.rank,e.positionCategory,e.positionStartedOn,e.positionId,e.departmentId])
 const leaveEvent=leave.status==='calculated'?thresholdEvent(f.baseline,on,through,date=>projectOmsServiceLeave(f.baseline,date,e.employeeType,f.leave),(threshold,date)=>f.leave.rightStatus==='has_right'&&(date<=on||leave.currentPeriods.some(p=>p.accountingBasis==='confirmed_entitlement'&&p.confirmedDays>=(threshold as {days:number}).days))):[]
 const rightDiff=leave.status==='calculated'&&(leave.recommendedDays??0)>0&&leave.rightStatus!=='has_right'
 const periodDiff=leave.currentPeriods.some(p=>p.comparison==='different')
 const leaveDates:PersonnelIssue['dates']=leaveEvent.map(event=>({source:'projection',date:event.date}))
 if(rightDiff||periodDiff||leaveDates.length)add('service_leave','control','Перевірити додаткову відпустку за стаж ОМС',
  [`Рекомендована тривалість — ${leave.recommendedDays} к. дн.`,leaveEvent.map(event=>`Поріг понад ${(event.threshold as {years:number}).years} років — ${(event.threshold as {days:number}).days} к. дн.`).join(' '),rightDiff?'Звірте розрахунок із підтвердженим статусом права.':'',periodDiff?'Підтверджені дні нового поточного періоду відрізняються від рекомендації.':'','Нормативна тривалість не є залишком. Особливі обставини й право потребують кадрової перевірки; дата орієнтовна.'].filter(Boolean).join(' '),
  rightDiff||periodDiff?'review_needed':leaveDates.some(d=>d.date<=on)?'due':'upcoming',leaveDates,'leave',[f.baseline,f.leave.acquiredOn,f.leave.rightStatus,leave.currentPeriods,leaveEvent])
 if(!f.baseline||service.status==='requires_review')add('allowance','baseline','Уточнити опорний стаж','Для обґрунтованого прогнозу внесіть або перевірте підтверджений стаж і опорну дату.','data_incomplete',[],'service',f.baseline)
 else if(!f.allowance)add('allowance','missing','Уточнити підтверджену надбавку','Поточний показник надбавки не внесено. Відсутність запису не означає 0%.','data_incomplete',[],'service',[f.baseline,f.allowance])
 if(rank.status==='missing_data'||rank.status==='requires_review'||f.rank?.origin==='unknown')add('rank','data','Уточнити відомості для контролю рангу',
  [!e.positionCategory?'Не зазначено категорію посади.':'',!e.positionStartedOn?'Не внесено дату призначення.':'',f.rank?.origin==='unknown'?'Уточніть походження та документальну підставу рангу.':'',rank.explanation].filter(Boolean).join(' '),
  'data_incomplete',[],!e.positionCategory||!e.positionStartedOn?'general':'rank',[f.rank,e.positionCategory,e.positionStartedOn])
 return issues
}
export function comparePersonnelIssues(a:Pick<PersonnelIssue,'category'|'date'|'employeeName'|'id'>,b:Pick<PersonnelIssue,'category'|'date'|'employeeName'|'id'>) {
 const priority={review_needed:0,due:0,upcoming:1,data_incomplete:3}
 return priority[a.category]-priority[b.category]||(a.date??'9999-12-31').localeCompare(b.date??'9999-12-31')||a.employeeName.localeCompare(b.employeeName,'uk')||a.id.localeCompare(b.id)
}
