import { useState } from 'react'
import type { LeaveRecord, LeaveType } from '../../../shared/leave'
import { todayIsoDate, formatDate } from '../../lib/dates'
import Select from '../Select'
import DictionaryTable from '../DictionaryTable'
import { annualUsage } from './usage'

export default function EventUsage({ records, employeeId, type }: { records: LeaveRecord[]; employeeId: string; type: LeaveType }) {
  const currentYear = todayIsoDate().slice(0, 4)
  const [year, setYear] = useState(currentYear)
  const years = [...new Set([currentYear, '2027', ...records.filter(r => r.employeeId === employeeId && r.leaveType === type).map(r => r.startDate.slice(0, 4))])].sort().reverse()
  const usage = annualUsage(records, employeeId, type, year)
  return <section className="leave-layout" aria-label="Використання за рік">
    <div className="leave-select"><Select label="Рік початку відпустки" value={year} options={years.map(value => ({ value, label: value }))} onChange={setYear} advanceOnSelect={false} /></div>
    <div className="leave-selected-summary"><strong>{usage.days} днів у зареєстрованих відпустках</strong><span>Активних реєстрацій: {usage.activeCount}</span></div>
    <p className="leave-muted">Повну тривалість віднесено до року початку відпустки. Це не кількість днів, фактично використаних у кожному календарному році.</p>
    {usage.limit !== null ? <p className="leave-muted">Межа тривалості – {usage.limit} днів. {usage.alreadyGranted ? 'За цей рік уже є активна реєстрація. Повторне надання цього виду недоступне.' : 'Не більше однієї активної реєстрації цього виду за рік.'} Невикористані дні не накопичуються.</p> : <p className="leave-muted">Навчальні відпустки обліковуються за окремими подіями. Спільний річний ліміт не встановлюється.</p>}
    <DictionaryTable label="Реєстрації за роком початку" className="leave-table" columns={[{ label: 'Дати' }, { label: 'Днів', width: '18%' }, { label: 'Розпорядження' }, { label: 'Статус' }]} empty={usage.history.length ? undefined : 'За обраний рік реєстрацій цього виду немає.'}>
      {usage.history.map(record => <tr key={record.id} className={record.status === 'cancelled' ? 'leave-cancelled-row' : undefined}><td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td><td>{record.usedDays}</td><td>{record.orderNumber ?? '–'}{record.orderDate && <small>{formatDate(record.orderDate)}</small>}</td><td>{record.status === 'active' ? 'Зареєстровано' : 'Скасовано – у сумі не враховано'}</td></tr>)}
    </DictionaryTable>
  </section>
}
