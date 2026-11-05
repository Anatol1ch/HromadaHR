import Modal from '../Modal'
import { navigateTabs } from '../../lib/tabNavigation'
import { useEffect, useState } from 'react'
import { Pencil, Trash2, UserRound, X } from 'lucide-react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

const tabs = ['Загальна інформація', 'Відпустки', 'Стаж і вислуга', 'Ранги'] as const
export default function EmployeeCard({ id, onClose, onEdit, onLoaded, onDelete, revision }: {
  id: string; revision: number; onClose: () => void; onDelete: (id: string) => void
  onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<EmployeeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState(0)
  const cardFooter = <footer className="recipient-form-actions employee-card-footer"><div>
    <button type="button" className="secondary-button" onClick={onClose}><X size={17} aria-hidden="true"/>Скасувати</button>
  </div></footer>
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
  if (loading && !data) return <Modal title="Особова картка" size="large" onClose={onClose}><DataState kind="loading" message="Завантаження особової картки…" />{cardFooter}</Modal>
  if (error || !data) return <Modal title="Особова картка" size="large" onClose={onClose}><Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>{error || 'Картка недоступна.'}</Alert>{cardFooter}</Modal>
  const employee = data
  const sections = [
    { title: 'Персональні відомості', personal: true, fields: [['Прізвище', employee.lastName], ['Ім’я', employee.firstName], ['По батькові', employee.middleName ?? 'Не зазначено'], ['Дата народження', displayDate(employee.birthDate)], ['Тип працівника', employeeTypeLabels[employee.employeeType]]] },
    { title: 'Кадрові відомості', fields: [['Підрозділ', employee.department.name], ['Посада', employee.position.name], ['Дата прийняття', displayDate(employee.hireDate)]] },
  ]
  return <Modal title="Особова картка" size="large" className="employee-card-modal" headerIcon={<UserRound size={21} aria-hidden="true"/>} onClose={onClose}>
    <article className="recipient-details employee-card">
      <header>
        <div className="detail-avatar" aria-hidden="true"><UserRound size={22}/></div>
        <div className="employee-card-identity"><h3>{fullName(employee)}</h3><p>{employee.position.name}</p><p>{employee.department.name}</p></div>
        <div className="employee-card-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => onEdit(employee)}><Pencil size={16} aria-hidden="true"/>Редагувати</button>
          <button className="secondary-button danger-action" type="button" title="Видалити працівника" disabled={loading} onClick={() => onDelete(id)}><Trash2 size={16} aria-hidden="true"/>Видалити</button>
        </div>
      </header>
      {loading && <p className="employee-hint" role="status">Оновлення відомостей…</p>}
      <div className="dictionary-tabs" role="tablist" aria-label="Розділи особової картки" onKeyDown={navigateTabs}>
        {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`employee-tab-${index}`} className={tab === index ? 'active' : ''} aria-selected={tab === index}
          aria-controls={`employee-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}>{label}</button>)}
      </div>
      {tabs.map((label, index) => <div key={label} role="tabpanel" id={`employee-panel-${index}`} aria-labelledby={`employee-tab-${index}`} hidden={tab !== index} tabIndex={0}>
        {index !== 0 ? <DataState kind="planned" message="Функціональність буде додано пізніше" compact/> : <>
          {sections.map(section => <section className="recipient-detail-section" key={section.title}><h3>{section.title}</h3><div className={section.personal ? "recipient-detail-grid employee-personal-grid" : "recipient-detail-grid"}>
            {section.fields.map(([field, value]) => <div className="recipient-detail-item" key={field}><span>{field}</span><strong>{value}</strong></div>)}
          </div></section>)}
        </>}
      </div>)}
      {cardFooter}
    </article>
  </Modal>
}
