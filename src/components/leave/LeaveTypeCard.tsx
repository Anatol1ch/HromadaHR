import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LeaveType } from '../../../shared/leave'
import LeaveTypeIcon from './LeaveTypeIcon'
import { leaveLabels } from './presentation'
import { formatLeaveDays } from './summary'

export function LeaveBalanceMetric({ count, remaining, incomplete, historical }: {
  count: number; remaining: bigint; incomplete: boolean; historical: boolean
}) {
  if (!count) return <small>Не внесено</small>
  return <>
    <strong>{!historical && <span className="visually-hidden">Доступний залишок: </span>}{formatLeaveDays(remaining)}</strong>
    {historical && <small>Історичний залишок</small>}
    {incomplete && !historical && <small className="leave-type-card-note">Неповний облік</small>}
  </>
}

export default function LeaveTypeCard({ type, onOpen, right, metric }: {
  type: LeaveType; onOpen: () => void; right: ReactNode; metric?: ReactNode
}) {
  const label = leaveLabels[type]
  return <article className="info-item leave-type-card">
    <div className="leave-type-card-identity">
      <LeaveTypeIcon type={type}/>
      <div><h4>{label}</h4>{right}</div>
    </div>
    {metric && <div className="leave-type-card-metric">{metric}</div>}
    <ArrowRight className="leave-type-card-arrow" size={16} aria-hidden="true"/>
    <button type="button" className="leave-type-card-trigger" aria-label={'Детальніше: ' + label} onClick={onOpen}/>
  </article>
}
