import HelpTip from './HelpTip'
import { specialLeaveLimit } from '../../../shared/leave'
import { Pencil, Ban } from 'lucide-react'
import type { RefObject } from 'react'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import LeaveRecordAction from './LeaveRecordAction'
import { useEffect, useState } from 'react'
import type { LeaveRecord } from '../../../shared/leave'
import { formatDate, formatDateTime } from '../../lib/dates'
import DictionaryTable from '../DictionaryTable'
import Select from '../Select'
import { leaveLabels, leaveGroupOptions, matchesLeaveGroup, overlapsYear } from './presentation'

export default function LeaveJournal({ records, employees, compact = false, navigationGuard, onChanged, onRegister, toolbar, onBalances, active = true }: {
  navigationGuard: RefObject<NavigationGuard>; onChanged: () => void; onRegister?: () => void; toolbar?: React.ReactNode; active?: boolean; onBalances?: (employeeId: string) => void
  records: LeaveRecord[]; employees?: Map<string, string>; compact?: boolean
}) {
  const [action, setAction] = useState<{ id: string; kind: 'edit' | 'cancel' } | null>(null)
  useEffect(() => { if (!active) setAction(null) }, [active])
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [year, setYear] = useState('')
  const years = [...new Set(records.flatMap(record => {
    const first = Number(record.startDate.slice(0, 4))
    const last = Number(record.endDate.slice(0, 4))
    return Array.from({ length: last - first + 1 }, (_, index) => String(first + index))
  }))].sort().reverse()
  const visible = records.filter(record => matchesLeaveGroup(record.leaveType, type) &&
    overlapsYear(record, year) && (!status || record.status === status))
  return <section className="leave-layout" aria-label="Зареєстровані відпустки">
    <h3>Зареєстровані відпустки</h3>
    {!compact && <div className="leave-journal-filters">{toolbar}
      <div className="leave-select"><Select label="Вид у реєстрі" value={type} onChange={setType} advanceOnSelect={false}
        options={[{ value: '', label: 'Усі види' }, ...leaveGroupOptions]} /></div>
      <div className="leave-select"><Select label="Календарний рік" value={year} onChange={setYear} advanceOnSelect={false}
        options={[{ value: '', label: 'Усі роки' }, ...years.map(value => ({ value, label: value }))]} /></div>
      <div className="leave-select"><Select label="Статус" value={status} onChange={setStatus} advanceOnSelect={false} options={[{value: '', label: 'Усі статуси'}, {value: 'active', label: 'Зареєстровано'}, {value: 'cancelled', label: 'Скасовано'}]} /></div>
    </div>}
    <DictionaryTable label="Зареєстровані відпустки" className="leave-table leave-journal" columns={[
      ...(employees ? [{ label: 'Працівник' }] : []), { label: 'Вид' }, { label: 'Період' },
      { label: 'Днів', width: '4.5rem' }, { label: 'Розпорядження' }, { label: 'Статус' }, { label: 'Дії', width: '6rem' },
    ]} empty={visible.length ? undefined : 'Зареєстрованих відпусток за вибраними умовами немає.'}>
      {visible.map(record => <tr key={record.id}>
        {employees && <td>{employees.get(record.employeeId) ?? 'Працівник недоступний'}</td>}
        <td>{leaveLabels[record.leaveType]}{specialLeaveLimit(record.leaveType) !== null && <small className="leave-period-note">Рік надання: {record.startDate.slice(0,4)}</small>}{record.grantBasis && <details><summary>Підстава надання</summary><p>{record.grantBasis}</p></details>}{record.allocationWarning && <small className="leave-period-note" role="status">Розподіл потребує перевірки: є період після завершення відпустки.</small>}{record.status === 'cancelled' && <details><summary>Скасовано</summary><p>{record.cancelReason ?? 'Причина не зазначена у старому записі.'}</p><small>{formatDateTime(record.cancelledAt)}</small></details>}</td>
        <td>{formatDate(record.startDate)}–{formatDate(record.endDate)}{record.durationExplanation && <small className="leave-period-note">{record.durationExplanation}</small>}</td>
        <td>{record.usedDays}</td><td>{record.orderNumber ?? '—'}{record.orderDate && <small className="leave-period-note">{formatDate(record.orderDate)}</small>}</td>
        <td><span className="leave-status">{record.status === 'active' ? 'Зареєстровано' : 'Скасовано'}</span></td>
        <td>{record.status === 'active' && <div className="registry-row-actions">
          <HelpTip label={'Редагувати відпустку від ' + formatDate(record.startDate)} text="Редагувати відпустку" onClick={() => setAction({ id: record.id, kind: 'edit' })} icon={<Pencil size={16} aria-hidden="true" />} />
          <HelpTip label={'Скасувати реєстрацію від ' + formatDate(record.startDate)} text="Скасувати реєстрацію" onClick={() => setAction({ id: record.id, kind: 'cancel' })} icon={<Ban size={16} aria-hidden="true" />} />
        </div>}</td>
      </tr>)}
    </DictionaryTable>
    {!records.length && onRegister && <button type="button" className="secondary-button" onClick={onRegister}>Зареєструвати відпустку</button>}
    {action && <LeaveRecordAction key={action.id + action.kind} {...action} onBalances={onBalances} navigationGuard={navigationGuard} onClose={() => setAction(null)} onChanged={onChanged} />}
  </section>
}
