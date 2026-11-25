import { CircleCheck, CircleHelp, CircleMinus, FileCheck2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EmployeeLeaveRight, LeaveRecord, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import { leaveTypes } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import DictionaryTable from '../DictionaryTable'
import { leaveOverviewAccounting, leaveOverviewCompactNoRight, leaveOverviewMetrics, type LeaveOverviewMetric } from './summary'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export type LeaveOverviewData = {
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}

const columns = [
  { label: 'Вид відпустки', width: '33%' },
  { label: 'Право', width: '22%' },
  { label: <>Облік днів <small>Внесено / Використано, к. дн.</small></>, width: '27%' },
  { label: <>Залишок <small>к. дн.</small></>, width: '18%' },
]

const rightIcons = {
  has_right: CircleCheck,
  no_right: CircleMinus,
  unknown: CircleHelp,
} satisfies Record<EmployeeLeaveRight['status'] | 'unknown', typeof CircleCheck>

function DayMetric({ value, kind, emphasis = false, detail }: { value: string; kind: LeaveOverviewMetric['kind']; emphasis?: boolean; detail?: ReactNode }) {
  return <div className={`leave-overview-metric is-${kind}${emphasis ? ' is-emphasis' : ''}`}>
    <strong aria-label={kind === 'not-applicable' ? 'Не застосовується' : undefined}>{value}</strong>{detail && <div className="leave-overview-metric-details">{detail}</div>}
  </div>
}

function LeaveRightStatus({ status }: { status: EmployeeLeaveRight['status'] | 'unknown' }) {
  const Icon = rightIcons[status]
  return <span className={`leave-right-status is-${status}`}><Icon size={14} aria-hidden="true"/>{rightLabels[status]}</span>
}

export default function LeaveOverview({ data, throughDate, error, loading, onRetry }: {
  data?: LeaveOverviewData
  throughDate: string
  error?: string
  loading: boolean
  onRetry: () => void
}) {
  if (error) return <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  if (loading || !data) return <DataState kind="loading" message="Завантаження відпусток…"/>

  return <InfoSection className="leave-overview-summary" title="Зведення по відпустках" icon={<FileCheck2 size={18} aria-hidden="true"/>}>
    <DictionaryTable label="Зведення по відпустках" className="leave-summary-table" columns={columns}>
      {leaveTypes.map(type => {
        const status = data.rights.find(right => right.leaveType === type)?.status ?? 'unknown'
        const proposals = type === 'children_social_additional' ? [] : data.proposals.filter(period => period.leaveType === type && period.periodStart <= throughDate)
        const accounting = leaveOverviewAccounting(type, data.balances, proposals, data.records)
        const compactNoRight = leaveOverviewCompactNoRight(status, accounting)
        const metrics = leaveOverviewMetrics(accounting)
        return <tr key={type}>
          <th scope="row"><span className="leave-summary-type"><LeaveTypeIcon type={type}/><span>{leaveWorkspaceLabels[type]}</span></span></th>
          <td><LeaveRightStatus status={status}/></td>
          <td><DayMetric value={compactNoRight ? '—' : metrics[0]!.value} kind={compactNoRight ? 'unknown' : metrics[0]!.kind} detail={!compactNoRight ? metrics[0]!.detail?.map(detail => <small key={detail}>{detail}</small>) : undefined}/></td>
          <td><DayMetric value={compactNoRight ? '—' : metrics[1]!.value} kind={compactNoRight ? 'unknown' : metrics[1]!.kind} emphasis={!compactNoRight && metrics[1]!.emphasis} detail={!compactNoRight ? metrics[1]!.detail?.map(detail => <small key={detail}>{detail}</small>) : undefined}/></td>
        </tr>
      })}
    </DictionaryTable>
  </InfoSection>
}
