import ServiceBaselinePanel from '../seniority-ranks/ServiceBaselinePanel'
import Modal from '../Modal'
import { navigateTabs } from '../../lib/tabNavigation'
import { useEffect, useId, useState, type RefObject } from 'react'
import type { NavigationGuard } from './useUnsavedChanges'
import LeaveOverview from '../leave/LeaveOverview'
import type { LeaveNavigationIntent } from '../leave/navigation'
import { BriefcaseBusiness, Pencil, Trash2, UserRound } from 'lucide-react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

const tabs = ['Загальна інформація', 'Відпустки', 'Стаж і вислуга', 'Ранги'] as const
export default function EmployeeCard({ id, onClose, onEdit, onLoaded, onDelete, revision, onOpenLeave, navigationGuard }: {
  onOpenLeave: (intent: LeaveNavigationIntent) => void; id: string; revision: number; onClose: () => void; onDelete: (id: string) => void
  navigationGuard: RefObject<NavigationGuard>
  onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<EmployeeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState(0)
  const [baselineBusy,setBaselineBusy]=useState(false)
  const close=()=>navigationGuard.current(onClose)
  const tabId = useId()
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void window.hromadaHR.personnel.getEmployee(id).then(result => {
      if (!alive) return
      if (!result.ok) setError(personnelMessage(result.error.code))
      else {
        setData(result.data)
        onLoaded(result.data)
      }
    }).catch(() => { if (alive) setError('Не вдалося завантажити особову картку. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, retry, revision, onLoaded])
  if (loading && !data) return <Modal title="Особова картка" size="large" className="employee-card-modal" onClose={close} busy={baselineBusy}>
    <DataState kind="loading" message="Завантаження особової картки…" />
  </Modal>
  if (error || !data) return <Modal title="Особова картка" size="large" className="employee-card-modal" onClose={close} busy={baselineBusy}>
    <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>
      {error || 'Картка недоступна.'}
    </Alert>
  </Modal>

  const employee = data
  const sections = [
    {
      title: 'Персональні відомості',
      icon: UserRound,
      layout: 'employee-card-fields employee-card-fields-personal',
      fields: [
        ['Прізвище', employee.lastName],
        ['Ім’я', employee.firstName],
        ['По батькові', employee.middleName ?? 'Не зазначено'],
        ['Дата народження', displayDate(employee.birthDate)],
        ['Тип працівника', employeeTypeLabels[employee.employeeType]],
      ],
    },
    {
      title: 'Кадрові відомості',
      icon: BriefcaseBusiness,
      layout: 'employee-card-fields',
      fields: [
        ['Підрозділ', employee.department.name],
        ['Посада', employee.position.name],
        ['Дата прийняття', displayDate(employee.hireDate)],
      ],
    },
  ]
  return <Modal title="Особова картка" size="large" className="employee-card-modal" onClose={close} busy={baselineBusy}>
    <article className="employee-card">
      <header className="employee-card-header">
        <div className="employee-card-avatar" aria-hidden="true"><UserRound size={23} /></div>
        <div className="employee-card-identity">
          <h3>{fullName(employee)}</h3>
          <p>{employee.position.name} <span aria-hidden="true">·</span> {employee.department.name}</p>
        </div>
        <div className="employee-card-actions">
          <button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={() => navigationGuard.current(()=>{if(tab===2)setTab(0);onEdit(employee)})}><Pencil size={16} aria-hidden="true" />Редагувати</button>
          <button className="secondary-button danger-action" type="button" title="Видалити працівника" disabled={loading||baselineBusy} onClick={() => navigationGuard.current(()=>{if(tab===2)setTab(0);onDelete(id)})}><Trash2 size={16} aria-hidden="true" />Видалити</button>
        </div>
      </header>
      {loading && <p className="employee-card-refresh" role="status">Оновлення відомостей…</p>}
      <div className="employee-card-tabs" role="tablist" aria-label="Розділи особової картки" onKeyDown={navigateTabs}>
        {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`${tabId}-tab-${index}`}
          aria-selected={tab === index} aria-controls={`${tabId}-panel-${index}`} tabIndex={tab === index ? 0 : -1}
          disabled={baselineBusy} onClick={() => {if(index!==tab)navigationGuard.current(()=>setTab(index))}}>{label}</button>)}
      </div>
      {tabs.map((label, index) => <div key={label} role="tabpanel" id={`${tabId}-panel-${index}`}
        aria-labelledby={`${tabId}-tab-${index}`} hidden={tab !== index} tabIndex={0}>
        {index === 0 ? <div className="employee-card-overview">
          {sections.map(({ title, icon: Icon, layout, fields }) => <section className="employee-card-section" key={title}>
            <h4><Icon size={17} aria-hidden="true" />{title}</h4>
            <dl className={layout}>
              {fields.map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}
            </dl>
          </section>)}
        </div> : index === 1 ? (tab === 1 && <LeaveOverview onOpen={destination => onOpenLeave({ ...destination, employeeId: id })} employeeId={id} revision={revision} />)
          : index === 2 ? (tab === 2 && <ServiceBaselinePanel key={id} employeeId={id} navigationGuard={navigationGuard} onBusyChange={setBaselineBusy}/>) : <DataState kind="planned" message="Функціональність буде додано пізніше" compact />}
      </div>)}
    </article>
  </Modal>
}
