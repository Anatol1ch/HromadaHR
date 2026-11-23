import { useEffect, useReducer, useRef, useState, type RefObject } from 'react'
import { History, LayoutDashboard, Plus, ShieldCheck, Wallet } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { PeriodLeaveType } from '../../../shared/leave'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import Select from '../Select'
import LeaveOverview, { type LeaveOverviewData } from './LeaveOverview'
import LeaveBalances from './LeaveBalances'
import LeaveJournal from './LeaveJournal'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import LeaveRights from './LeaveRights'
import { initialLeaveWorkspaceState, leaveWorkspaceNavigation, type LeaveWorkspaceView } from './workbench-navigation'
import useAccountingDate from './useAccountingDate'
import { leaveWorkspaceLabels } from './presentation'
import { leaveRecordBelongsToEmployee, type LeaveJournalContext, type RegistrationHistory } from './registry'
import { notifySystemToast } from '../SystemToastHost'

type LoadedOverview = { key: string; data?: LeaveOverviewData; error?: string }
const leaveSections: { id: LeaveWorkspaceView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Зведення', icon: LayoutDashboard },
  { id: 'rights', label: 'Права', icon: ShieldCheck },
  { id: 'balances', label: 'Залишки та періоди', icon: Wallet },
  { id: 'history', label: 'Історія', icon: History },
]
const balanceOptions = (['annual_main', 'oms_service_additional', 'children_social_additional'] as const)
  .map(value => ({ value, label: leaveWorkspaceLabels[value] }))

/** Leave workspace with guarded in-place section navigation. */
export default function ProfileLeaveWorkbench({ employee, navigationGuard, revision }: {
  employee: EmployeeCard; navigationGuard: RefObject<NavigationGuard>; revision: number
}) {
  const employeeId = employee.id
  const [workspace, dispatchWorkspace] = useReducer(leaveWorkspaceNavigation, initialLeaveWorkspaceState)
  const { view, selectedType } = workspace
  const balanceType: PeriodLeaveType = selectedType && balanceOptions.some(option => option.value === selectedType)
    ? selectedType as PeriodLeaveType : 'annual_main'
  const [type, setType] = useState<PeriodLeaveType>('annual_main')
  const [localRevision, setLocalRevision] = useState(0)
  const refreshRevision = revision + localRevision
  const refresh = () => setLocalRevision(value => value + 1)
  const [creating, setCreating] = useState(false)
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
  const history: RegistrationHistory = {
    records: data?.records ?? [], error: current?.error ?? '', loading: !current, retry: refresh, suspended: context !== null,
    open: next => {
      if (next.employeeId !== employeeId) return
      setContext(next)
      dispatchWorkspace({ type: 'open-history', returnTo: view })
      refresh()
    },
  }
  function navigate(next: LeaveWorkspaceView) {
    navigationGuard.current(() => {
      if (next === 'balances' && view !== 'balances') dispatchWorkspace({ type: 'open-balances', leaveType: balanceType })
      else dispatchWorkspace({ type: 'navigate', view: next === 'history' ? 'overview' : next })
      if (next === 'history') dispatchWorkspace({ type: 'open-history', returnTo: view === 'history' ? workspace.historyReturn : view })
      requestAnimationFrame(() => heading.current?.focus())
    })
  }
  function chooseBalance(value: string) {
    const next = value as PeriodLeaveType
    navigationGuard.current(() => {
      dispatchWorkspace({ type: 'open-balances', leaveType: next })
      setType(next)
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
  const title = view === 'overview' ? 'Зведення' : leaveSections.find(section => section.id === view)?.label ?? 'Відпустки'
  const selectedStatus = data?.rights.find(right => right.leaveType === balanceType)?.status

  return <div className="profile-leave-workbench">
    <header className="profile-leave-toolbar">
      <h3 ref={heading} tabIndex={-1}><Wallet size={20} aria-hidden="true"/>Відпустки</h3>
      <button type="button" className="primary-button" disabled={creating} onClick={register}><Plus size={17} aria-hidden="true"/>Зареєструвати відпустку</button>
    </header>

    <div className="leave-workbench-layout">
      <nav className="leave-workbench-nav" aria-label="Розділи відпусток">
        {leaveSections.map(({ id, label, icon: Icon }) => <button type="button" key={id}
          className={view === id ? 'is-active' : undefined} aria-current={view === id ? 'page' : undefined}
          onClick={() => navigate(id)}><Icon size={18} aria-hidden="true"/><span>{label}</span></button>)}
      </nav>
      <div className="leave-workbench-content" aria-label={title}>
        <div className="leave-workbench-compact-select">
          <Select label="Розділ відпусток" value={view} options={leaveSections.map(({ id, label }) => ({ value: id, label }))}
            onChange={value => navigate(value as LeaveWorkspaceView)} advanceOnSelect={false}/>
        </div>
        {view === 'overview' && <LeaveOverview data={data} throughDate={throughDate} loading={!current} error={current?.error} onRetry={refresh}/>}
        {view === 'rights' && <LeaveRights employeeId={employeeId} navigationGuard={navigationGuard} onSaved={refresh}/>}
        {view === 'balances' && <>
          <section className="dashboard-panel leave-balance-selector" aria-label="Вибір виду відпустки">
            <Select label="Вид відпустки" value={balanceType} options={balanceOptions} onChange={chooseBalance} advanceOnSelect={false}/>
          </section>
          {current?.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{current.error}</Alert>}
          <LeaveBalances key={balanceType} employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate} type={balanceType}
            navigationGuard={navigationGuard} refreshRevision={refreshRevision} rightsReady={!!data?.rights}
            historicalOnly={selectedStatus === 'no_right'}/>
        </>}
        {view === 'history' && <>
          {current?.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{current.error}</Alert>}
          {!current && <DataState kind="loading" compact message="Завантаження історії…"/>}
          <LeaveJournal employeeId={employeeId} records={history.records} navigationGuard={navigationGuard} onChanged={refresh}
            history={history} context={context} onResume={() => { setContext(null); dispatchWorkspace({ type: 'resume-history' }); refresh() }}/>
        </>}
      </div>
    </div>

    {creating && <LeaveRegistrationForm employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate}
      initialType={type} navigationGuard={navigationGuard} history={history} returnFocus={opener.current}
      onClose={closeRegistration} onSaved={() => {
        closeRegistration()
        notifySystemToast('success', 'Відпустку зареєстровано', 'Історію та залишки оновлено.')
      }}/>}
  </div>
}
