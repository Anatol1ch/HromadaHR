import { formatDate } from '../../lib/dates'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import Select from '../Select'
import LeaveStatus from './LeaveStatus'
import LeaveTypeIcon from './LeaveTypeIcon'
import { leaveLabels } from './presentation'
import { annualUsage } from './usage'
import { formatLeaveDays } from './summary'
import type { LeaveType } from '../../../shared/leave'
import type { ReactNode } from 'react'
import type { RegistrationHistory } from './registry'

export type AccountingHistory = Pick<RegistrationHistory, 'records' | 'loading' | 'error' | 'retry'>
export type AccountingYear = { year: string; years: string[]; onYear: (year: string) => void }
export const annualScope = 'Річні показники охоплюють реєстрації в HromadaHR за роком початку відпустки.'

export function AccountingYearPicker({ year, years, onYear }: AccountingYear) {
  return <div className="leave-accounting-year"><span>Календарний рік</span>
    <Select label="Календарний рік" value={year} options={years.map(value => ({ value, label: value }))}
      onChange={onYear} advanceOnSelect={false}/>
  </div>
}

export function AccountingHistoryState({ history }: { history: AccountingHistory }) {
  if (history.loading) return <DataState kind="loading" compact message="Завантаження надань…"/>
  if (history.error) return <Alert variant="error" action={<button type="button" onClick={history.retry}>Повторити</button>}>{history.error}</Alert>
  return null
}

export default function LeaveEventAccounting({ type, employeeId, calendar, history, right, noRight, showLimit, actions }: {
  type: LeaveType; employeeId: string; calendar: AccountingYear; history: AccountingHistory
  right: ReactNode; noRight: boolean; showLimit: boolean; actions: ReactNode
}) {
  const usage = !history.loading && !history.error ? annualUsage(history.records, employeeId, type, calendar.year) : undefined
  const recent = usage && [...usage.history].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id)).slice(0, 5)
  return <InfoSection title={leaveLabels[type]} icon={<LeaveTypeIcon type={type}/>} action={<AccountingYearPicker {...calendar}/>}>
    <div>{right}</div>
    <p className="leave-muted leave-accounting-note">{annualScope}</p>
    <AccountingHistoryState history={history}/>
    {usage && !(noRight && !recent?.length) && <dl className="info-grid">
      <InfoItem label="Активні надання" value={usage.activeCount}/>
      <InfoItem label="Зареєстровано днів" value={formatLeaveDays(usage.days)} emphasis/>
      <InfoItem label="Скасовані реєстрації" value={usage.cancelledCount}/>
      {showLimit && usage.limit !== null && <InfoItem label="Облікова межа тривалості" value={formatLeaveDays(usage.limit)}/>}
    </dl>}
    {recent?.length ? <div className="info-item">
      <h4 className="leave-accounting-note">Останні надання за рік</h4>
      <ul className="leave-accounting-history">{recent.map(record => <li key={record.id}>
        <span>{formatDate(record.startDate)}–{formatDate(record.endDate)}</span>
        <span>{formatLeaveDays(record.usedDays)}</span><LeaveStatus status={record.status}/>
      </li>)}</ul>
    </div> : usage && !noRight && <DataState kind="empty" compact message="За обраний рік реєстрацій немає."/>}
    {actions}
  </InfoSection>
}
