import { Baby, BadgeCheck, CalendarDays, Check, Clock3, FileCheck2, GraduationCap, History, Pencil, Ribbon, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { EmployeeLeaveRight, LeaveRecord, LeaveType, PeriodLeaveType, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import { isPeriodLeave } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import { ServiceDetailRow } from '../seniority-ranks/ServiceProjectionView'
import { balanceSummary, formatLeaveDays } from './summary'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export type LeaveOverviewData = {
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}

const mainTypes: PeriodLeaveType[] = ['annual_main', 'oms_service_additional']
const specialTypes: LeaveType[] = ['children_social_additional', 'study_leave', 'veteran_special_leave', 'chernobyl_special_leave']
const specialIcons: Record<LeaveType, LucideIcon> = {
  annual_main: CalendarDays, oms_service_additional: CalendarDays, children_social_additional: Baby,
  study_leave: GraduationCap, veteran_special_leave: ShieldCheck, chernobyl_special_leave: Ribbon,
}

export default function LeaveOverview({ data, throughDate, error, loading, onRetry, onOpenBalances, onEditRight, onOpenHistory }: {
  data?: LeaveOverviewData
  throughDate: string
  error?: string
  loading: boolean
  onRetry: () => void
  onOpenBalances: (type: PeriodLeaveType) => void
  onEditRight: (type: LeaveType) => void
  onOpenHistory: () => void
}) {
  if (error) return <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  if (loading || !data) return <DataState kind="loading" message="Завантаження відпусток…"/>

  const rightFor = (type: LeaveType) => data.rights.find(item => item.leaveType === type)
  const summaryFor = (type: PeriodLeaveType) => balanceSummary(type, data.balances,
    type === 'children_social_additional' ? [] : data.proposals.filter(period => period.periodStart <= throughDate))
  const editRight = (type: LeaveType) => <button type="button" className="secondary-button leave-right-edit-button"
    onClick={() => onEditRight(type)}><Pencil size={14} aria-hidden="true"/>Редагувати право</button>
  const rightValue = (type: LeaveType) => {
    const status = rightFor(type)?.status ?? 'unknown'
    return <div className="leave-overview-right-value">
      <span className={'leave-right-status is-' + status}>{rightLabels[status]}</span>
      {editRight(type)}
    </div>
  }
  const periodPanel = (type: PeriodLeaveType) => {
    const summary = summaryFor(type)
    const status = rightFor(type)?.status ?? 'unknown'
    const label = status === 'no_right' ? 'Історичний залишок' : summary.incomplete ? 'Доступно за внесеними періодами' : 'Підтверджений залишок'
    const metric = summary.count > 0 ? formatLeaveDays(summary.remaining) : 'Не внесено'
    return <InfoSection key={type} className="leave-overview-main-panel" title={leaveWorkspaceLabels[type]} icon={<LeaveTypeIcon type={type}/>}
      action={<button type="button" className="secondary-button section-header-edit-button" onClick={() => onOpenBalances(type)}><Clock3 size={15} aria-hidden="true"/>Облік днів</button>}>
      <div className="leave-confirmed-balance">
        <span>{label}</span>
        <strong>{metric}</strong>
      </div>
      <dl className="leave-overview-detail-list">
        <ServiceDetailRow icon={ShieldCheck} label="Право на відпустку" value={rightValue(type)}/>
        <ServiceDetailRow icon={BadgeCheck} label="Підтверджено днів" value={summary.count > 0 ? formatLeaveDays(summary.entered) : 'Не внесено'}/>
        <ServiceDetailRow icon={Check} label="Використано днів" value={summary.count > 0 ? formatLeaveDays(summary.accounted) : 'Не внесено'}/>
      </dl>
      {summary.incomplete && status !== 'no_right' && <Alert variant="warning">Облік охоплює лише внесені періоди; повний залишок не підтверджено.</Alert>}
    </InfoSection>
  }
  const specialRow = (type: LeaveType) => {
    const right = rightFor(type)
    const status = right?.status ?? 'unknown'
    let accounting: ReactNode
    let actions: ReactNode
    if (isPeriodLeave(type)) {
      const summary = summaryFor(type)
      accounting = <span><strong>{summary.count > 0 ? formatLeaveDays(summary.remaining) : 'Залишок не внесено'}</strong>
        <small>{summary.count > 0 ? (status === 'no_right' ? 'історичний залишок' : summary.incomplete ? 'неповний облік' : 'підтверджений залишок') : 'облікові періоди'}</small></span>
      actions = <div className="leave-overview-special-actions">{editRight(type)}
        <button type="button" className="secondary-button section-header-edit-button" onClick={() => onOpenBalances(type)}><Clock3 size={14} aria-hidden="true"/>Облік днів</button>
      </div>
    } else {
      const records = data.records.filter(record => record.leaveType === type)
      const active = records.filter(record => record.status === 'active').length
      accounting = <span><strong>{records.length ? `Зареєстровано відпусток: ${records.length}` : 'Відпусток ще не зареєстровано'}</strong>
        {records.length > 0 && <small>активних: {active}</small>}</span>
      actions = editRight(type)
    }
    return <ServiceDetailRow key={type} icon={specialIcons[type]} label={leaveWorkspaceLabels[type]} value={<>
        <span className="leave-overview-special-status"><span className={'leave-right-status is-' + status}>{rightLabels[status]}</span>{accounting}</span>
        {actions}
      </>}/>
  }

  const total = data.records.length
  return <section className="leave-layout leave-overview" aria-label="Огляд відпусток">
    <div className="leave-overview-main-grid">
      {mainTypes.map(periodPanel)}
    </div>
    <InfoSection className="leave-overview-special-panel" title="Відпустки за окремими підставами" icon={<FileCheck2 size={17} aria-hidden="true"/>}>
      <dl className="leave-overview-detail-list leave-overview-special-list">
        {specialTypes.map(specialRow)}
      </dl>
    </InfoSection>
    <InfoSection className="leave-history-summary" title="Історія відпусток" icon={<History size={17} aria-hidden="true"/>
    } action={<button type="button" className="secondary-button" onClick={onOpenHistory}><History size={15} aria-hidden="true"/>Переглянути історію</button>}>
      {total ? <p className="leave-history-summary-count">Зареєстровано відпусток: <strong>{total}</strong></p>
        : <DataState kind="empty" compact message="Відпусток ще не зареєстровано."/>}
    </InfoSection>
  </section>
}
