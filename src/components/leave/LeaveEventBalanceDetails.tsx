import { History } from 'lucide-react'
import type { LeaveRecord, LeaveType } from '../../../shared/leave'
import Alert from '../Alert'
import DictionaryTable from '../DictionaryTable'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import { formatDate } from '../../lib/dates'
import { leaveWorkspaceLabels, rightLabels } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'
import { formatLeaveDayCount, specialLeaveAnnualAvailability } from './summary'
import { annualUsage } from './usage'
import type { LeaveJournalContext } from './registry'

type EventLeaveType = Extract<LeaveType, 'study_leave' | 'veteran_special_leave' | 'chernobyl_special_leave'>

export default function LeaveEventBalanceDetails({ type, employeeId, rightStatus, records, year, error, onBack, onOpenHistory }: {
  type: EventLeaveType
  employeeId: string
  rightStatus: 'has_right' | 'no_right' | 'unknown'
  records: LeaveRecord[]
  year: string
  error?: string
  onBack: () => void
  onOpenHistory: (context: LeaveJournalContext) => void
}) {
  const usage = annualUsage(records, employeeId, type, year)
  const yearRecords = usage.history.slice().sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))
  const special = type === 'veteran_special_leave' || type === 'chernobyl_special_leave'
  const availability = special ? specialLeaveAnnualAvailability(type, rightStatus, records, employeeId, year) : null
  const priorUse = special ? records.filter(record => record.employeeId === employeeId && record.leaveType === type &&
    record.status === 'active' && record.startDate.slice(0, 4) < year).reduce((sum, record) => sum + BigInt(record.usedDays), 0n) : 0n
  const access = type === 'study_leave' ? rightLabels[rightStatus]
    : availability?.kind === 'available' ? `Доступно ${availability.limit} к. дн.`
      : availability?.kind === 'used' ? 'Використано'
        : availability?.kind === 'review' ? 'Потребує перевірки'
          : availability?.kind === 'no_right' ? 'Права немає' : 'Право не перевірено'
  const columns = [{ label: 'Період', width: '32%' }, { label: 'Використано, к. дн.', width: '18%' },
    { label: 'Підстава / розпорядження', width: '34%' }, { label: 'Статус', width: '16%' }]

  return <InfoSection className="leave-event-balance-details" title={leaveWorkspaceLabels[type]} icon={<LeaveTypeIcon type={type}/>} action={
    <button type="button" className="secondary-button" onClick={onBack}>До всіх видів</button>
  }>
    {error ? <Alert variant="error">{error}</Alert> : <>
      <dl className="info-grid info-grid-three leave-event-balance-metrics">
        <InfoItem label={special ? `Доступність за ${year} рік` : rightLabels[rightStatus]} value={access} emphasis={availability?.kind === 'available'}/>
        <InfoItem label={`Використано за ${year} рік`} value={formatLeaveDayCount(usage.days) + ' к. дн.'}/>
        <InfoItem label={special ? 'Використано до поточного року' : 'Облік залишку'}
          value={special ? formatLeaveDayCount(priorUse) + ' к. дн.' : 'Не накопичується'}/>
      </dl>
      {type === 'chernobyl_special_leave' && <p className="leave-muted">Запис віднесено до року початку відпустки.</p>}
      <div className="leave-event-balance-history-heading">
        <h4>Зареєстровані відпустки за {year} рік</h4>
        <button type="button" className="secondary-button" onClick={() => onOpenHistory({ employeeId, type, year })}>
          <History size={16} aria-hidden="true"/>Відкрити історію
        </button>
      </div>
      <DictionaryTable label={`Зареєстровані відпустки за ${year} рік`} className="leave-event-balance-table" columns={columns}
        empty={`За ${year} рік відпусток не зареєстровано.`}>
        {yearRecords.map(record => <tr key={record.id} className={record.status === 'cancelled' ? 'leave-cancelled-row' : undefined}>
          <td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td>
          <td className="leave-days-column">{record.usedDays}</td>
          <td>{[record.grantBasis, record.orderNumber && `Розпорядження ${record.orderNumber}`].filter(Boolean).join(' · ') || 'Не зазначено'}</td>
          <td>{record.status === 'active' ? 'Зареєстровано' : 'Скасовано'}</td>
        </tr>)}
      </DictionaryTable>
    </>}
  </InfoSection>
}
