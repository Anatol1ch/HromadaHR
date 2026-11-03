import { ArrowDownAZ, ArrowUpAZ, Plus } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, selectEmployees } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import SearchField from '../SearchField'
import Select from '../Select'
import { TableSkeleton } from '../Skeleton'

type Props = {
  employees: EmployeeCard[]; loading: boolean; error: string
  query: string; departmentId: string; descending: boolean
  onQuery: (value: string) => void; onDepartment: (value: string) => void; onSort: () => void
  onRetry: () => void; onCreate: () => void; onOpen: (employee: EmployeeCard) => void
}
export default function EmployeeRegistry({ employees, loading, error, query, departmentId, descending,
  onQuery, onDepartment, onSort, onRetry, onCreate, onOpen }: Props) {
  const visible = selectEmployees(employees, query, departmentId, descending)
  const departments = [...new Map(employees.map(employee => [employee.currentAssignment.departmentId, employee.currentAssignment.department])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  const SortIcon = descending ? ArrowUpAZ : ArrowDownAZ
  const departmentOptions = [{ value: '', label: 'Усі підрозділи' },
    ...departments.map(value => ({ value: value.id, label: value.name }))]
  if (departmentId && !departments.some(department => department.id === departmentId)) departmentOptions.push({ value: departmentId, label: 'Обраний підрозділ — немає працівників' })
  return <section className="employee-registry" aria-labelledby="employees-title">
    <div className="page-heading employee-heading">
      <div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="employees-title" tabIndex={-1} data-page-title>Працівники <span className="employee-count" aria-label="Кількість працівників">{loading ? '…' : error ? '—' : employees.length}</span></h1>
        <p className="subtitle">Реєстр працівників та особові картки громади</p></div>
      <button type="button" className="primary-button" onClick={onCreate}><Plus size={18} aria-hidden="true" />Додати працівника</button>
    </div>
    {error ? <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити завантаження</button>}>{error}</Alert> :
      loading ? <TableSkeleton columns={5} label="Завантаження працівників…" /> :
      employees.length === 0 ? <section className="dashboard-panel employee-empty"><DataState kind="empty" message="Працівників ще немає"
        description="Додайте першого працівника, щоб почати вести кадровий облік." /></section> :
      <section className="dashboard-panel employee-register-panel" aria-label="Реєстр працівників">
        <div className="employee-toolbar">
          <div className="employee-field employee-search"><span>Пошук за ПІБ</span>
            <SearchField value={query} onChange={onQuery} label="Пошук за ПІБ" placeholder="Прізвище, ім’я або по батькові" />
          </div>
          <div className="employee-field"><span>Підрозділ</span>
            <Select label="Фільтр за підрозділом" value={departmentId} onChange={onDepartment} options={departmentOptions} advanceOnSelect={false} />
          </div>
        </div>
        <div className="employee-results"><span role="status" aria-atomic="true">Знайдено: {visible.length} із {employees.length}</span>
          {(query || departmentId) && <button className="employee-link" type="button" onClick={() => { onQuery(''); onDepartment('') }}>Скинути пошук і фільтр</button>}</div>
        <DictionaryTable label="Таблиця працівників" className="hr-employee-table" filtered={!!query || !!departmentId} empty={visible.length ? undefined : 'Нічого не знайдено'}
          columns={[{ label: <button className="employee-sort" type="button" onClick={onSort} aria-label={`ПІБ. Змінити сортування на ${descending ? 'за зростанням' : 'за спаданням'}`}>ПІБ <SortIcon size={17} aria-hidden="true" /></button>, sort: descending ? 'descending' : 'ascending', width: '25%' },
            { label: 'Посада', width: '22%' }, { label: 'Підрозділ', width: '22%' }, { label: 'Тип працівника', width: '20%' }, { label: 'Дата прийняття', width: '11%' }]}>
          {visible.map(employee => <tr key={employee.id}>
            <td><button className="employee-name-link" type="button" onClick={() => onOpen(employee)}>{fullName(employee)}</button></td>
            <td>{employee.currentAssignment.position.name}</td><td>{employee.currentAssignment.department.name}</td>
            <td>{employeeTypeLabels[employee.employeeType]}</td><td className="employee-date">{displayDate(employee.hireDate)}</td>
          </tr>)}
        </DictionaryTable>
      </section>}
  </section>
}
