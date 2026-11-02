import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import EmployeeRegistry from './EmployeeRegistry'
import EmployeeCard from './EmployeeCard'
import EmployeeForm from './EmployeeForm'

export interface EmployeeBreadcrumb { label: string; onBack: () => void }
type View = { kind: 'registry' } | { kind: 'create' } |
  { kind: 'card'; id: string; label: string } | { kind: 'edit'; employee: EmployeeData }
export default function EmployeesWorkspace({ navigationGuard, onBreadcrumb }: {
  navigationGuard: RefObject<() => boolean>
  onBreadcrumb: (value: EmployeeBreadcrumb | null) => void
}) {
  const [view, setView] = useState<View>({ kind: 'registry' })
  const [employees, setEmployees] = useState<EmployeeData[]>([])
  const [query, setQuery] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [descending, setDescending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const isRegistry = view.kind === 'registry'
  const goList = useCallback(() => {
    if (navigationGuard.current()) setView({ kind: 'registry' })
  }, [navigationGuard])
  const label = view.kind === 'create' ? 'Новий працівник' : view.kind === 'card' ? view.label :
    view.kind === 'edit' ? `Редагування: ${fullName(view.employee)}` : ''
  useEffect(() => {
    onBreadcrumb(isRegistry ? null : { label, onBack: goList })
    return () => onBreadcrumb(null)
  }, [isRegistry, label, goList, onBreadcrumb])
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-page-title]')?.focus()
  }, [view.kind])
  useEffect(() => {
    if (!isRegistry) return
    let alive = true
    setLoading(true); setError('')
    void window.hromadaHR.personnel.listEmployees().then(result => {
      if (!alive) return
      if (result.ok) setEmployees(result.data)
      else setError(personnelMessage(result.error.code))
    }).catch(() => { if (alive) setError('Не вдалося завантажити реєстр працівників. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [isRegistry, retry])
  const updateFromCard = useCallback((employee: EmployeeData) => {
    setView(current => current.kind === 'card' && current.id === employee.id && current.label !== fullName(employee) ?
      { ...current, label: fullName(employee) } : current)
  }, [])
  function saved(employee: EmployeeData) {
    setEmployees(current => current.some(value => value.id === employee.id) ? current.map(value => value.id === employee.id ? employee : value) : [...current, employee])
    setNotice(view.kind === 'create' ? 'Працівника створено. Початкове призначення збережено.' : 'Персональні відомості оновлено.')
    setView({ kind: 'card', id: employee.id, label: fullName(employee) })
  }
  return <div className="employees-workspace">
    {notice && <Alert variant="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
    {view.kind === 'registry' ? <EmployeeRegistry employees={employees} loading={loading} error={error}
      query={query} departmentId={departmentId} descending={descending} onQuery={setQuery} onDepartment={setDepartmentId}
      onSort={() => setDescending(value => !value)} onRetry={() => setRetry(value => value + 1)}
      onCreate={() => { setNotice(''); setView({ kind: 'create' }) }} onOpen={employee => { setNotice(''); setView({ kind: 'card', id: employee.id, label: fullName(employee) }) }} /> :
      view.kind === 'card' ? <EmployeeCard key={view.id} id={view.id} onBack={goList} onLoaded={updateFromCard}
        onEdit={employee => { setNotice(''); setView({ kind: 'edit', employee }) }} /> :
        <EmployeeForm key={view.kind === 'edit' ? view.employee.id : 'new'} employee={view.kind === 'edit' ? view.employee : undefined}
          navigationGuard={navigationGuard} onSaved={saved} onCancel={() => {
            if (!navigationGuard.current()) return
            if (view.kind === 'edit') setView({ kind: 'card', id: view.employee.id, label: fullName(view.employee) })
            else setView({ kind: 'registry' })
          }} />}
  </div>
}
