import { useState, type ReactNode } from 'react'
import { History } from 'lucide-react'
import type { LeaveRecord, LeaveType } from '../../../shared/leave'
import { todayIsoDate, formatDate } from '../../lib/dates'
import Select from '../Select'
import DictionaryTable from '../DictionaryTable'
import HelpTip from './HelpTip'
import DataState from '../DataState'
import Alert from '../Alert'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import LeaveTypeIcon from './LeaveTypeIcon'
import LeaveStatus from './LeaveStatus'
import { leaveLabels } from './presentation'
import { annualUsage } from './usage'
import { cutoff } from './draft'
import { formatLeaveDays } from './summary'

export default function EventUsage({ records, employeeId, type, rightBadge, rightNotice }: {
  records: LeaveRecord[]; employeeId: string; type: LeaveType; rightBadge?: ReactNode; rightNotice?: ReactNode
}) {
  const currentYear = todayIsoDate().slice(0, 4)
  const firstYear = cutoff.slice(0, 4)
  const defaultYear = currentYear < firstYear ? firstYear : currentYear
  const [year, setYear] = useState(defaultYear)
  const recordYears = records.filter(record => record.employeeId === employeeId && record.leaveType === type).map(record => record.startDate.slice(0, 4))
  const nextYear = String(Math.min(Number(defaultYear) + 1, 9999))
  const years = [...new Set([defaultYear, nextYear, firstYear, year, ...recordYears])].sort().reverse()
  const usage = annualUsage(records, employeeId, type, year)
  const repeatStatus = usage.alreadyGranted ? 'Недоступне' : 'Активної реєстрації немає'
  const special = usage.limit !== null
  return <section className="leave-layout" aria-label="Використання за рік">
    <InfoSection title={leaveLabels[type]} icon={<LeaveTypeIcon type={type}/>}
      help={<HelpTip label="Як рахуються дні за рік" text={'Повна тривалість належить до року початку, навіть якщо відпустка переходить через Новий рік. Дні не накопичуються.' + (special ? ' За рік допускається одна активна реєстрація цього виду.' : '')}/>}
      action={<div className="leave-summary-actions">{rightBadge}<div className="leave-year-select">
        <span className="leave-muted" aria-hidden="true">Рік</span>
        <Select label="Рік початку відпустки" value={year} options={years.map(value => ({ value, label: value }))} onChange={setYear} advanceOnSelect={false}/>
      </div></div>}>
      {usage.history.length ? <dl className={'leave-metric-grid' + (special ? ' leave-metric-grid-three' : '')}>
        <InfoItem label={`Зареєстровано за ${year} рік`} value={formatLeaveDays(usage.days)} emphasis/>
        <InfoItem label="Активні реєстрації" value={usage.activeCount.toLocaleString('uk-UA')}/>
        {usage.limit !== null && <>
          <InfoItem label="Межа тривалості" value={formatLeaveDays(usage.limit)}/>
          <InfoItem label="Повторне надання" value={repeatStatus}/>
        </>}
      </dl> : <>
        <div className="info-item"><DataState kind="empty" compact message="За обраний рік реєстрацій цього виду немає."/></div>
        {usage.limit !== null && <dl className="info-grid info-grid-two">
          <InfoItem label="Межа тривалості" value={formatLeaveDays(usage.limit)}/>
          <InfoItem label="Повторне надання" value={repeatStatus}/>
        </dl>}
      </>}
      {usage.alreadyGranted && <Alert variant="warning">За {year} рік уже є активна реєстрація.</Alert>}
      {rightNotice}
    </InfoSection>
    {usage.history.length > 0 && <section className="leave-balances-table" aria-label="Історія реєстрацій">
      <header className="leave-section-heading"><History size={17} aria-hidden="true"/><h3>Реєстрації за роком початку</h3></header>
      <DictionaryTable label="Реєстрації за роком початку" className="leave-table leave-event-table" columns={[{ label: 'Дати', width: '32%' }, { label: 'Днів', width: '12%', className: 'leave-days-column' }, { label: 'Розпорядження', width: '23%' }, { label: 'Статус' }]}>
        {usage.history.map(record => <tr key={record.id} className={record.status === 'cancelled' ? 'leave-cancelled-row' : undefined}>
          <td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td>
          <td className="leave-days-column">{record.usedDays}</td>
          <td>{record.orderNumber ?? '–'}{record.orderDate && <small className="leave-period-note">{formatDate(record.orderDate)}</small>}</td>
          <td><LeaveStatus status={record.status}/>{record.status === 'cancelled' && <small className="leave-period-note">У сумі не враховано</small>}</td>
        </tr>)}
      </DictionaryTable>
    </section>}
  </section>
}
