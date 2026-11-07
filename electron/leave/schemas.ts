import { z } from 'zod'
import { leaveTypes, periodLeaveTypes } from '../../shared/leave.js'
import { isCalendarDate } from './periods.js'

export const id = z.string().uuid()
export const periodLeaveType = z.enum(periodLeaveTypes)
export const leaveType = z.enum(leaveTypes)
export const calendarDate = z.string().refine(isCalendarDate)
export const periodInput = z.strictObject({
  leaveType: periodLeaveType,
  periodStart: calendarDate,
  periodEnd: calendarDate,
  accountingBasis: z.enum(['initial_balance', 'confirmed_entitlement']),
  confirmedDays: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  referenceEntitlementDays: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
})
export const periodsInput = z.array(periodInput).min(1).max(200)
export const confirmedPeriod = periodInput.extend({ id, employeeId: id, status: z.literal('confirmed') })
export const proposedPeriod = z.strictObject({ leaveType: periodLeaveType, periodStart: calendarDate, periodEnd: calendarDate,
  accountingBasis: z.enum(['initial_balance', 'confirmed_entitlement']), status: z.literal('proposed') })
export const allocation = z.strictObject({ periodId: id, days: z.number().int().positive().max(3652059) })
export const registration = z.strictObject({
  requestId: id, employeeId: id, leaveType, startDate: calendarDate, endDate: calendarDate,
  usedDays: z.number().int().positive().max(3652059),
  orderNumber: z.string().trim().min(1).max(100).nullable(),
  orderDate: calendarDate.nullable(),
  durationExplanation: z.string().trim().min(1).max(1000).nullable(),
  allocations: z.array(allocation).max(200),
  grantBasis: z.string().trim().min(1).max(1000).nullable().optional().default(null),
})
export const record = registration.omit({ requestId: true }).extend({
  grantBasis: z.string().min(1).max(1000).nullable(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), cancelledAt: z.iso.datetime().nullable(),
  cancelReason: z.string().min(1).max(1000).nullable(), allocationWarning: z.boolean(),
  id, status: z.enum(['active', 'cancelled']), createdAt: z.iso.datetime(),
})
export const balance = confirmedPeriod.extend({
  usedDays: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  availableDays: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})
export const allocationProposal = z.strictObject({
  balances: z.array(balance), allocations: z.array(allocation), shortfall: z.number().int().nonnegative(),
})

export const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const cancelReason = z.string().trim().min(1).max(1000)
export const leaveUpdate = registration.omit({ requestId: true, employeeId: true }).extend({ id, expectedRevision: revision })
