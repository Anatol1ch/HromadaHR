import { CalendarDays, Files } from 'lucide-react'
import type { EmployeeLeaveRight, LeaveRecord, LeaveType, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import LeaveTypeCard, { LeaveBalanceMetric } from './LeaveTypeCard'
import { isPeriodLeave } from '../../../shared/leave'
import { balanceSummary } from './summary'
import { leaveOptions, leaveWorkspaceLabels, rightLabels } from './presentation'

export type LeaveOverviewData = {
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}

export default function LeaveOverview({ data, throughDate, error, loading, onRetry, onOpen }: {
  data?: LeaveOverviewData
  throughDate: string
  error?: string
  loading: boolean
  onRetry: () => void
  onOpen: (type: LeaveType, data: LeaveOverviewData) => void
}) {
  if (error) return <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  if (loading || !data) return <DataState kind="loading" message="Завантаження відпусток…"/>

  const rightFor = (type: LeaveType) => data.rights.find(item => item.leaveType === type)
  const card = (type: LeaveType) => {
    const right = rightFor(type)
    const status = right?.status ?? 'unknown'
    const metric = isPeriodLeave(type)
      ? <LeaveBalanceMetric {...balanceSummary(type, data.balances, data.proposals.filter(p => p.periodStart <= throughDate))} historical={status === 'no_right'}/>
      : <small>{data.records.some(record => record.leaveType === type && record.status === 'active')
          ? `Зареєстровано надань: ${data.records.filter(record => record.leaveType === type && record.status === 'active').length}`
          : 'Надань ще не зареєстровано'}</small>
    return <LeaveTypeCard key={type} type={type} label={leaveWorkspaceLabels[type]}
      right={<span className={'leave-right-status is-' + status}>{rightLabels[status]}</span>}
      metric={metric} onOpen={() => onOpen(type, data)}/>
  }

  return <section className="leave-layout leave-overview" aria-label="Огляд відпусток">
    <InfoSection title="Основні відпустки" icon={<CalendarDays size={17} aria-hidden="true"/>}>
      <div className="info-grid info-grid-two leave-accounting-grid">
        {leaveOptions.filter(option => option.value === 'annual_main' || option.value === 'oms_service_additional').map(option => card(option.value))}
      </div>
    </InfoSection>
    <InfoSection title="Відпустки за окремими підставами" icon={<Files size={17} aria-hidden="true"/>}>
      <div className="info-grid info-grid-two leave-accounting-grid leave-special-card-grid">
        {leaveOptions.filter(option => option.value !== 'annual_main' && option.value !== 'oms_service_additional').map(option => card(option.value))}
      </div>
    </InfoSection>
  </section>
}
