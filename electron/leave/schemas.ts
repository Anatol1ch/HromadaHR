import { z } from 'zod'
import { leaveTypes } from '../../shared/leave.js'
import { isCalendarDate } from './periods.js'

export const id = z.string().uuid()
export const leaveType = z.enum(leaveTypes)
export const calendarDate = z.string().refine(isCalendarDate)
export const periodInput = z.strictObject({
  leaveType,
  periodStart: calendarDate,
  periodEnd: calendarDate,
  accountingBasis: z.enum(['initial_balance', 'confirmed_entitlement']),
  confirmedDays: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  referenceEntitlementDays: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
})
export const periodsInput = z.array(periodInput).min(1).max(200)
export const confirmedPeriod = periodInput.extend({ id, employeeId: id, status: z.literal('confirmed') })
export const proposedPeriod = z.strictObject({ leaveType, periodStart: calendarDate, periodEnd: calendarDate,
  accountingBasis: z.enum(['initial_balance', 'confirmed_entitlement']), status: z.literal('proposed') })
