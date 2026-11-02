import { ArrowDownAZ, ArrowUpAZ, Plus, Search } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, selectEmployees } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

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
  return <section className="employee-registry" aria-labelledby="employees-title">
    <div className="page-heading employee-heading">
      <div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="employees-title" tabIndex={-1} data-page-title>Працівники <span className="employee-count" aria-label="Кількість працівників">{loading ? '…' : error ? '—' : employees.length}</span></h1>
        <p className="subtitle">Реєстр працівників та особові картки громади</p></div>
      <button type="button" className="primary-button" onClick={onCreate}><Plus size={18} aria-hidden="true" />Додати працівника</button>
    </div>
    {error ? <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити завантаження</button>}>{error}</Alert> :
      loading ? <section className="dashboard-panel"><DataState kind="loading" message="Завантаження працівників…" /></section> :
      employees.length === 0 ? <section className="dashboard-panel employee-empty"><DataState kind="empty" message="Працівників ще немає"
        description="Додайте першого працівника, щоб почати вести кадровий облік." /></section> :
      <section className="dashboard-panel employee-register-panel" aria-label="Реєстр працівників">
        <div className="employee-toolbar">
          <div className="employee-field employee-search"><label htmlFor="employee-search">Пошук за ПІБ</label>
            <div className="employee-search-input"><Search size={18} aria-hidden="true" /><input type="search" id="employee-search" value={query}
              placeholder="Прізвище, ім’я або по батькові" onChange={event => onQuery(event.target.value)} /></div>
          </div>
          <div className="employee-field"><label htmlFor="employee-department-filter">Підрозділ</label>
            <select id="employee-department-filter" value={departmentId} onChange={event => onDepartment(event.target.value)}>
              <option value="">Усі підрозділи</option>
              {departments.map(department => <option value={department.id} key={department.id}>{department.name}</option>)}
            </select>
          </div>
        </div>
        <div className="employee-results"><span role="status" aria-atomic="true">Знайдено: {visible.length} із {employees.length}</span>
          {(query || departmentId) && <button className="employee-link" type="button" onClick={() => { onQuery(''); onDepartment('') }}>Скинути пошук і фільтр</button>}</div>
        {visible.length === 0 ? <DataState kind="search" message="Нічого не знайдено" description="Змініть пошуковий запит або виберіть інший підрозділ." /> :
          <div className="employee-table-scroll" role="region" aria-label="Таблиця працівників, доступне горизонтальне прокручування" tabIndex={0}>
            <table className="employee-table"><caption className="visually-hidden">Працівники громади</caption>
              <thead><tr><th scope="col" aria-sort={descending ? 'descending' : 'ascending'}><button className="employee-sort" type="button" onClick={onSort}
                aria-label={`ПІБ. Змінити сортування на ${descending ? 'за зростанням' : 'за спаданням'}`}>ПІБ <SortIcon size={17} aria-hidden="true" /></button></th>
                <th scope="col">Посада</th><th scope="col">Підрозділ</th><th scope="col">Тип працівника</th><th scope="col">Дата прийняття</th></tr></thead>
              <tbody>{visible.map(employee => <tr key={employee.id}>
                <th scope="row"><button className="employee-name-link" type="button" onClick={() => onOpen(employee)}>{fullName(employee)}</button></th>
                <td>{employee.currentAssignment.position.name}</td><td>{employee.currentAssignment.department.name}</td>
                <td><span className={`employee-type-tag employee-type-${employee.employeeType}`}>{employeeTypeLabels[employee.employeeType]}</span></td>
                <td className="employee-date">{displayDate(employee.hireDate)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>}
  </section>
}
