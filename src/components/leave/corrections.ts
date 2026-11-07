import type { LeaveRecord, LeaveUpdate } from '../../../shared/leave'

export function matchesUpdate(record: LeaveRecord, update: LeaveUpdate) {
  const sorted = (items: LeaveUpdate['allocations']) => JSON.stringify([...items].sort((a,b) => a.periodId.localeCompare(b.periodId)))
  return record.id === update.id && record.status === 'active' && record.revision === update.expectedRevision + 1 &&
    record.leaveType === update.leaveType && record.startDate === update.startDate && record.endDate === update.endDate &&
    record.usedDays === update.usedDays && record.orderNumber === update.orderNumber && record.orderDate === update.orderDate &&
    record.durationExplanation === update.durationExplanation && sorted(record.allocations) === sorted(update.allocations)
}
