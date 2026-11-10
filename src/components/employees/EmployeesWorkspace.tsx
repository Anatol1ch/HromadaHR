import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { personnelMessage } from '../../employees/model'
import type { RegistryDirectories } from '../../employees/registry'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../../employees/workspace.ts'
import { notifySystemToast } from '../SystemToastHost'
import EmployeeRegistry from './EmployeeRegistry'
import EmployeeCard from './EmployeeCard'
import EmployeeForm from './EmployeeForm'
import EmployeeActionDialog from './EmployeeActionDialog'
import type { NavigationGuard } from './useUnsavedChanges'

export default function EmployeesWorkspace({ navigationGuard, onOpenLeave }: { onOpenLeave: (id: string) => void; navigationGuard: RefObject<NavigationGuard> }) {
  const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const [employees, setEmployees] = useState<EmployeeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [directories, setDirectories] = useState<RegistryDirectories>()
  const [directoriesLoading, setDirectoriesLoading] = useState(true)
  const [directoriesError, setDirectoriesError] = useState('')
  const [directoryRetry, setDirectoryRetry] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  const rememberOpener = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  const restoreOpener = () => requestAnimationFrame(() => {
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    else {
      const target = opener.current?.dataset.registryAction
      const replacement = target && document.getElementById(target)
      ;(replacement || document.getElementById('employees-title'))?.focus({ preventScroll: true })
    }
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
  useEffect(() => {
    let alive = true
    setDirectoriesLoading(true); setDirectoriesError('')
    const api = window.hromadaHR.personnel
    void Promise.all([api.getDictionary('department'), api.getDictionary('position')]).then(([department, position]) => {
      if (!alive) return
      if (!department.ok || !position.ok) {
        setDirectories(undefined)
        setDirectoriesError('Не вдалося завантажити порядок довідників.')
      } else setDirectories({ department: department.data.entries, position: position.data.entries })
    }).catch(() => {
      if (alive) { setDirectories(undefined); setDirectoriesError('Не вдалося завантажити порядок довідників.') }
    }).finally(() => { if (alive) setDirectoriesLoading(false) })
    return () => { alive = false }
  }, [retry, directoryRetry])
  const updateFromCard = useCallback((employee: EmployeeData) => {
    setEmployees(current => mergeEmployee(current, employee))
  }, [])
  function saved(employee: EmployeeData) {
    const created = workspace.form?.kind === 'create'
    setEmployees(current => mergeEmployee(current, employee))
    setDirectoryRetry(value => value + 1)
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
      directories={directories} directoriesLoading={directoriesLoading} directoriesError={directoriesError}
      onRetryDirectories={() => setDirectoryRetry(value => value + 1)}
      state={workspace.registry} onState={registry => dispatch({ type: 'registry', registry })}
      onClear={() => dispatch({ type: 'clearFilters' })} onRetry={() => setRetry(value => value + 1)}
      onCreate={() => { rememberOpener(); dispatch({ type: 'form', form: { kind: 'create' } }) }}
      onOpen={employee => { rememberOpener(); dispatch({ type: 'card', id: employee.id }) }}
      onEdit={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'edit', id: employee.id } }) }}
      onDelete={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'delete', id: employee.id } }) }}/>
    {workspace.cardId && <EmployeeCard onOpenLeave={id => navigationGuard.current(() => { dispatch({ type: 'card', id: null }); onOpenLeave(id) })} key={workspace.cardId} id={workspace.cardId} revision={workspace.revision} navigationGuard={navigationGuard}
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
