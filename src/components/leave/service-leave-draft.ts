import type { OmsServiceLeaveProjection } from '../../../shared/service-leave-calculations'
import { accountingBasisForPeriod } from '../../../shared/leave-periods.ts'
import { parseDateInput } from '../../lib/dates.ts'
import type { Draft } from './draft'

export function serviceDraftIdentity(row:Draft):string {
 return 'period' in row?`${row.period.periodStart}/${row.period.periodEnd}`:`manual:${row.id}`
}
export function serviceLeaveSuggestion(row:Draft,projection:OmsServiceLeaveProjection|null,today:string):number|null {
 if(!projection||projection.status!=='calculated'||projection.calculation.status!=='calculated'||projection.calculation.calculatedOn!==today||projection.rightStatus!=='has_right'||projection.recommendedDays===null||row.days.trim())return null
 if('period' in row&&(row.period.status!=='proposed'||row.period.leaveType!=='oms_service_additional'))return null
 const start='period' in row?row.period.periodStart:parseDateInput(row.start)
 const end='period' in row?row.period.periodEnd:parseDateInput(row.end)
 const basis='period' in row?row.period.accountingBasis:start?accountingBasisForPeriod(start):null
 if(!start||!end||start>today||end<today||start>end||basis!=='confirmed_entitlement'||accountingBasisForPeriod(start)!=='confirmed_entitlement')return null
 if(projection.currentPeriods.some(p=>p.periodStart<=end&&p.periodEnd>=start))return null
 return projection.recommendedDays
}
/** Only the selected blank row changes; all persistence still belongs to buildChanges/saveBalanceDraft. */
export function applyServiceLeaveSuggestion(rows:Draft[],identity:string,projection:OmsServiceLeaveProjection|null,today:string):Draft[] {
 const index=rows.findIndex(row=>serviceDraftIdentity(row)===identity)
 if(index<0)return rows
 const days=serviceLeaveSuggestion(rows[index],projection,today)
 if(days===null)return rows
 return rows.map((row,i)=>i===index?{...row,days:String(days),suggestedFromProjection:true}:row)
}
