import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { personnelMessage } from '../../employees/model'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../../employees/workspace.ts'
import { notifySystemToast } from '../SystemToastHost'
import EmployeeRegistry from './EmployeeRegistry'
import EmployeeCard from './EmployeeCard'
import EmployeeForm from './EmployeeForm'
import EmployeeActionDialog from './EmployeeActionDialog'
import type { NavigationGuard } from './useUnsavedChanges'

export default function EmployeesWorkspace({ navigationGuard }: { navigationGuard: RefObject<NavigationGuard> }) {
  const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const [employees, setEmployees] = useState<EmployeeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  const rememberOpener = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  const restoreOpener = () => requestAnimationFrame(() => {
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    else document.getElementById('employees-title')?.focus({ preventScroll: true })
  })
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void window.hromadaHR.personnel.listEmployees().then(result => {
      if (!alive) return
      if (result.ok) setEmployees(result.data)
      else setError(personnelMessage(result.error.code))
    }).catch(() => { if (alive) setError('Не вдалося завантажити реєстр працівників. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [retry])
  const updateFromCard = useCallback((employee: EmployeeData) => {
    setEmployees(current => mergeEmployee(current, employee))
  }, [])
  function saved(employee: EmployeeData) {
    const created = workspace.form?.kind === 'create'
    setEmployees(current => mergeEmployee(current, employee))
    notifySystemToast('success', 'Збережено', created ? 'Працівника створено.' : 'Відомості працівника оновлено.')
    dispatch({ type: 'saved', employee, created })
    if (!created && !workspace.cardId) restoreOpener()
  }
  function deleted(id: string) {
    setEmployees(current => current.filter(employee => employee.id !== id))
    dispatch({ type: 'deleted', id })
    notifySystemToast('success', 'Працівника видалено', 'Особову картку видалено.')
    restoreOpener()
  }
  return <div className="employees-workspace page-transition">
    <EmployeeRegistry employees={employees} loading={loading} error={error}
      state={workspace.registry} onState={registry => dispatch({ type: 'registry', registry })}
      onSort={(employeeType, key) => dispatch({ type: 'sort', employeeType, key })} onResetSort={() => dispatch({ type: 'resetSort' })}
      onClear={() => dispatch({ type: 'clearFilters' })} onRetry={() => setRetry(value => value + 1)}
      onCreate={() => { rememberOpener(); dispatch({ type: 'form', form: { kind: 'create' } }) }}
      onOpen={employee => { rememberOpener(); dispatch({ type: 'card', id: employee.id }) }}
      onEdit={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'edit', id: employee.id } }) }}
      onDelete={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'delete', id: employee.id } }) }}/>
    {workspace.cardId && <EmployeeCard key={workspace.cardId} id={workspace.cardId} revision={workspace.revision} navigationGuard={navigationGuard}
      onLoaded={updateFromCard}
      onClose={() => { dispatch({ type: 'card', id: null }); restoreOpener() }}
      onEdit={employee => dispatch({ type: 'form', form: { kind: 'edit', employee } })}
      onDelete={id => dispatch({ type: 'action', action: { kind: 'delete', id } })}/>}
    {workspace.form && <EmployeeForm employee={workspace.form.kind === 'edit' ? workspace.form.employee : undefined}
        navigationGuard={navigationGuard} onSaved={saved} onCancel={() => { dispatch({ type: 'form', form: null }); if (!workspace.cardId) restoreOpener() }}/>}
    {workspace.action && <EmployeeActionDialog key={workspace.action.id + workspace.action.kind} {...workspace.action} navigationGuard={navigationGuard}
      onClose={() => { dispatch({ type: 'action', action: null }); if (!workspace.cardId) restoreOpener() }} onSaved={saved} onDeleted={deleted}/>}
  </div>
}
