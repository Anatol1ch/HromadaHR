import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import type { Assignment, Department, EmployeeCard as EmployeeData, Position } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, historyRows, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

const tabs = ['Загальна інформація', 'Відпустки', 'Стаж і вислуга', 'Ранги'] as const
interface CardData { employee: EmployeeData; history: Assignment[]; departments: Department[]; positions: Position[] }
export default function EmployeeCard({ id, onBack, onEdit, onLoaded }: {
  id: string; onBack: () => void; onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<CardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    const api = window.hromadaHR.personnel
    void Promise.all([api.getEmployee(id), api.getHistory(id), api.listDepartments(), api.listPositions()])
      .then(([employee, history, departments, positions]) => {
        if (!alive) return
        if (!employee.ok) setError(personnelMessage(employee.error.code))
        else if (!history.ok) setError(personnelMessage(history.error.code))
        else if (!departments.ok) setError(personnelMessage(departments.error.code))
        else if (!positions.ok) setError(personnelMessage(positions.error.code))
        else {
          setData({ employee: employee.data, history: history.data, departments: departments.data, positions: positions.data })
          onLoaded(employee.data)
        }
      }).catch(() => { if (alive) setError('Не вдалося завантажити особову картку. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, retry, onLoaded])
  useEffect(() => {
    if (!loading) document.querySelector<HTMLElement>('[data-page-title]')?.focus()
  }, [loading])
  const back = <button className="employee-link employee-back" type="button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />До реєстру</button>
  if (loading) return <>{back}<h1 className="visually-hidden" tabIndex={-1} data-page-title>Особова картка</h1><section className="dashboard-panel"><DataState kind="loading" message="Завантаження особової картки…" /></section></>
  if (error || !data) return <>{back}<h1 tabIndex={-1} data-page-title>Особова картка</h1><Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>{error || 'Картка недоступна.'}</Alert></>
  const { employee, history, departments, positions } = data
  const departmentNames = new Map(departments.map(value => [value.id, value.name]))
  const positionNames = new Map(positions.map(value => [value.id, value.name]))
  return <article className="employee-card">
    {back}
    <header className="dashboard-panel employee-card-header">
      <div className="employee-avatar" aria-hidden="true">{employee.lastName.slice(0, 1)}{employee.firstName.slice(0, 1)}</div>
      <div className="employee-card-identity"><div className="eyebrow">ОСОБОВА КАРТКА</div>
        <h1 tabIndex={-1} data-page-title>{fullName(employee)}</h1>
        <p className="employee-card-position">{employee.currentAssignment.position.name}</p>
        <p className="employee-muted">{employee.currentAssignment.department.name}</p>
      </div>
      <button className="secondary-button employee-edit" type="button" onClick={() => onEdit(employee)}><Pencil size={16} aria-hidden="true" />Редагувати</button>
    </header>
    <div className="employee-tabs" role="tablist" aria-label="Розділи особової картки">
      {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`employee-tab-${index}`} aria-selected={tab === index}
        aria-controls={`employee-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}
        onKeyDown={event => {
          let next = index
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
          else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
          else if (event.key === 'Home') next = 0
          else if (event.key === 'End') next = tabs.length - 1
          else return
          event.preventDefault(); setTab(next)
          document.getElementById(`employee-tab-${next}`)?.focus()
        }}>{label}</button>)}
    </div>
    {tabs.map((label, index) => <div key={label} role="tabpanel" id={`employee-panel-${index}`} aria-labelledby={`employee-tab-${index}`} hidden={tab !== index} tabIndex={0}>
      {index !== 0 ? <section className="dashboard-panel"><DataState kind="planned" message="Функціональність буде додано пізніше" compact /></section> : <>
        <div className="employee-info-grid">
          <section className="dashboard-panel" aria-labelledby="employee-personal-title"><h2 id="employee-personal-title">Персональні відомості</h2>
            <dl className="employee-facts"><div><dt>Прізвище</dt><dd>{employee.lastName}</dd></div>
              <div><dt>Ім’я</dt><dd>{employee.firstName}</dd></div><div><dt>По батькові</dt><dd>{employee.middleName ?? 'Не зазначено'}</dd></div>
              <div><dt>Дата народження</dt><dd>{displayDate(employee.birthDate)}</dd></div>
              <div><dt>Тип працівника</dt><dd>{employeeTypeLabels[employee.employeeType]}</dd></div></dl>
          </section>
          <section className="dashboard-panel" aria-labelledby="employee-assignment-title"><h2 id="employee-assignment-title">Поточне призначення</h2>
            <dl className="employee-facts"><div><dt>Дата прийняття</dt><dd>{displayDate(employee.hireDate)}</dd></div>
              <div><dt>Посада</dt><dd>{employee.currentAssignment.position.name}</dd></div>
              <div><dt>Підрозділ</dt><dd>{employee.currentAssignment.department.name}</dd></div>
              <div><dt>Категорія посади</dt><dd>{employee.currentAssignment.category ?? 'Не зазначено'}</dd></div>
              <div><dt>Початок призначення</dt><dd>{displayDate(employee.currentAssignment.startDate)}</dd></div></dl>
          </section>
        </div>
        <section className="dashboard-panel employee-note-panel" aria-labelledby="employee-note-title"><h2 id="employee-note-title">Примітка</h2><p className="employee-note">{employee.note ?? 'Примітку не додано.'}</p></section>
        <section className="dashboard-panel employee-history-panel" aria-labelledby="employee-history-title"><h2 id="employee-history-title">Історія посад</h2>
          <p className="employee-muted">Від останнього призначення до першого</p>
          {history.length === 0 ? <DataState kind="empty" compact message="Історія призначень відсутня" /> :
            <ol className="employee-history">{historyRows(history).map((assignment, index) => <li key={assignment.id}>
              <div className="employee-history-date">{assignment.endDate ? `${displayDate(assignment.startDate)} — ${displayDate(assignment.endDate)}` : `З ${displayDate(assignment.startDate)}`}
                {index === 0 && <span className="employee-current-tag">Поточне</span>}</div>
              <h3>{positionNames.get(assignment.positionId) ?? 'Посаду не знайдено у довіднику'}</h3>
              <p>{departmentNames.get(assignment.departmentId) ?? 'Підрозділ не знайдено у довіднику'}</p>
              <p className="employee-muted">Категорія: {assignment.category ?? 'не зазначено'}</p>
            </li>)}</ol>}
        </section>
      </>}
    </div>)}
  </article>
}
