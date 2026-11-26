import { CircleCheck, CircleHelp, CircleMinus, ListChecks } from 'lucide-react'
import type { EmployeeLeaveRight, LeavePeriodAttentionItem, LeaveType } from '../../../shared/leave'
import { leaveTypes } from '../../../shared/leave'
import DictionaryTable from '../DictionaryTable'
import InfoSection from '../InfoSection'
import { leaveBalanceOverviewMetrics, leaveOverviewProposals } from './summary'
import type { LeaveOverviewData } from './LeaveOverview'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'

const rightIcons = { has_right: CircleCheck, no_right: CircleMinus, unknown: CircleHelp } satisfies
  Record<EmployeeLeaveRight['status'] | 'unknown', typeof CircleCheck>

const columns = [
  { label: 'Вид відпустки', width: '27%' },
  { label: 'Право', width: '18%' },
  { label: <>Підтверджено / норматив <small>к. дн.</small></>, width: '15%' },
  { label: <>Використано <small>к. дн.</small></>, width: '13%' },
  { label: 'Залишок / стан', width: '17%' },
  { label: 'Дія', width: '10%' },
]

function RightStatus({ status }: { status: EmployeeLeaveRight['status'] | 'unknown' }) {
  const Icon = rightIcons[status]
  return <span className={`leave-right-status is-${status}`}><Icon size={14} aria-hidden="true"/>{rightLabels[status]}</span>
}

function Metric({ value, kind, emphasis = false, detail }: { value: string; kind: string; emphasis?: boolean; detail?: string[] }) {
  return <div className={`leave-overview-metric is-${kind}${emphasis ? ' is-emphasis' : ''}`}>
    <strong>{value}</strong>{detail?.map(text => <small key={text}>{text}</small>)}
  </div>
}

export default function LeaveBalancesOverview({ data, throughDate, today, attentionItems, onOpen }: {
  data: LeaveOverviewData
  throughDate: string
  today: string
  attentionItems: LeavePeriodAttentionItem[]
  onOpen: (type: LeaveType) => void
}) {
  return <InfoSection className="leave-balances-overview" title="Доступність відпусток" icon={<ListChecks size={18} aria-hidden="true"/>}>
    <DictionaryTable label="Доступність відпусток" className="leave-balances-overview-table" columns={columns}>
      {leaveTypes.map(type => {
        const status = data.rights.find(right => right.leaveType === type)?.status ?? 'unknown'
        const proposals = leaveOverviewProposals(type, status, data.proposals, throughDate, today)
        const attention = attentionItems.find(item => item.leaveType === type)
        const metrics = leaveBalanceOverviewMetrics(type, status, data.balances, proposals, data.records,
          data.employeeId, today.slice(0, 4), today, attention)
        return <tr key={type}>
          <th scope="row"><span className="leave-summary-type"><LeaveTypeIcon type={type}/><span>{leaveWorkspaceLabels[type]}
            {metrics.note && <small className="leave-balance-row-note">{metrics.note}</small>}</span></span></th>
          <td><RightStatus status={status}/></td>
          <td><Metric {...metrics.confirmed}/></td>
          <td><Metric {...metrics.used}/></td>
          <td><Metric {...metrics.remaining}/></td>
          <td><button type="button" className="secondary-button leave-balance-detail-button"
            aria-label={`Деталі: ${leaveWorkspaceLabels[type]}`} onClick={() => onOpen(type)}>Деталі</button></td>
        </tr>
      })}
    </DictionaryTable>
  </InfoSection>
}
