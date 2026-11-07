import LeaveJournal from './LeaveJournal'
import type { LeaveRecord } from '../../../shared/leave'
import { useEffect, useState, type RefObject } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import Select from '../Select'
import LeaveBalances from './LeaveBalances'

export default function LeaveWorkspace({ navigationGuard }: { navigationGuard: RefObject<NavigationGuard> }) {
  const [employees, setEmployees] = useState<EmployeeCard[] | null>(null)
  const [records, setRecords] = useState<LeaveRecord[] | null>(null)
  const [recordsError, setRecordsError] = useState('')
  const [recordsRevision, setRecordsRevision] = useState(0)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void window.hromadaHR.personnel.listEmployees().then(result => {
      if (!active) return
      if (result.ok) setEmployees(result.data)
      else setError(personnelMessage(result.error.code))
    }).catch(() => { if (active) setError('Не вдалося завантажити працівників.') })
    return () => { active = false }
  }, [revision])
  useEffect(() => {
    let active = true
    setRecordsError('')
    void window.hromadaHR.leave.listRecords(null).then(result => {
      if (!active) return
      if (result.ok) setRecords(result.data)
      else setRecordsError(personnelMessage(result.error.code))
    }).catch(() => { if (active) setRecordsError('Не вдалося завантажити реєстр відпусток.') })
    return () => { active = false }
  }, [recordsRevision])
  const employee = employees?.find(item => item.id === selected)
  return <div className="page-transition leave-workspace">
    <div className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Відпустки</h1></div></div>
    <section className="leave-layout" aria-label="Облік залишків">
      {error ? <Alert variant="error" action={<button type="button" onClick={() => { setError(''); setRevision(value => value + 1) }}>Повторити</button>}>{error}</Alert> :
        !employees ? <DataState kind="loading" message="Завантаження працівників…" /> :
        employees.length === 0 ? <DataState kind="empty" message="У реєстрі ще немає працівників." /> :
        <div className="leave-person-toolbar"><div className="leave-select"><Select label="Працівник" value={selected} onClear={() => navigationGuard.current(() => setSelected(''))} searchable advanceOnSelect={false}
          options={employees.map(item => ({ value: item.id, label: fullName(item), description: item.position.name + ' · ' + item.department.name }))}
          onChange={id => navigationGuard.current(() => setSelected(id))} /></div>
          {employee && <div className="leave-person-context">
            <h2>{fullName(employee)}</h2>
            <p>{employee.position.name} · {employee.department.name}</p>
          </div>}
        </div>}
      {employees && employees.length > 0 && !employee && !error &&
        <DataState kind="empty" message="Оберіть працівника" description="Тут з’являться його облікові періоди та підтверджені залишки." />}
      {employee && <LeaveBalances key={employee.id} employeeId={employee.id} employeeName={fullName(employee)} hireDate={employee.hireDate} navigationGuard={navigationGuard}
        showJournal={false} refreshRevision={recordsRevision} onRegistered={() => setRecordsRevision(value => value + 1)} />}
      {recordsError ? <Alert variant="error" action={<button type="button" onClick={() => setRecordsRevision(value => value + 1)}>Повторити</button>}>{recordsError}</Alert> :
        records && employees ? <LeaveJournal records={selected ? records.filter(record => record.employeeId === selected) : records}
          navigationGuard={navigationGuard} onChanged={() => setRecordsRevision(value => value + 1)} employees={new Map(employees.map(person => [person.id, fullName(person)]))} /> :
          <DataState kind="loading" message="Завантаження реєстру відпусток…" />}
    </section>
  </div>
}
