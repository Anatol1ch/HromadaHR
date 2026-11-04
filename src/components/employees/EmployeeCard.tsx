import Modal from '../Modal'
import { notifySystemToast } from '../SystemToastHost'
import { navigateTabs } from '../../lib/tabNavigation'
import type { NavigationGuard } from './useUnsavedChanges'
import type { RefObject } from 'react'
import ConfirmDialog from '../ConfirmDialog'
import useUnsavedChanges from './useUnsavedChanges'
import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import type { Assignment, Department, EmployeeCard as EmployeeData, Position } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, historyRows, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

const tabs = ['Загальна інформація', 'Відпустки', 'Стаж і вислуга', 'Ранги'] as const
interface CardData { employee: EmployeeData; history: Assignment[]; departments: Department[]; positions: Position[] }
export default function EmployeeCard({ id, onClose, onEdit, onLoaded, onAssign, onDelete, navigationGuard, revision }: {
  navigationGuard: RefObject<NavigationGuard>; onAssign: (employee: EmployeeData, assignment?: Assignment) => void; onDelete: (id: string) => void; revision: number
  id: string; onClose: () => void; onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<CardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inFlight = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const owner = useRef<HTMLElement>(null)
  const requestClose = useUnsavedChanges(false, inFlight, navigationGuard, owner)
  const close = () => requestClose(onClose)
  async function confirmDelete() {
    if (!deleteTarget || inFlight.current) return
    inFlight.current = true; setDeleting(true); setDeleteError('')
    try {
      const result = await window.hromadaHR.personnel.deleteAssignment(deleteTarget.id)
      if (!alive.current) return
      if (!result.ok) { setDeleteError(personnelMessage(result.error.code)); return }
      setDeleteTarget(null); notifySystemToast('success', 'Призначення видалено', 'Історію оновлено.')
      onLoaded(result.data); setRetry(value => value + 1)
    } catch { if (alive.current) setDeleteError('Результат видалення не підтверджено. Закрийте цей діалог і оновіть картку перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setDeleting(false) }
  }
  function askDelete(target: Assignment) { setDeleteError(''); setDeleteTarget(target) }
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
  }, [id, retry, revision, onLoaded])
  if (loading && !data) return <Modal title="Особова картка" size="large" onClose={close}><DataState kind="loading" message="Завантаження особової картки…" /></Modal>
  if (error || !data) return <Modal title="Особова картка" size="large" onClose={close}><Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>{error || 'Картка недоступна.'}</Alert></Modal>
  const { employee, history, departments, positions } = data
  const departmentNames = new Map(departments.map(value => [value.id, value.name]))
  const positionNames = new Map(positions.map(value => [value.id, value.name]))
  const sections = [
    { title: 'Персональні відомості', fields: [['Прізвище', employee.lastName], ['Ім’я', employee.firstName], ['По батькові', employee.middleName ?? 'Не зазначено'], ['Дата народження', displayDate(employee.birthDate)], ['Тип працівника', employeeTypeLabels[employee.employeeType]]] },
    { title: 'Кадрові відомості', fields: [['Дата прийняття', displayDate(employee.hireDate)], ['Початок поточного призначення', displayDate(employee.currentAssignment.startDate)], ['Посада', employee.currentAssignment.position.name], ['Підрозділ', employee.currentAssignment.department.name], ...(employee.currentAssignment.category ? [['Категорія посади', employee.currentAssignment.category]] : [])] },
  ]
  return <Modal title="Особова картка" size="large" className="employee-card-modal" headerIcon={<UserRound size={21} aria-hidden="true"/>} busy={deleting} onClose={close}>
    <article className="recipient-details employee-card" ref={owner}>
      <header>
        <div className="detail-avatar" aria-hidden="true"><UserRound size={22}/></div>
        <div className="employee-card-identity"><h3>{fullName(employee)}</h3><p>{employee.currentAssignment.position.name}</p><p>{employee.currentAssignment.department.name}</p></div>
        <button className="secondary-button employee-edit" type="button" disabled={loading} onClick={() => onEdit(employee)}><Pencil size={16} aria-hidden="true"/>Редагувати</button>
      </header>
      {loading && <p className="employee-hint" role="status">Оновлення відомостей…</p>}
      <div className="dictionary-tabs" role="tablist" aria-label="Розділи особової картки" onKeyDown={navigateTabs}>
        {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`employee-tab-${index}`} className={tab === index ? 'active' : ''} aria-selected={tab === index}
          aria-controls={`employee-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}>{label}</button>)}
      </div>
      {tabs.map((label, index) => <div key={label} role="tabpanel" id={`employee-panel-${index}`} aria-labelledby={`employee-tab-${index}`} hidden={tab !== index} tabIndex={0}>
        {index !== 0 ? <DataState kind="planned" message="Функціональність буде додано пізніше" compact/> : <>
          {sections.map(section => <section className="recipient-detail-section" key={section.title}><h3>{section.title}</h3><div className="recipient-detail-grid">
            {section.fields.map(([field, value]) => <div className="recipient-detail-item" key={field}><span>{field}</span><strong>{value}</strong></div>)}
          </div></section>)}
          <section className="recipient-history" aria-labelledby="employee-history-title">
            <div className="recipient-history-heading"><h3 id="employee-history-title">Історія посад</h3><span>{history.length} записів</span>
              <button className="secondary-button" type="button" disabled={deleting || loading} onClick={() => onAssign(employee)}><Plus size={16} aria-hidden="true"/>Додати кадрову зміну</button></div>
            {history.length ? <div className="recipient-history-table-wrap" tabIndex={0} role="region" aria-label="Історія призначень"><table className="recipient-history-table employee-history-table">
              <thead><tr><th scope="col">Початок</th><th scope="col">Завершення</th><th scope="col">Посада та підрозділ</th><th scope="col">Дії</th></tr></thead>
              <tbody>{historyRows(history).map((assignment, historyIndex) => <tr key={assignment.id}>
                <td className="employee-date">{displayDate(assignment.startDate)}{historyIndex === 0 && <small className="employee-current-tag">Поточне</small>}</td>
                <td className="employee-date">{assignment.endDate ? displayDate(assignment.endDate) : historyIndex === 0 ? 'Триває' : '—'}</td>
                <td>{positionNames.get(assignment.positionId) ?? 'Посаду не знайдено'}<small>{departmentNames.get(assignment.departmentId) ?? 'Підрозділ не знайдено'}</small></td>
                <td><div className="registry-row-actions">
                  <button type="button" className="table-action" disabled={deleting || loading} title="Виправити" aria-label={`Виправити призначення від ${displayDate(assignment.startDate)}`} onClick={() => onAssign(employee, assignment)}><Pencil size={16} aria-hidden="true"/>Виправити</button>
                  <button type="button" className="table-action danger-action" disabled={deleting || loading || history.length <= 1} title={history.length <= 1 ? 'Єдиний запис історії не можна видалити' : 'Видалити'} aria-label={`Видалити призначення від ${displayDate(assignment.startDate)}`} onClick={() => askDelete(assignment)}><Trash2 size={16} aria-hidden="true"/>Видалити</button>
                </div></td>
              </tr>)}</tbody>
            </table></div> : <DataState kind="empty" compact message="Історія призначень відсутня"/>}
            <p className="employee-hint">Від останнього призначення до першого. Завершення обчислюється за наступним записом; єдине призначення можна лише виправити.</p>
          </section>
        </>}
      </div>)}
      <div className="employee-card-danger"><button type="button" className="table-action danger-action" disabled={loading} onClick={() => onDelete(id)}><Trash2 size={16} aria-hidden="true"/>Видалити працівника</button></div>
    </article>
    {deleteTarget && <ConfirmDialog title="Видалити помилкове призначення?" error={deleteError} confirmDisabled={deleting}
      onCancel={() => { if (!inFlight.current) setDeleteTarget(null) }} onConfirm={() => confirmDelete()} confirmLabel="Видалити запис" busyLabel="Видалення…" message={<>
        <p><strong>{fullName(employee)}</strong></p><p>Призначення від {displayDate(deleteTarget.startDate)}: {positionNames.get(deleteTarget.positionId) ?? 'Посада не знайдена'}, {departmentNames.get(deleteTarget.departmentId) ?? 'Підрозділ не знайдений'}.</p>
        <p>Запис буде видалено. Дата прийняття та поточна посада визначатимуться за рештою історії.</p>
      </>}/>}
  </Modal>
}
