import { daysInMonth, isIsoCalendarDate } from '../src/lib/dates.js'
import type { Allowance, ServiceBaselineInput } from './seniority-ranks.js'
export interface Duration { years: number; months: number; days: number }
export type CalculationStatus = 'calculated' | 'baseline_only' | 'missing_baseline' | 'requires_review'
export type CalculationReason = 'invalid_input' | 'before_baseline' | 'overflow' | 'date_range' | null
export interface ServiceCalculation {
 status: CalculationStatus; current: Duration | null; calculatedOn: string; reason: CalculationReason
 accuracy: 'confirmed' | 'estimate' | 'unavailable'
}
export interface ServiceProjection {
 status: CalculationStatus | 'not_applicable'; calculation: ServiceCalculation
 percentage: number | null; nextThreshold: { years: number; percentage: number } | null
 reviewOn: string | null; reviewAccuracy: 'estimate' | null
 confirmedAllowance: Allowance | null
 comparison: 'matches' | 'different' | 'missing' | 'not_applicable' | 'unavailable'
}
// КМУ №268, п.3 пп.4, https://zakon.rada.gov.ua/laws/show/268-2006-%D0%BF
// Current agreed scale only, strict “понад”; not a universal eligibility engine.
export const allowanceThresholds = [
 { years:3, percentage:10 }, { years:5, percentage:15 }, { years:10, percentage:20 },
 { years:15, percentage:25 }, { years:20, percentage:30 }, { years:25, percentage:40 },
] as const
const DAY = 86400000
function serial(iso: string) {
 const [y,m,d]=iso.split('-').map(Number), date=new Date(0)
 date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0)
 return date.valueOf()/DAY
}
function fromSerial(n:number) { return new Date(n*DAY).toISOString().slice(0,10) }
function boundary(anchor:string,months:number):string|null {
 const [y,m,d]=anchor.split('-').map(Number), index=y*12+m-1+months
 const year=Math.floor(index/12),month=index%12+1
 if(year<1||year>9999)return null
 return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(d,daysInMonth(year,month))).padStart(2,'0')}`
}
function valid(v: ServiceBaselineInput) {
 return Number.isSafeInteger(v.years)&&v.years>=0&&Number.isInteger(v.months)&&v.months>=0&&v.months<=11&&Number.isInteger(v.days)&&v.days>=0&&v.days<=30&&isIsoCalendarDate(v.asOfDate)&&typeof v.autoAccrueAfterBaseline==='boolean'
}
/** Forward credit convention, never reconstructs a historical employment date.
 * Month boundaries are original-anchor anniversaries, day clamped independently in each month.
 * Elapsed complete intervals add months; elapsed residual days add to baseline days.
 * Carry uses real lengths of successive anchor intervals, not 30-day months.
 * At the anchor return the confirmed components verbatim, even if its 30-day remainder
 * exceeds a following short interval. All later values/dates are estimates under this convention.
 */
export function calculateService(v:ServiceBaselineInput|null,on:string):ServiceCalculation {
 const fail=(reason:CalculationReason):ServiceCalculation=>({status:'requires_review',current:null,calculatedOn:on,reason,accuracy:'unavailable'})
 if(!isIsoCalendarDate(on))return fail('invalid_input')
 if(!v)return {status:'missing_baseline',current:null,calculatedOn:on,reason:null,accuracy:'unavailable'}
 if(!valid(v))return fail('invalid_input')
 if(on<v.asOfDate)return fail('before_baseline')
 const original={years:v.years,months:v.months,days:v.days}
 if(!v.autoAccrueAfterBaseline)return {status:'baseline_only',current:original,calculatedOn:on,reason:null,accuracy:'confirmed'}
 if(on===v.asOfDate)return {status:'calculated',current:original,calculatedOn:on,reason:null,accuracy:'confirmed'}
 const [y,m]=on.split('-').map(Number), [by,bm]=v.asOfDate.split('-').map(Number)
 let elapsed=(y-by)*12+m-bm
 const monthBoundary=boundary(v.asOfDate,elapsed)
 if(!monthBoundary)return fail('date_range')
 if(monthBoundary>on)elapsed--
 const start=boundary(v.asOfDate,elapsed)!
 let days=v.days+serial(on)-serial(start), carried=0
 while(true) {
  const a=boundary(v.asOfDate,elapsed+carried),b=boundary(v.asOfDate,elapsed+carried+1)
  if(!a||!b)return fail('date_range')
  const length=serial(b)-serial(a)
  if(days<length)break
  days-=length;carried++
 }
 const months=BigInt(v.years)*12n+BigInt(v.months+elapsed+carried),years=months/12n
 if(years>BigInt(Number.MAX_SAFE_INTEGER))return fail('overflow')
 return {status:'calculated',current:{years:Number(years),months:Number(months%12n),days},calculatedOn:on,reason:null,accuracy:'estimate'}
}
export function allowanceForDuration(v:Duration) {
 let percentage=0
 for(const threshold of allowanceThresholds)if(v.years>threshold.years||(v.years===threshold.years&&(v.months>0||v.days>0)))percentage=threshold.percentage
 return {percentage,nextThreshold:allowanceThresholds.find(t=>v.years<t.years||(v.years===t.years&&v.months===0&&v.days===0))??null}
}
export function projectService(v:ServiceBaselineInput|null,on:string,type:'official'|'staff',confirmedAllowance:Allowance|null):ServiceProjection {
 const calculation=calculateService(v,on)
 const result:ServiceProjection={status:type==='staff'?'not_applicable':calculation.status,calculation,percentage:null,nextThreshold:null,reviewOn:null,reviewAccuracy:null,confirmedAllowance,comparison:type==='staff'?'not_applicable':'unavailable'}
 if(type==='staff'||!calculation.current)return result
 const forecast=allowanceForDuration(calculation.current)
 result.percentage=forecast.percentage;result.nextThreshold=forecast.nextThreshold
 if(calculation.status==='calculated') {
  result.comparison=!confirmedAllowance?'missing':confirmedAllowance.status==='not_applicable'?'not_applicable':confirmedAllowance.percentage===result.percentage?'matches':'different'
  if(forecast.nextThreshold&&v) {
   // Earliest strictly exceeding day under the same convention, bounded binary search.
   const exceeds=(day:number)=>{const r=calculateService(v,fromSerial(day));return r.current===null||allowanceForDuration(r.current).percentage>forecast.percentage}
   let low=serial(on)+1,high=serial('9999-12-31')
   if(low<=high&&exceeds(high)) {
    while(low<high){const middle=Math.floor((low+high)/2);if(exceeds(middle))high=middle;else low=middle+1}
    const candidate=calculateService(v,fromSerial(low))
    if(candidate.current&&allowanceForDuration(candidate.current).percentage>forecast.percentage){result.reviewOn=fromSerial(low);result.reviewAccuracy='estimate'}
   }
  }
 }
 return result
}
