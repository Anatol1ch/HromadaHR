import { useEffect, useReducer, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { isPeriodLeave, type LeaveType, type PeriodLeaveType } from '../../../shared/leave'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import { notifySystemToast } from '../SystemToastHost'
import LeaveOverview, { type LeaveOverviewData } from './LeaveOverview'
import LeaveBalances from './LeaveBalances'
import LeaveJournal from './LeaveJournal'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import LeaveRightModal from './LeaveRightModal'
import { initialLeaveWorkspaceState, leaveWorkspaceNavigation } from './workbench-navigation'
import useAccountingDate from './useAccountingDate'
import { leaveWorkspaceLabels } from './presentation'
import { leaveRecordBelongsToEmployee, type LeaveJournalContext, type RegistrationHistory } from './registry'

type LoadedOverview = { key: string; data?: LeaveOverviewData; error?: string }

/** Main leave workspace; domain mutations stay in the existing leave components. */
export default function ProfileLeaveWorkbench({ employee, navigationGuard, revision }: {
  employee: EmployeeCard; navigationGuard: RefObject<NavigationGuard>; revision: number
}) {
  const employeeId = employee.id
  const [workspace, dispatchWorkspace] = useReducer(leaveWorkspaceNavigation, initialLeaveWorkspaceState)
  const { view, selectedType } = workspace
  const [type, setType] = useState<LeaveType>('annual_main')
  const [localRevision, setLocalRevision] = useState(0)
  const refreshRevision = revision + localRevision
  const refresh = () => setLocalRevision(value => value + 1)
  const [creating, setCreating] = useState(false)
  const [rightType, setRightType] = useState<LeaveType | null>(null)
  const [context, setContext] = useState<LeaveJournalContext | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const { throughDate } = useAccountingDate()
  const [loaded, setLoaded] = useState<LoadedOverview>()
  const readKey = JSON.stringify([employeeId, refreshRevision, throughDate])

  useEffect(() => {
    let active = true
    setLoaded(undefined)
    async function load() {
      try {
        const api = window.hromadaHR.leave
        const [balances, records, rights, ...proposals] = await Promise.all([
          api.getBalances(employeeId), api.listRecords(employeeId), api.listRights(employeeId),
          ...(['annual_main', 'oms_service_additional', 'children_social_additional'] as const).map(type => api.proposePeriods(employeeId, throughDate, type)),
        ] as const)
        if (!active) return
        if (!balances.ok) { setLoaded({ key: readKey, error: personnelMessage(balances.error.code) }); return }
        if (!records.ok) { setLoaded({ key: readKey, error: personnelMessage(records.error.code) }); return }
        if (!rights.ok) { setLoaded({ key: readKey, error: personnelMessage(rights.error.code) }); return }
        const failedProposal = proposals.find(result => !result.ok)
        if (failedProposal && !failedProposal.ok) { setLoaded({ key: readKey, error: personnelMessage(failedProposal.error.code) }); return }
        setLoaded({ key: readKey, data: {
          balances: balances.data,
          records: records.data.filter(record => leaveRecordBelongsToEmployee(record, employeeId)),
          rights: rights.data,
          proposals: proposals.flatMap(result => result.ok ? result.data : []),
        } })
      } catch {
        if (active) setLoaded({ key: readKey, error: 'Не вдалося завантажити відомості про відпустки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, readKey, throughDate])

  const current = loaded?.key === readKey ? loaded : undefined
  const data = current?.data
  const currentRecords = data?.records ?? []
  const history: RegistrationHistory = {
    records: currentRecords, error: current?.error ?? '', loading: !current, retry: refresh, suspended: context !== null,
    open: next => {
      if (next.employeeId !== employeeId) return
      setContext(next)
      dispatchWorkspace({ type: 'open-history', returnTo: view })
      refresh()
    },
  }
  function openHistory() {
    navigationGuard.current(() => {
      dispatchWorkspace({ type: 'open-history', returnTo: view })
      requestAnimationFrame(() => heading.current?.focus())
    })
  }
  function register() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    navigationGuard.current(() => setCreating(true))
  }
  function closeRegistration() {
    setCreating(false)
    setContext(null)
    refresh()
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
      else heading.current?.focus()
    })
  }
  function returnToOverview() {
    navigationGuard.current(() => {
      refresh()
      dispatchWorkspace({ type: 'return-to-overview' })
      requestAnimationFrame(() => heading.current?.focus())
    })
  }
  function openBalances(selected: PeriodLeaveType) {
    navigationGuard.current(() => {
      dispatchWorkspace({ type: 'open-balances', leaveType: selected })
      setType(selected)
      requestAnimationFrame(() => heading.current?.focus())
    })
  }
  const title = view === 'history' ? 'Історія відпусток'
    : view === 'balances' && selectedType ? leaveWorkspaceLabels[selectedType] : 'Відпустки'
  const selectedStatus = data?.rights.find(right => right.leaveType === selectedType)?.status
  const rightBadge = selectedType && selectedStatus
    ? <span className={'leave-right-status is-' + selectedStatus}>{selectedStatus === 'has_right' ? 'Право підтверджено' : 'Права немає'}</span>
    : null

  return <div className="profile-leave-workbench">
    <div className="profile-leave-toolbar" role="group" aria-label={title}>
      <h3 ref={heading} tabIndex={-1}>{title}</h3>
      <div className="leave-accounting-actions">
        {view === 'overview' && <>
          <button type="button" className="primary-button" disabled={creating} onClick={register}><Plus size={17} aria-hidden="true"/>Зареєструвати відпустку</button>
        </>}
        {view === 'history' && <button type="button" className="secondary-button" onClick={returnToOverview}><ArrowLeft size={16} aria-hidden="true"/>До огляду відпусток</button>}
        {view === 'balances' && <button type="button" className="secondary-button" onClick={returnToOverview}><ArrowLeft size={16} aria-hidden="true"/>До відомостей про відпустку</button>}
      </div>
    </div>

    {view === 'overview' && <LeaveOverview data={data} throughDate={throughDate} loading={!current} error={current?.error} onRetry={refresh}
      onOpenBalances={openBalances} onEditRight={setRightType} onOpenHistory={openHistory}/ >}

    {view === 'balances' && selectedType && isPeriodLeave(selectedType) && <>
      {current?.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{current.error}</Alert>}
      <LeaveBalances employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate} type={selectedType}
        navigationGuard={navigationGuard} refreshRevision={refreshRevision} rightsReady={!!data?.rights}
        historicalOnly={selectedStatus === 'no_right'} rightBadge={rightBadge}/>
    </>}

    {view === 'history' && <>
      {current?.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{current.error}</Alert>}
      {!current && <DataState kind="loading" compact message="Завантаження історії…"/>}
      <LeaveJournal employeeId={employeeId} records={history.records} navigationGuard={navigationGuard} onChanged={refresh}
        history={history} context={context} onResume={() => { setContext(null); dispatchWorkspace({ type: 'resume-history' }); refresh() }}/>
    </>}

    {rightType && <LeaveRightModal employee={employee} type={rightType} navigationGuard={navigationGuard}
      onClose={() => setRightType(null)} onSaved={refresh}/>}

    {creating && <LeaveRegistrationForm employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate}
      initialType={type} navigationGuard={navigationGuard} history={history} returnFocus={opener.current}
      onClose={closeRegistration} onSaved={() => {
        closeRegistration()
        notifySystemToast('success', 'Відпустку зареєстровано', 'Історію та залишки оновлено.')
      }}/>}
  </div>
}
