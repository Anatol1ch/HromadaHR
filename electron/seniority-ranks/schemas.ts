import { z } from 'zod'
import { employeeCard, calendarDate, id } from '../personnel/schemas.js'
import { allowancePercentages } from '../../shared/seniority-ranks.js'
export { id }
const basis = { documentType: z.string().trim().min(1).max(200).nullable(),
  documentNumber: z.string().trim().min(1).max(100).nullable(), documentDate: calendarDate.nullable(), reviewOn: calendarDate.nullable() }
export const allowanceInput = z.discriminatedUnion('status', [
  z.strictObject({ ...basis, status: z.literal('confirmed'), percentage: z.union(allowancePercentages.map(n => z.literal(n))), effectiveOn: calendarDate }),
  z.strictObject({ ...basis, status: z.literal('not_applicable'), percentage: z.null(), effectiveOn: z.null() }),
])
export const rankInput = z.strictObject({ ...basis, rank: z.number().int().min(1).max(15), assignedOn: calendarDate, effectiveOn: calendarDate.nullable() })
export const allowance = z.intersection(allowanceInput, z.object({ employeeId: id, confirmedAt: z.iso.datetime() }))
export const rank = rankInput.extend({ employeeId: id, confirmedAt: z.iso.datetime() })

export const overview = z.strictObject({ employee: employeeCard, allowance: allowance.nullable(), rank: rank.nullable() })

export const serviceBaselineInput = z.strictObject({
 years: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), months: z.number().int().min(0).max(11), days: z.number().int().min(0).max(30),
 autoAccrueAfterBaseline: z.boolean(), asOfDate: calendarDate, basisNote: z.string().trim().min(1).max(2000).nullable(),
})
export const serviceBaseline = serviceBaselineInput.extend({ employeeId: id, confirmedAt: z.iso.datetime() })

const duration = z.strictObject({years:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),months:z.number().int().min(0).max(11),days:z.number().int().min(0).max(30)})
const calculationStatus=z.enum(['calculated','baseline_only','missing_baseline','requires_review'])
export const serviceProjection=z.strictObject({
 status:z.enum(['calculated','baseline_only','missing_baseline','requires_review','not_applicable']),
 calculation:z.strictObject({status:calculationStatus,current:duration.nullable(),calculatedOn:calendarDate,reason:z.enum(['invalid_input','before_baseline','overflow','date_range']).nullable(),accuracy:z.enum(['confirmed','estimate','unavailable'])}),
 percentage:z.number().int().min(0).max(40).nullable(),nextThreshold:z.strictObject({years:z.number().int(),percentage:z.number().int()}).nullable(),
 reviewOn:calendarDate.nullable(),reviewAccuracy:z.literal('estimate').nullable(),confirmedAllowance:allowance.nullable(),comparison:z.enum(['matches','different','missing','not_applicable','unavailable']),
})
