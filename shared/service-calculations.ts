import { daysInMonth, isIsoCalendarDate } from '../src/lib/dates.js'
import type { Allowance, ServiceAccountingInput } from './seniority-ranks.js'
export interface Duration { years: number; months: number; days: number }
export type CalculationStatus = 'calculated' | 'missing_service_data' | 'requires_review'
export type CalculationReason = 'invalid_input' | 'before_baseline' | 'overlap' | 'multiple_open_periods' | 'period_order' | 'overflow' | 'date_range' | null
export interface ServiceCalculation { status: CalculationStatus; current: Duration | null; calculatedOn: string; reason: CalculationReason; accuracy: 'confirmed' | 'estimate' | 'unavailable'; mode: ServiceAccountingInput['mode'] | null; accrues: boolean; creditedDays:number|null }
export interface ServiceProjection { status: CalculationStatus | 'not_applicable'; calculation: ServiceCalculation; percentage: number | null; nextThreshold: { years: number; percentage: number } | null; reviewOn: string | null; reviewAccuracy: 'estimate' | null; confirmedAllowance: Allowance | null; comparison: 'matches' | 'different' | 'missing' | 'not_applicable' | 'unavailable' }
// КМУ №268, п.3 пп.4. Strict “понад”; this is a forecast, not a legal eligibility engine.
export const allowanceThresholds = [ { years:3, percentage:10 }, { years:5, percentage:15 }, { years:10, percentage:20 }, { years:15, percentage:25 }, { years:20, percentage:30 }, { years:25, percentage:40 } ] as const
const DAY = 86400000
function serial(iso: string) { const [y,m,d]=iso.split('-').map(Number), date=new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(0,0,0,0); return date.valueOf()/DAY }
function fromSerial(n:number) { return new Date(n*DAY).toISOString().slice(0,10) }
function addDays(date:string,days:number):string|null { const result=serial(date)+days; return result>=serial('0001-01-01')&&result<=serial('9999-12-31')?fromSerial(result):null }
function boundary(anchor:string,months:number):string|null {
 const [y,m,d]=anchor.split('-').map(Number), index=y*12+m-1+months, year=Math.floor(index/12),month=index%12+1
 if(year<1||year>9999)return null
 return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(d,daysInMonth(year,month))).padStart(2,'0')}`
}
function fromAnchorDuration(anchor:string,elapsedDays:number,on:string,mode:ServiceAccountingInput['mode'],accuracy:'confirmed'|'estimate'):
 ServiceCalculation {
 const fail=(reason:CalculationReason):ServiceCalculation=>({status:'requires_review',current:null,calculatedOn:on,reason,accuracy:'unavailable',mode,accrues:false,creditedDays:null})
 const endpoint=addDays(anchor,elapsedDays)
 if(!endpoint)return fail('date_range')
 let months=0
 while(true) { const next=boundary(anchor,months+1); if(!next)return fail('date_range'); if(next>endpoint)break; months++ }
 const monthStart=boundary(anchor,months)
 if(!monthStart)return fail('date_range')
 const totalMonths=BigInt(months),years=totalMonths/12n
 if(years>BigInt(Number.MAX_SAFE_INTEGER))return fail('overflow')
 return {status:'calculated',current:{years:Number(years),months:Number(totalMonths%12n),days:serial(endpoint)-serial(monthStart)},calculatedOn:on,reason:null,accuracy,mode,accrues:true,creditedDays:null}
}
function validInput(v:ServiceAccountingInput,on:string):CalculationReason {
 if(!isIsoCalendarDate(on))return 'invalid_input'
 if(v.mode==='continuous')return isIsoCalendarDate(v.startDate)&&v.startDate<=on?null:v.startDate>on?'before_baseline':'invalid_input'
 if(v.mode==='snapshot')return Number.isSafeInteger(v.years)&&v.years>=0&&Number.isInteger(v.months)&&v.months>=0&&v.months<=11&&Number.isInteger(v.days)&&v.days>=0&&v.days<=30&&isIsoCalendarDate(v.asOfDate)?(v.asOfDate<=on?null:'before_baseline'):'invalid_input'
 if(v.mode!=='periods'||!Array.isArray(v.periods)||!v.periods.length)return 'invalid_input'
 if(v.periods.filter(period=>period?.endDate===null).length>1)return 'multiple_open_periods'
 const ids=new Set<string>(); let previousEnd:string|null=null
 for(let i=0;i<v.periods.length;i++) {
  const p=v.periods[i]
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||!isIsoCalendarDate(p.startDate)||p.startDate>on||p.endDate!==null&&(!isIsoCalendarDate(p.endDate)||p.endDate>on||p.endDate<p.startDate))return 'invalid_input'
  ids.add(p.id)
  if(previousEnd!==null&&p.startDate<=previousEnd)return 'overlap'
  if(previousEnd!==null&&p.startDate<previousEnd)return 'period_order'
  if(p.endDate===null&&i!==v.periods.length-1)return 'period_order'
  previousEnd=p.endDate??on
 }
 return null
}
/** Snapshot and continuous keep the established anchor/clamp convention. Periods sum exact inclusive credited days, then map that total onto a synthetic continuous calendar anchored at the earliest period. */
export function calculateService(v:ServiceAccountingInput|null,on:string):ServiceCalculation {
 const fail=(reason:CalculationReason,mode:ServiceAccountingInput['mode']|null=null):ServiceCalculation=>({status:'requires_review',current:null,calculatedOn:on,reason,accuracy:'unavailable',mode,accrues:false,creditedDays:null})
 if(!isIsoCalendarDate(on))return fail('invalid_input',v?.mode??null)
 if(!v)return {status:'missing_service_data',current:null,calculatedOn:on,reason:null,accuracy:'unavailable',mode:null,accrues:false,creditedDays:null}
 const reason=validInput(v,on); if(reason)return fail(reason,v.mode)
 if(v.mode==='snapshot') {
  const snapshot=v
  const base={status:'calculated' as const,current:{years:snapshot.years,months:snapshot.months,days:snapshot.days},calculatedOn:on,reason:null,accuracy:'confirmed' as const,mode:v.mode,accrues:true,creditedDays:null}
  if(on===snapshot.asOfDate)return base
  const [y,m]=on.split('-').map(Number),[by,bm]=snapshot.asOfDate.split('-').map(Number)
  let elapsed=(y-by)*12+m-bm
  const monthBoundary=boundary(snapshot.asOfDate,elapsed); if(!monthBoundary)return fail('date_range',v.mode)
  if(monthBoundary>on)elapsed--
  const start=boundary(snapshot.asOfDate,elapsed); if(!start)return fail('date_range',v.mode)
  let days=snapshot.days+serial(on)-serial(start),carried=0
  while(true) { const a=boundary(snapshot.asOfDate,elapsed+carried),b=boundary(snapshot.asOfDate,elapsed+carried+1); if(!a||!b)return fail('date_range',v.mode); const length=serial(b)-serial(a); if(days<length)break; days-=length; carried++ }
  const totalMonths=BigInt(snapshot.years)*12n+BigInt(snapshot.months+elapsed+carried),years=totalMonths/12n
  if(years>BigInt(Number.MAX_SAFE_INTEGER))return fail('overflow',v.mode)
  return {status:'calculated',current:{years:Number(years),months:Number(totalMonths%12n),days},calculatedOn:on,reason:null,accuracy:'estimate',mode:v.mode,accrues:true,creditedDays:null}
 }
 if(v.mode==='continuous')return fromAnchorDuration(v.startDate,serial(on)-serial(v.startDate),on,v.mode,'estimate')
 const anchor=v.periods[0].startDate
 let creditedDays=0
 for(const p of v.periods) {
  const through=p.endDate??on
  const days=serial(through)-serial(p.startDate)+1
  creditedDays+=days
  if(!Number.isSafeInteger(creditedDays))return fail('overflow',v.mode)
 }
 const result=fromAnchorDuration(anchor,creditedDays,on,v.mode,'estimate')
 return result.status==='calculated'?{...result,accrues:v.periods.some(p=>p.endDate===null),creditedDays}:result
}
export function allowanceForDuration(v:Duration) { let percentage=0; for(const threshold of allowanceThresholds)if(v.years>threshold.years||(v.years===threshold.years&&(v.months>0||v.days>0)))percentage=threshold.percentage; return {percentage,nextThreshold:allowanceThresholds.find(t=>v.years<t.years||(v.years===t.years&&v.months===0&&v.days===0))??null} }
export function serviceThresholdDate(v:ServiceAccountingInput,on:string,exceeds:(duration:Duration)=>boolean):string|null {
 if(!isIsoCalendarDate(on)||calculateService(v,on).status!=='calculated'||!calculateService(v,on).accrues)return null
 const reached=(day:number)=>{const r=calculateService(v,fromSerial(day));return r.current===null||exceeds(r.current)}
 let low=serial(on)+1,high=serial('9999-12-31'); if(low>high||!reached(high))return null
 while(low<high){const middle=Math.floor((low+high)/2);if(reached(middle))high=middle;else low=middle+1}
 const candidate=calculateService(v,fromSerial(low));return candidate.current&&exceeds(candidate.current)?fromSerial(low):null
}
export function projectService(v:ServiceAccountingInput|null,on:string,type:'official'|'staff',confirmedAllowance:Allowance|null):ServiceProjection {
 const calculation=calculateService(v,on),result:ServiceProjection={status:type==='staff'?'not_applicable':calculation.status,calculation,percentage:null,nextThreshold:null,reviewOn:null,reviewAccuracy:null,confirmedAllowance,comparison:type==='staff'?'not_applicable':'unavailable'}
 if(type==='staff'||!calculation.current)return result
 const forecast=allowanceForDuration(calculation.current);result.percentage=forecast.percentage;result.nextThreshold=forecast.nextThreshold
 if(calculation.status==='calculated') {
  result.comparison=!confirmedAllowance?'missing':confirmedAllowance.status==='not_applicable'?'not_applicable':confirmedAllowance.percentage===result.percentage?'matches':'different'
  if(forecast.nextThreshold&&v&&calculation.accrues) { result.reviewOn=serviceThresholdDate(v,on,duration=>allowanceForDuration(duration).percentage>forecast.percentage); if(result.reviewOn)result.reviewAccuracy='estimate' }
 }
 return result
}
