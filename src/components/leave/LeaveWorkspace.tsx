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
  const employee = employees?.find(item => item.id === selected)
  return <div className="page-transition">
    <div className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Відпустки</h1></div></div>
    <section className="dashboard-panel leave-layout" aria-label="Облік залишків">
      {error ? <Alert variant="error" action={<button type="button" onClick={() => { setError(''); setRevision(value => value + 1) }}>Повторити</button>}>{error}</Alert> :
        !employees ? <DataState kind="loading" message="Завантаження працівників…" /> :
        employees.length === 0 ? <DataState kind="empty" message="У реєстрі ще немає працівників." /> :
        <div className="leave-select"><Select label="Працівник" value={selected} searchable advanceOnSelect={false}
          options={employees.map(item => ({ value: item.id, label: fullName(item), description: item.position.name + ' · ' + item.department.name }))}
          onChange={id => navigationGuard.current(() => setSelected(id))} /></div>}
      {employee && <LeaveBalances key={employee.id} employeeId={employee.id} hireDate={employee.hireDate} navigationGuard={navigationGuard} />}
    </section>
  </div>
}
