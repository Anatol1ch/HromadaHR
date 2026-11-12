import { calculateService, serviceThresholdDate, type Duration, type ServiceCalculation } from './service-calculations.js'
import type { ServiceBaselineInput } from './seniority-ranks.js'
import type { ConfirmedLeavePeriod } from './leave.js'
import { isIsoCalendarDate } from '../src/lib/dates.js'

// Закон №2493-III ст.21; КМУ №250 від 27.04.1994, п.1. Strict “понад”, no pro-rata accrual.
export const serviceLeaveThresholds = [
 {years:10,days:5},{years:11,days:7},{years:12,days:9},
 {years:13,days:11},{years:14,days:13},{years:15,days:15},
] as const
const above=(v:Duration,years:number)=>v.years>years||(v.years===years&&(v.months>0||v.days>0))
export function serviceLeaveDays(v:Duration):number {
 let days=0
 for(const t of serviceLeaveThresholds)if(above(v,t.years))days=t.days
 return days
}
export function nextServiceLeaveThreshold(v:Duration) {
 return serviceLeaveThresholds.find(t=>!above(v,t.years))??null
}
export interface OmsServiceLeaveFacts {
 acquiredOn:string|null
 rightStatus:'unknown'|'has_right'|'no_right'
 periods:ConfirmedLeavePeriod[]
}
export interface OmsServiceLeaveProjection {
 status:ServiceCalculation['status']|'not_applicable'
 calculation:ServiceCalculation
 recommendedDays:number|null
 nextThreshold:{years:number;days:number}|null
 reviewOn:string|null
 reviewAccuracy:'estimate'|null
 acquiredOn:string|null
 rightStatus:OmsServiceLeaveFacts['rightStatus']
 currentPeriods:(ConfirmedLeavePeriod&{comparison:'matches'|'different'|'not_comparable'})[]
 historicalBalancePresent:boolean
}
/** Recommendation only. Initial balances/available days are never compared with normative duration. */
export function projectOmsServiceLeave(baseline:ServiceBaselineInput|null,on:string,type:'official'|'staff',facts:OmsServiceLeaveFacts):OmsServiceLeaveProjection {
 const calculation=calculateService(baseline,on)
 const result:OmsServiceLeaveProjection={status:type==='staff'?'not_applicable':calculation.status,calculation,
  recommendedDays:null,nextThreshold:null,reviewOn:null,reviewAccuracy:null,acquiredOn:facts.acquiredOn,rightStatus:facts.rightStatus,
  currentPeriods:[],historicalBalancePresent:facts.periods.some(p=>p.leaveType==='oms_service_additional'&&p.accountingBasis==='initial_balance')}
 if(type==='staff')return result
 if(type!=='official'||(facts.acquiredOn!==null&&!isIsoCalendarDate(facts.acquiredOn))) {
  result.status='requires_review';return result
 }
 if(calculation.current) {
  result.recommendedDays=serviceLeaveDays(calculation.current)
  result.nextThreshold=nextServiceLeaveThreshold(calculation.current)
  if(calculation.status==='calculated'&&baseline&&result.nextThreshold) {
   const years=result.nextThreshold.years
   result.reviewOn=serviceThresholdDate(baseline,on,duration=>above(duration,years))
   if(result.reviewOn)result.reviewAccuracy='estimate'
  }
 }
 result.currentPeriods=facts.periods.filter(p=>p.leaveType==='oms_service_additional'&&p.periodStart<=on&&p.periodEnd>=on).map(p=>({...p,
  comparison:calculation.status!=='calculated'||p.accountingBasis==='initial_balance'||result.recommendedDays===null?'not_comparable':p.confirmedDays===result.recommendedDays?'matches':'different'}))
 return result
}
