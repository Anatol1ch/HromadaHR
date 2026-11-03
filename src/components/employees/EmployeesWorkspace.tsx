import type { NavigationGuard } from './useUnsavedChanges'
import AssignmentForm from './AssignmentForm'
import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { Assignment, EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import { notifySystemToast } from '../SystemToastHost'
import EmployeeRegistry from './EmployeeRegistry'
import EmployeeCard from './EmployeeCard'
import EmployeeForm from './EmployeeForm'

export interface EmployeeBreadcrumb { label: string; onBack: () => void }
type View = { kind: 'registry' } | { kind: 'create' } |
  { kind: 'card'; id: string; label: string } | { kind: 'edit'; employee: EmployeeData } | { kind: 'assignment'; employee: EmployeeData; assignment?: Assignment }
export default function EmployeesWorkspace({ navigationGuard, onBreadcrumb }: {
  navigationGuard: RefObject<NavigationGuard>
  onBreadcrumb: (value: EmployeeBreadcrumb | null) => void
}) {
  const [view, setView] = useState<View>({ kind: 'registry' })
  const [employees, setEmployees] = useState<EmployeeData[]>([])
  const [query, setQuery] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [descending, setDescending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const isRegistry = view.kind === 'registry'
  const goList = useCallback(() => {
    navigationGuard.current(() => setView({ kind: 'registry' }))
  }, [navigationGuard])
  const label = view.kind === 'create' ? 'Новий працівник' : view.kind === 'card' ? view.label :
    view.kind === 'edit' ? `Редагування: ${fullName(view.employee)}` : view.kind === 'assignment' ? `Історія: ${fullName(view.employee)}` : ''
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
    setEmployees(current => current.map(value => value.id === employee.id ? employee : value))
    setView(current => current.kind === 'card' && current.id === employee.id && current.label !== fullName(employee) ?
      { ...current, label: fullName(employee) } : current)
  }, [])
  function saved(employee: EmployeeData) {
    setEmployees(current => current.some(value => value.id === employee.id) ? current.map(value => value.id === employee.id ? employee : value) : [...current, employee])
    notifySystemToast('success', 'Збережено', view.kind === 'create' ? 'Працівника створено. Початкове призначення збережено.' : view.kind === 'assignment' ? 'Історію призначень оновлено.' : 'Персональні відомості оновлено.')
    setView({ kind: 'card', id: employee.id, label: fullName(employee) })
  }
  function cancelForm() {
    navigationGuard.current(() => {
    if (view.kind === 'edit' || view.kind === 'assignment') setView({ kind: 'card', id: view.employee.id, label: fullName(view.employee) })
    else setView({ kind: 'registry' })
    })
  }
  return <div className="employees-workspace page-transition">
    {view.kind === 'registry' ? <EmployeeRegistry employees={employees} loading={loading} error={error}
      query={query} departmentId={departmentId} descending={descending} onQuery={setQuery} onDepartment={setDepartmentId}
      onSort={() => setDescending(value => !value)} onRetry={() => setRetry(value => value + 1)}
      onCreate={() => { setView({ kind: 'create' }) }} onOpen={employee => { setView({ kind: 'card', id: employee.id, label: fullName(employee) }) }} /> :
      view.kind === 'card' ? <EmployeeCard key={view.id} id={view.id} onBack={goList} onLoaded={updateFromCard} navigationGuard={navigationGuard}
        onAssign={(employee, assignment) => { setView({ kind: 'assignment', employee, assignment }) }}
        onDeleted={id => { setEmployees(current => current.filter(employee => employee.id !== id)); notifySystemToast('success', 'Працівника видалено', 'Особову картку та всю історію призначень видалено.'); setView({ kind: 'registry' }) }}
        onEdit={employee => { setView({ kind: 'edit', employee }) }} /> :
        view.kind === 'assignment' ? <AssignmentForm key={view.assignment?.id ?? 'new-assignment'} employee={view.employee} assignment={view.assignment}
          navigationGuard={navigationGuard} onCancel={cancelForm} onSaved={saved} /> : <EmployeeForm key={view.kind === 'edit' ? view.employee.id : 'new'} employee={view.kind === 'edit' ? view.employee : undefined}
          navigationGuard={navigationGuard} onSaved={saved} onCancel={cancelForm} />}
  </div>
}
