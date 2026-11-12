import { z } from 'zod'
import { warningHorizons } from '../../shared/personnel-control.js'
import { calendarDate,id } from '../personnel/schemas.js'
export const settings=z.strictObject({horizonDays:z.union(warningHorizons.map(n=>z.literal(n)))})
const identity={id:z.string().min(1).max(180),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}
export const stateInput=z.union([
 z.strictObject({...identity,state:z.enum(['active','reviewed'])}),
 z.strictObject({...identity,state:z.literal('snoozed'),days:z.union([z.literal(1),z.literal(7),z.literal(30)])}),
])
export const issue=z.strictObject({...identity,employeeId:id,employeeName:z.string(),direction:z.enum(['allowance','rank','service_leave']),category:z.enum(['upcoming','due','review_needed','data_incomplete']),
 title:z.string(),explanation:z.string(),date:calendarDate.nullable(),tab:z.enum(['general','leave','service','rank']),
 dates:z.array(z.strictObject({source:z.enum(['manual','projection']),date:calendarDate})),state:z.enum(['active','reviewed','snoozed']),snoozedUntil:calendarDate.nullable(),
})
export const overview=z.strictObject({calculatedOn:calendarDate,settings,issues:z.array(issue),activeCount:z.number().int().nonnegative()})
