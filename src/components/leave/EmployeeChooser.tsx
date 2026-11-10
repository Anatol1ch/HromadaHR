import { useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { DirectoryOrder } from '../../employees/registry'
import Alert from '../Alert'
import Select from '../Select'
import { employeePickerOptions, matchesEmployeeOption } from './employeePicker'

export default function EmployeeChooser({ employees, selected, loading, onSelect }: {
  employees: EmployeeCard[]; selected: string; loading: boolean
  onSelect: (id: string) => void
}) {
  const [directories, setDirectories] = useState<DirectoryOrder>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const api = window.hromadaHR.personnel
    void Promise.all([api.listDepartments(), api.listPositions()]).then(([departments, positions]) => {
      if (!active) return
      if (!departments.ok) setError(personnelMessage(departments.error.code))
      else if (!positions.ok) setError(personnelMessage(positions.error.code))
      else setDirectories({ department: departments.data, position: positions.data })
    }).catch(() => {
      if (active) setError('Не вдалося завантажити порядок довідників.')
    })
    return () => { active = false }
  }, [attempt])

  const employee = employees.find(person => person.id === selected)
  const options = directories ? employeePickerOptions(employees, directories) : undefined
  const selectedOption = options?.find(option => option.value === selected)
  const loadError = error || (options === null ? 'Дані працівників не збігаються з довідниками.' : '')
  const retry = () => {
    setDirectories(undefined)
    setError('')
    setAttempt(value => value + 1)
  }

  return <div className="dashboard-panel leave-employee-chooser">
    <div className="leave-chosen-person">
      <span className="leave-type-icon"><UserRound size={20} aria-hidden="true" /></span>
      <div>
        <strong>{employee ? fullName(employee) : 'Працівника не обрано'}</strong>
        {employee && <small>{selectedOption?.description ?? `${employee.position.name} · ${employee.department.name}`}</small>}
      </div>
      <Select label="Працівник" actionLabel={employee ? 'Змінити працівника' : 'Обрати працівника'}
        value={selectedOption?.value ?? ''} options={options ?? []} onChange={onSelect}
        searchable matchesSearch={matchesEmployeeOption} advanceOnSelect={false} disabled={loading || !options} />
    </div>
    {loadError && <Alert variant="error" action={<button type="button" onClick={retry}>Повторити</button>}>
      {loadError}
    </Alert>}
  </div>
}
