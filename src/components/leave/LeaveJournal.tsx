import { useState } from 'react'
import type { LeaveRecord } from '../../../shared/leave'
import { formatDate } from '../../lib/dates'
import DictionaryTable from '../DictionaryTable'
import Select from '../Select'
import { leaveLabels, leaveOptions, overlapsYear } from './presentation'

export default function LeaveJournal({ records, employees, compact = false }: {
  records: LeaveRecord[]; employees?: Map<string, string>; compact?: boolean
}) {
  const [type, setType] = useState('')
  const [year, setYear] = useState('')
  const years = [...new Set(records.flatMap(record => {
    const first = Number(record.startDate.slice(0, 4))
    const last = Number(record.endDate.slice(0, 4))
    return Array.from({ length: last - first + 1 }, (_, index) => String(first + index))
  }))].sort().reverse()
  const visible = records.filter(record => (!type || record.leaveType === type) &&
    overlapsYear(record, year))
  return <section className="leave-layout" aria-label="Зареєстровані відпустки">
    <h3>Зареєстровані відпустки</h3>
    {!compact && <div className="leave-toolbar">
      <div className="leave-select"><Select label="Вид у реєстрі" value={type} onChange={setType} advanceOnSelect={false}
        options={[{ value: '', label: 'Усі види' }, ...leaveOptions]} /></div>
      <div className="leave-select"><Select label="Календарний рік" value={year} onChange={setYear} advanceOnSelect={false}
        options={[{ value: '', label: 'Усі роки' }, ...years.map(value => ({ value, label: value }))]} /></div>
    </div>}
    <DictionaryTable label="Зареєстровані відпустки" className="leave-table leave-journal" columns={[
      ...(employees ? [{ label: 'Працівник' }] : []), { label: 'Вид' }, { label: 'Період' },
      { label: 'Днів', width: '4.5rem' }, { label: 'Розпорядження' },
    ]} empty={visible.length ? undefined : 'Зареєстрованих відпусток за вибраними умовами немає.'}>
      {visible.map(record => <tr key={record.id}>
        {employees && <td>{employees.get(record.employeeId) ?? 'Працівник недоступний'}</td>}
        <td>{leaveLabels[record.leaveType]}{record.status === 'cancelled' && <small className="leave-period-note">Скасовано</small>}</td>
        <td>{formatDate(record.startDate)}–{formatDate(record.endDate)}{record.durationExplanation && <small className="leave-period-note">{record.durationExplanation}</small>}</td>
        <td>{record.usedDays}</td><td>{record.orderNumber ?? '—'}{record.orderDate && <small className="leave-period-note">{formatDate(record.orderDate)}</small>}</td>
      </tr>)}
    </DictionaryTable>
  </section>
}
