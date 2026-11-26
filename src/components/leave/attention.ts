import type { LeavePeriodAttentionItem, PeriodLeaveType } from '../../../shared/leave'

export type LeaveAttentionTarget = { type: PeriodLeaveType; periodStart: string | null; reviewRight: boolean }

/** Maps a derived attention item to the focused manager context; it does not create or persist accounting data. */
export function leavePeriodAttentionTarget(item: LeavePeriodAttentionItem): LeaveAttentionTarget {
  return {
    type: item.leaveType,
    periodStart: item.reviewReason === 'right' ? null : item.periodStart,
    reviewRight: item.kind === 'review_data' && item.reviewReason === 'right',
  }
}
