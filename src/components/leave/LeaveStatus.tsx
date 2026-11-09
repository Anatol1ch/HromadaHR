import type { LeaveRecord } from '../../../shared/leave'

export default function LeaveStatus({ status }: { status: LeaveRecord['status'] }) {
  return <span className={`leave-record-status is-${status}`}>
    {status === 'active' ? 'Зареєстровано' : 'Скасовано'}
  </span>
}
