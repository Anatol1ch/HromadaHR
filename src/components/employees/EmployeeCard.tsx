import { notifySystemToast } from '../SystemToastHost'
import { navigateTabs } from '../../lib/tabNavigation'
import type { NavigationGuard } from './useUnsavedChanges'
import type { RefObject } from 'react'
import DeleteConfirmation from './DeleteConfirmation'
import useUnsavedChanges from './useUnsavedChanges'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import type { Assignment, Department, EmployeeCard as EmployeeData, Position } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, historyRows, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

const tabs = ['Загальна інформація', 'Відпустки', 'Стаж і вислуга', 'Ранги'] as const
interface CardData { employee: EmployeeData; history: Assignment[]; departments: Department[]; positions: Position[] }
export default function EmployeeCard({ id, onBack, onEdit, onLoaded, onAssign, onDeleted, navigationGuard }: {
  navigationGuard: RefObject<NavigationGuard>; onAssign: (employee: EmployeeData, assignment?: Assignment) => void; onDeleted: (id: string) => void
  id: string; onBack: () => void; onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<CardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<'employee' | Assignment | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inFlight = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useUnsavedChanges(false, inFlight, navigationGuard)
  async function confirmDelete() {
    if (!deleteTarget || inFlight.current) return
    inFlight.current = true; setDeleting(true); setDeleteError('')
    try {
      if (deleteTarget === 'employee') {
        const result = await window.hromadaHR.personnel.deleteEmployee(id)
        if (!alive.current) return
        if (!result.ok) { setDeleteError(personnelMessage(result.error.code)); return }
        onDeleted(id)
      } else {
        const result = await window.hromadaHR.personnel.deleteAssignment(deleteTarget.id)
        if (!alive.current) return
        if (!result.ok) { setDeleteError(personnelMessage(result.error.code)); return }
        setDeleteTarget(null); notifySystemToast('success', 'Призначення видалено', 'Історію оновлено.')
        onLoaded(result.data); setRetry(value => value + 1)
      }
    } catch { if (alive.current) setDeleteError('Результат видалення не підтверджено. Закрийте цей діалог і оновіть картку перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setDeleting(false) }
  }
  function askDelete(target: 'employee' | Assignment) { setDeleteError(''); setDeleteTarget(target) }
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
    <div className="employee-tabs" role="tablist" aria-label="Розділи особової картки" onKeyDown={navigateTabs}>
      {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`employee-tab-${index}`} aria-selected={tab === index}
        aria-controls={`employee-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}>{label}</button>)}
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
        <section className="dashboard-panel employee-history-panel" aria-labelledby="employee-history-title"><div className="employee-history-heading"><h2 id="employee-history-title">Історія посад</h2>
          <button className="secondary-button" type="button" disabled={deleting} onClick={() => onAssign(employee)}>Додати кадрову зміну</button></div>
          <p className="employee-muted">Від останнього призначення до першого</p>
          {history.length === 0 ? <DataState kind="empty" compact message="Історія призначень відсутня" /> :
            <ol className="employee-history">{historyRows(history).map((assignment, index) => <li key={assignment.id}>
              <div className="employee-history-date">{assignment.endDate ? `${displayDate(assignment.startDate)} — ${displayDate(assignment.endDate)}` : `З ${displayDate(assignment.startDate)}`}
                {index === 0 && <span className="employee-current-tag">Поточне</span>}</div>
              <h3>{positionNames.get(assignment.positionId) ?? 'Посаду не знайдено у довіднику'}</h3>
              <p>{departmentNames.get(assignment.departmentId) ?? 'Підрозділ не знайдено у довіднику'}</p>
              <p className="employee-muted">Категорія: {assignment.category ?? 'не зазначено'}</p>
              <div className="employee-actions employee-history-actions">
                <button type="button" className="secondary-button" disabled={deleting} onClick={() => onAssign(employee, assignment)} aria-label={`Виправити призначення від ${displayDate(assignment.startDate)}`}>Виправити</button>
                <button type="button" className="danger-button danger-button-outline" disabled={deleting || history.length <= 1}
                  title={history.length <= 1 ? 'Єдиний запис історії не можна видалити' : undefined}
                  aria-label={`Видалити призначення від ${displayDate(assignment.startDate)}`} onClick={() => askDelete(assignment)}>Видалити запис</button>
              </div>
            </li>)}</ol>}
          {history.length === 1 && <p className="employee-hint">Єдиний запис історії можна виправити, але не видалити.</p>}
        </section>
      </>}
    </div>)}
    <section className="dashboard-panel employee-danger-zone" aria-labelledby="delete-employee-title">
      <h2 id="delete-employee-title">Видалення працівника</h2>
      <p>Повністю видалити особову картку та всю історію призначень без можливості скасувати цю дію.</p>
      <button type="button" className="danger-button danger-button-outline" disabled={deleting} onClick={() => askDelete('employee')}>Видалити працівника</button>
    </section>
    {deleteTarget && <DeleteConfirmation title={deleteTarget === 'employee' ? 'Видалити працівника назавжди?' : 'Видалити помилкове призначення?'}
      pending={deleting} error={deleteError} onCancel={() => { if (!inFlight.current) setDeleteTarget(null) }} onConfirm={() => confirmDelete()}
      confirmLabel={deleteTarget === 'employee' ? 'Видалити назавжди' : 'Видалити запис'}>
      <p><strong>{fullName(employee)}</strong></p>
      {deleteTarget === 'employee' ? <><p>Записів історії: <strong>{history.length}</strong>.</p><p>Особову картку й усі її призначення буде видалено незворотно. Посади й підрозділи залишаться у довідниках.</p></> :
        <><p>Призначення від {displayDate(deleteTarget.startDate)}: {positionNames.get(deleteTarget.positionId) ?? 'Посада не знайдена'}, {departmentNames.get(deleteTarget.departmentId) ?? 'Підрозділ не знайдений'}.</p>
          <p>Запис буде видалено. Дата прийняття та поточна посада визначатимуться за рештою історії.</p></>}
    </DeleteConfirmation>}
  </article>
}
