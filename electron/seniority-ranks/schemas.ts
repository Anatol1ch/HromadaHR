import { z } from 'zod'
import { employeeCard, calendarDate, id } from '../personnel/schemas.js'
import { allowancePercentages, rankOrigins, storedRankOrigins } from '../../shared/seniority-ranks.js'
export { id, calendarDate }
const basis = { documentType: z.string().trim().min(1).max(200).nullable(),
  documentNumber: z.string().trim().min(1).max(100).nullable(), documentDate: calendarDate.nullable() }
export const allowanceInput = z.discriminatedUnion('status', [
  z.strictObject({ ...basis, status: z.literal('confirmed'), percentage: z.union(allowancePercentages.map(n => z.literal(n))), effectiveOn: calendarDate }),
  z.strictObject({ ...basis, status: z.literal('not_applicable'), percentage: z.null(), effectiveOn: z.null() }),
])
export const rankInput = z.strictObject({ ...basis, origin:z.enum(rankOrigins), reviewAnchorOn:calendarDate.nullable(), rank: z.number().int().min(1).max(15), assignedOn: calendarDate })
export const allowance = z.intersection(allowanceInput, z.object({ employeeId: id, confirmedAt: z.iso.datetime() }))
export const rank = z.strictObject({ ...basis, origin:z.enum(storedRankOrigins), reviewAnchorOn:calendarDate.nullable(), rank:z.number().int().min(1).max(15), assignedOn:calendarDate, employeeId:id, confirmedAt:z.iso.datetime() })

export const overview = z.strictObject({ employee: employeeCard, allowance: allowance.nullable(), rank: rank.nullable() })

export const servicePeriod = z.strictObject({id:z.uuid(),startDate:calendarDate,endDate:calendarDate.nullable()})
export const serviceAccountingInput = z.discriminatedUnion('mode',[
 z.strictObject({mode:z.literal('continuous'),startDate:calendarDate}),
 z.strictObject({mode:z.literal('periods'),periods:z.array(servicePeriod).min(1).max(500)}),
 z.strictObject({mode:z.literal('snapshot'),years:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),months:z.number().int().min(0).max(11),days:z.number().int().min(0).max(30),asOfDate:calendarDate}),
])
export const serviceAccounting=serviceAccountingInput.and(z.object({employeeId:id,confirmedAt:z.iso.datetime()}))

const duration = z.strictObject({years:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),months:z.number().int().min(0).max(11),days:z.number().int().min(0).max(30)})
const calculationStatus=z.enum(['calculated','missing_service_data','requires_review'])
export const serviceProjection=z.strictObject({
 status:z.enum(['calculated','missing_service_data','requires_review','not_applicable']),
 calculation:z.strictObject({status:calculationStatus,current:duration.nullable(),calculatedOn:calendarDate,reason:z.enum(['invalid_input','before_baseline','overlap','multiple_open_periods','period_order','overflow','date_range']).nullable(),accuracy:z.enum(['confirmed','estimate','unavailable']),mode:z.enum(['continuous','periods','snapshot']).nullable(),accrues:z.boolean(),creditedDays:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable()}),
 percentage:z.number().int().min(0).max(40).nullable(),nextThreshold:z.strictObject({years:z.number().int(),percentage:z.number().int()}).nullable(),
 reviewOn:calendarDate.nullable(),reviewAccuracy:z.literal('estimate').nullable(),confirmedAllowance:allowance.nullable(),comparison:z.enum(['matches','different','missing','not_applicable','unavailable']),
})

export const rankProjection=z.strictObject({
 status:z.enum(['projected','category_limit_reached','retained_higher_rank','requires_review','missing_data','not_applicable']),
 reason:z.enum(['not_applicable','missing_rank','missing_category','missing_appointment','invalid_data','category_limit','higher_rank','lower_rank','unknown_origin','legacy_origin','early_assignment','early_out_of_range','pension_exception','missing_anchor','future_anchor','date_range','ordinary','explicit_anchor']),
 explanation:z.string(),calculatedOn:calendarDate,category:z.enum(['I','II','III','IV','V','VI','VII']).nullable(),positionStartedOn:calendarDate.nullable(),rank:rank.nullable(),usualRanks:z.array(z.number().int().min(1).max(15)),nextRank:z.number().int().min(1).max(15).nullable(),anchorOn:calendarDate.nullable(),reviewOn:calendarDate.nullable(),accuracy:z.literal('estimate').nullable(),timing:z.enum(['past','today','future']).nullable(),
})
