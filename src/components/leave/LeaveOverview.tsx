import { FileCheck2 } from 'lucide-react'
import type { EmployeeLeaveRight, LeaveRecord, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import { leaveTypes, isPeriodLeave, type PeriodLeaveType } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import DictionaryTable from '../DictionaryTable'
import { balanceSummary, formatLeaveDays } from './summary'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

export type LeaveOverviewData = {
  balances: PeriodBalance[]
  proposals: ProposedLeavePeriod[]
  records: LeaveRecord[]
  rights: EmployeeLeaveRight[]
}

const columns = [
  { label: 'Вид відпустки', width: '48%' },
  { label: 'Статус права', width: '25%' },
  { label: 'Залишок або облік', width: '27%' },
]

export default function LeaveOverview({ data, throughDate, error, loading, onRetry }: {
  data?: LeaveOverviewData
  throughDate: string
  error?: string
  loading: boolean
  onRetry: () => void
}) {
  if (error) return <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  if (loading || !data) return <DataState kind="loading" message="Завантаження відпусток…"/>
  const loadedData = data

  function balanceText(type: PeriodLeaveType, status: string) {
    const summary = balanceSummary(type, loadedData.balances,
      type === 'children_social_additional' ? [] : loadedData.proposals.filter(period => period.periodStart <= throughDate))
    if (!summary.count) return summary.incomplete ? 'Облік неповний; залишок не підтверджено' : 'Залишок не внесено'
    const label = status === 'no_right' ? 'Історичний залишок' : summary.incomplete ? 'Неповний облік' : 'Підтверджений залишок'
    return `${label}: ${formatLeaveDays(summary.remaining)}`
  }

  return <InfoSection className="leave-overview-summary" title="Зведення по відпустках" icon={<FileCheck2 size={18} aria-hidden="true"/>}>
    <DictionaryTable label="Зведення по відпустках" className="leave-summary-table" columns={columns}>
      {leaveTypes.map(type => {
        const status = loadedData.rights.find(right => right.leaveType === type)?.status ?? 'unknown'
        const accounting = isPeriodLeave(type)
          ? balanceText(type, status)
          : `Балансовий облік не застосовується · Зареєстровано відпусток: ${loadedData.records.filter(record => record.leaveType === type).length}`
        return <tr key={type}>
          <th scope="row"><span className="leave-summary-type"><LeaveTypeIcon type={type}/>{leaveWorkspaceLabels[type]}</span></th>
          <td><span className={'leave-right-status is-' + status}>{rightLabels[status as keyof typeof rightLabels]}</span></td>
          <td className="leave-summary-accounting">{accounting}</td>
        </tr>
      })}
    </DictionaryTable>
  </InfoSection>
}
