import { CircleCheck, CircleHelp, CircleMinus, FileCheck2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { EmployeeLeaveRight, LeaveRecord, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import { leaveTypes } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import DictionaryTable from '../DictionaryTable'
import { formatLeaveCount, formatLeaveDays, leaveOverviewAccounting } from './summary'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export type LeaveOverviewData = {
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}

const columns = [
  { label: 'Вид відпустки', width: '35%' },
  { label: 'Право', width: '17%' },
  { label: 'Внесено', width: '14%' },
  { label: 'Використано', width: '18%' },
  { label: 'Залишок', width: '16%' },
]

const rightIcons = {
  has_right: CircleCheck,
  no_right: CircleMinus,
  unknown: CircleHelp,
} satisfies Record<EmployeeLeaveRight['status'] | 'unknown', typeof CircleCheck>

function DayMetric({ value, emphasis = false, detail }: { value: string; emphasis?: boolean; detail?: ReactNode }) {
  return <div className={`leave-overview-metric${emphasis ? ' is-emphasis' : ''}`}>
    <strong>{value}</strong>{detail && <div className="leave-overview-metric-details">{detail}</div>}
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
        const historicalBalance = accounting.kind === 'period' && status === 'no_right' && accounting.summary.count > 0 && accounting.summary.remaining > 0n

        return <Fragment key={type}>
          <tr>
            <th scope="row"><span className="leave-summary-type"><LeaveTypeIcon type={type}/><span>{leaveWorkspaceLabels[type]}</span></span></th>
            <td><LeaveRightStatus status={status}/></td>
            {accounting.kind === 'period' ? accounting.summary.count > 0 ? <>
              <td><DayMetric value={formatLeaveDays(accounting.summary.entered)}/></td>
              <td><DayMetric value={formatLeaveDays(accounting.summary.accounted)}/></td>
              <td><DayMetric value={formatLeaveDays(accounting.summary.remaining)} emphasis detail={historicalBalance ? <small>Історичний залишок збережено</small> : undefined}/></td>
            </> : <td colSpan={3} className="leave-overview-no-periods">
              <div className="leave-overview-no-periods-content">
                <strong>{accounting.summary.incomplete ? 'Не всі періоди заповнено' : 'Дні не внесено'}</strong>
                {accounting.summary.incomplete && <small>Підтверджених днів за внесеними періодами поки немає.</small>}
              </div>
            </td> : <>
              <td><span className="leave-overview-not-applicable">—</span></td>
              <td>{accounting.registeredCount > 0
                ? <DayMetric value={formatLeaveDays(accounting.usedDays)} detail={<small>{formatLeaveCount(accounting.registeredCount)} · за весь час</small>}/>
                : <span className="leave-overview-event-empty">Відпусток не зареєстровано</span>}</td>
              <td><span className="leave-overview-not-applicable">—</span></td>
            </>}
          </tr>
          {accounting.kind === 'period' && accounting.summary.incomplete && accounting.summary.count > 0 && <tr className="leave-overview-explanation-row">
            <td colSpan={5}>Показано дані за внесеними періодами; не всі періоди заповнено.</td>
          </tr>}
        </Fragment>
      })}
    </DictionaryTable>
    <p className="leave-overview-footnote">Для навчальної та інших подієвих відпусток накопичуваний залишок не ведеться; тире в колонках «Внесено» й «Залишок» означає, що ці показники не застосовуються.</p>
  </InfoSection>
}
