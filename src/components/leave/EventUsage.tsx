import { useState } from 'react'
import type { LeaveRecord, LeaveType } from '../../../shared/leave'
import { todayIsoDate, formatDate } from '../../lib/dates'
import Select from '../Select'
import DictionaryTable from '../DictionaryTable'
import HelpTip from './HelpTip'
import DataState from '../DataState'
import { annualUsage } from './usage'
import { cutoff } from './draft'
import { formatLeaveDays } from './summary'

export default function EventUsage({ records, employeeId, type }: { records: LeaveRecord[]; employeeId: string; type: LeaveType }) {
  const currentYear = todayIsoDate().slice(0, 4)
  const firstYear = cutoff.slice(0, 4)
  const defaultYear = currentYear < firstYear ? firstYear : currentYear
  const [year, setYear] = useState(defaultYear)
  const years = [...new Set([defaultYear, firstYear, year, ...records.filter(r => r.employeeId === employeeId && r.leaveType === type).map(r => r.startDate.slice(0, 4))])].sort().reverse()
  const usage = annualUsage(records, employeeId, type, year)
  return <section className="leave-layout" aria-label="Використання за рік">
    <section className="leave-balance-summary leave-event-summary" aria-label="Річне зведення">
      <header className="leave-section-heading">
        <h3>Річне використання</h3>
        <HelpTip label="Як рахуються дні за рік" text={'Повна тривалість належить до року початку, навіть якщо відпустка переходить через Новий рік. Дні не накопичуються.' + (usage.limit !== null ? ' За рік допускається одна активна реєстрація цього виду.' : '')}/>
        <div className="leave-select"><Select label="Рік початку відпустки" value={year} options={years.map(value => ({ value, label: value }))} onChange={setYear} advanceOnSelect={false} /></div>
      </header>
      <dl>
        <div className="leave-balance-available"><dt>Зареєстровані дні</dt><dd>{formatLeaveDays(usage.days)}</dd></div>
        <div><dt>Активні реєстрації</dt><dd>{usage.activeCount.toLocaleString('uk-UA')}</dd></div>
        {usage.limit !== null && <div><dt>Межа тривалості</dt><dd>{formatLeaveDays(usage.limit)}</dd></div>}
      </dl>
      {usage.limit !== null && (usage.alreadyGranted
        ? <p className="leave-right-warning" role="status">Повторне надання цього виду за {year} рік недоступне. Уже є активна реєстрація.</p>
        : <p className="leave-muted">Активної реєстрації цього виду за {year} рік немає.</p>)}
    </section>
    {usage.history.length === 0 ? <DataState kind="empty" message="За обраний рік реєстрацій цього виду немає."/> :
    <DictionaryTable label="Реєстрації за роком початку" className="leave-table" columns={[{ label: 'Дати' }, { label: 'Днів', width: '18%' }, { label: 'Розпорядження' }, { label: 'Статус' }]}>
      {usage.history.map(record => <tr key={record.id} className={record.status === 'cancelled' ? 'leave-cancelled-row' : undefined}><td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td><td>{record.usedDays}</td><td>{record.orderNumber ?? '–'}{record.orderDate && <small>{formatDate(record.orderDate)}</small>}</td><td>{record.status === 'active' ? 'Зареєстровано' : 'Скасовано – у сумі не враховано'}</td></tr>)}
    </DictionaryTable>}
  </section>
}
