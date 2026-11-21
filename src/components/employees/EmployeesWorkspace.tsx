import type { EmployeeNavigationIntent,EmployeeCardTab } from '../../../shared/personnel-control'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { personnelMessage } from '../../employees/model'
import type { RegistryDirectories } from '../../employees/registry'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../../employees/workspace.ts'
import { notifySystemToast } from '../SystemToastHost'
import EmployeeRegistry from './EmployeeRegistry'
import EmployeeProfilePage from './EmployeeProfilePage'
import EmployeeForm from './EmployeeForm'
import EmployeeActionDialog from './EmployeeActionDialog'
import type { NavigationGuard } from './useUnsavedChanges'

function profileBreadcrumbName(employee:EmployeeData) {
  const first=Array.from(employee.firstName.trim())[0]??''
  const middle=employee.middleName?.trim()?` ${Array.from(employee.middleName.trim())[0]}.`:''
  return `${employee.lastName} ${first}.${middle}`
}

export default function EmployeesWorkspace({ navigationGuard,initialIntent,onIntentHandled,profileReturnRequest=0,onProfileContextChange,onReturnToRegistry }: { initialIntent?:EmployeeNavigationIntent;onIntentHandled?:()=>void; navigationGuard: RefObject<NavigationGuard>; profileReturnRequest?:number; onProfileContextChange?:(label:string|undefined)=>void;onReturnToRegistry:()=>void }) {
  const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspace)
  const [employees, setEmployees] = useState<EmployeeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [directories, setDirectories] = useState<RegistryDirectories>()
  const [directoriesLoading, setDirectoriesLoading] = useState(true)
  const [directoriesError, setDirectoriesError] = useState('')
  const [directoryRetry, setDirectoryRetry] = useState(0)
  const [cardTab,setCardTab]=useState<EmployeeCardTab>('general'),[cardRequest,setCardRequest]=useState(0)
  useEffect(()=>{
    if(!initialIntent)return
    onProfileContextChange?.('Особова картка')
    setCardTab(initialIntent.tab);setCardRequest(value=>value+1)
    dispatch({type:'card',id:initialIntent.employeeId});onIntentHandled?.()
  },[initialIntent,onIntentHandled,onProfileContextChange])
  const opener = useRef<HTMLElement | null>(null)
  const registryScroll=useRef(0)
  const rememberOpener = () => { registryScroll.current=window.scrollY;opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  const restoreOpener = () => requestAnimationFrame(() => {
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    else {
      const target = opener.current?.dataset.registryAction
      const replacement = target && document.getElementById(target)
      ;(replacement || document.getElementById('employees-title'))?.focus({ preventScroll: true })
    }
    window.scrollTo({top:registryScroll.current})
  })
  const handledReturn = useRef(profileReturnRequest)
  useEffect(()=>{
    if(handledReturn.current===profileReturnRequest)return
    handledReturn.current=profileReturnRequest
    if(workspace.cardId){onProfileContextChange?.(undefined);dispatch({type:'card',id:null});dispatch({type:'form',form:null});dispatch({type:'action',action:null});restoreOpener()}
  },[profileReturnRequest,workspace.cardId])
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
  const profileLoaded=useCallback((employee:EmployeeData)=>{
    updateFromCard(employee)
    onProfileContextChange?.(profileBreadcrumbName(employee))
  },[onProfileContextChange,updateFromCard])
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
    onProfileContextChange?.(undefined)
    notifySystemToast('success', 'Працівника видалено', 'Особову картку видалено.')
    restoreOpener()
  }
  return <div className="employees-workspace page-transition">
    <div hidden={!!workspace.cardId}><EmployeeRegistry employees={employees} loading={loading} error={error}
      directories={directories} directoriesLoading={directoriesLoading} directoriesError={directoriesError}
      onRetryDirectories={() => setDirectoryRetry(value => value + 1)}
      state={workspace.registry} onState={registry => dispatch({ type: 'registry', registry })}
      onClear={() => dispatch({ type: 'clearFilters' })} onRetry={() => setRetry(value => value + 1)}
      onCreate={() => { rememberOpener();setCardTab('general'); dispatch({ type: 'form', form: { kind: 'create' } }) }}
      onOpen={employee => navigationGuard.current(()=>{ rememberOpener();onProfileContextChange?.('Особова картка');setCardTab('general');setCardRequest(v=>v+1); dispatch({ type: 'card', id: employee.id }) })}
      onEdit={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'edit', id: employee.id } }) }}
      onDelete={employee => { rememberOpener(); dispatch({ type: 'action', action: { kind: 'delete', id: employee.id } }) }}/></div>
    {workspace.cardId && <EmployeeProfilePage initialTab={cardTab} tabRequestId={cardRequest} key={workspace.cardId} id={workspace.cardId} revision={workspace.revision} navigationGuard={navigationGuard}
      onReturnToRegistry={onReturnToRegistry}
      onLoaded={profileLoaded}
      onEdit={(employee, mode) => dispatch({ type: 'form', form: { kind: 'edit', employee, mode } })}
      onDelete={id => dispatch({ type: 'action', action: { kind: 'delete', id } })}/>}
    {workspace.form && <EmployeeForm employee={workspace.form.kind === 'edit' ? workspace.form.employee : undefined} mode={workspace.form.kind === 'edit' ? workspace.form.mode : 'all'}
        navigationGuard={navigationGuard} onSaved={saved} onCancel={() => { dispatch({ type: 'form', form: null }); if (!workspace.cardId) restoreOpener() }}/>}
    {workspace.action && <EmployeeActionDialog key={workspace.action.id + workspace.action.kind} {...workspace.action} navigationGuard={navigationGuard}
      onClose={() => { dispatch({ type: 'action', action: null }); if (!workspace.cardId) restoreOpener() }} onSaved={saved} onDeleted={deleted}/>}
  </div>
}
