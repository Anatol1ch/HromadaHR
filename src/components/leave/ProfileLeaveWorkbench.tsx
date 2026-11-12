import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, History, Plus, ShieldCheck } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { isPeriodLeave, type EmployeeLeaveRight, type LeaveRecord, type LeaveType } from '../../../shared/leave'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import { notifySystemToast } from '../SystemToastHost'
import LeaveOverview from './LeaveOverview'
import LeaveRights from './LeaveRights'
import LeaveBalances from './LeaveBalances'
import LeaveEventAccounting from './LeaveEventAccounting'
import LeaveJournal from './LeaveJournal'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import { accountingYears } from './usage'
import useAccountingDate from './useAccountingDate'
import { leaveLabels, rightLabels } from './presentation'
import { leaveRecordBelongsToEmployee, type LeaveJournalContext, type RegistrationHistory } from './registry'

type View = 'overview' | 'detail' | 'rights' | 'history'

/** Fixed employee context; all mutations remain in the existing leave editors. */
export default function ProfileLeaveWorkbench({ employee, navigationGuard, revision }: {
  employee: EmployeeCard; navigationGuard: RefObject<NavigationGuard>; revision: number
}) {
  const employeeId = employee.id
  const [view, setView] = useState<View>('overview')
  const [type, setType] = useState<LeaveType>('annual_main')
  const [chosenYear, setChosenYear] = useState('')
  const [localRevision, setLocalRevision] = useState(0)
  const refreshRevision = revision + localRevision
  const refresh = () => setLocalRevision(value => value + 1)
  const [creating, setCreating] = useState(false)
  const [context, setContext] = useState<LeaveJournalContext | null>(null)
  const historyReturn = useRef<View>('overview')
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const { throughDate } = useAccountingDate()
  const [records, setRecords] = useState<{ key: string; data?: LeaveRecord[]; error?: string }>()
  const [rights, setRights] = useState<{ key: string; data?: EmployeeLeaveRight[]; error?: string }>()
  const readKey = JSON.stringify([employeeId, refreshRevision, throughDate])

  useEffect(() => {
    let active = true
    void window.hromadaHR.leave.listRecords(employeeId).then(result => {
      if (active) setRecords(result.ok ? { key: readKey, data: result.data.filter(record => leaveRecordBelongsToEmployee(record, employeeId)) }
        : { key: readKey, error: personnelMessage(result.error.code) })
    }).catch(() => { if (active) setRecords({ key: readKey, error: 'Не вдалося завантажити історію відпусток.' }) })
    void window.hromadaHR.leave.listRights(employeeId).then(result => {
      if (active) setRights(result.ok ? { key: readKey, data: result.data }
        : { key: readKey, error: personnelMessage(result.error.code) })
    }).catch(() => { if (active) setRights({ key: readKey, error: 'Не вдалося завантажити права на відпустки.' }) })
    return () => { active = false }
  }, [employeeId, readKey])

  const currentRecords = records?.key === readKey ? records : undefined
  const currentRights = rights?.key === readKey ? rights : undefined
  const history: RegistrationHistory = {
    records: currentRecords?.data ?? [], error: currentRecords?.error ?? '',
    loading: !currentRecords, retry: refresh, suspended: context !== null,
    open: next => {
      if (next.employeeId !== employeeId) return
      historyReturn.current = view
      setContext(next)
      setView('history')
      refresh()
    },
  }
  const currentYear = throughDate.slice(0, 4)
  const years = accountingYears(history.records, employeeId, currentYear)
  const calendar = { years, year: years.includes(chosenYear) ? chosenYear : currentYear,
    onYear: (year: string) => navigationGuard.current(() => setChosenYear(year)) }
  const status = currentRights?.data?.find(right => right.leaveType === type)?.status ?? 'unknown'
  const badge = currentRights?.data ? <span className={'leave-right-status is-' + status}>{rightLabels[status]}</span> : null

  function changeView(next: View, nextType?: LeaveType) {
    navigationGuard.current(() => {
      setCreating(false)
      setContext(null)
      if (nextType) setType(nextType)
      setView(next)
      requestAnimationFrame(() => heading.current?.focus())
    })
  }
  function register() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    navigationGuard.current(() => {
      // Leaving rights/detail unmounts any explicitly discarded inline draft.
      setView('overview')
      setContext(null)
      setCreating(true)
    })
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
  const title = view === 'detail' ? leaveLabels[type] : view === 'rights' ? 'Права на відпустки'
    : view === 'history' ? 'Історія відпусток' : 'Огляд відпусток'

  return <div className="profile-leave-workbench">
    <div className="profile-leave-toolbar">
      <h3 ref={heading} tabIndex={-1}>{title}</h3>
      <div className="leave-accounting-actions">
        {view !== 'overview' && <button type="button" className="secondary-button" onClick={() => changeView('overview')}><ArrowLeft size={16}/>До огляду відпусток</button>}
        {view !== 'rights' && <button type="button" className="secondary-button" onClick={() => changeView('rights')}><ShieldCheck size={16}/>Права на відпустки</button>}
        {view !== 'history' && <button type="button" className="secondary-button" onClick={() => changeView('history')}><History size={16}/>Історія відпусток</button>}
        <button type="button" className="primary-button" disabled={creating || context !== null} onClick={register}><Plus size={17}/>Зареєструвати відпустку</button>
      </div>
    </div>
    {view === 'overview' && <LeaveOverview employeeId={employeeId} revision={refreshRevision} onOpen={destination =>
      changeView(destination.section === 'rights' ? 'rights' : 'detail', destination.section === 'balances' ? destination.type ?? type : undefined)}/>}
    {view === 'rights' && <LeaveRights employeeId={employeeId} navigationGuard={navigationGuard} onSaved={refresh}/>}
    {view === 'detail' && <>
      {currentRights?.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{currentRights.error}</Alert>}
      {!currentRights && <DataState kind="loading" compact message="Завантаження прав…"/>}
      {isPeriodLeave(type) ? <LeaveBalances key={type} employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate}
        type={type} navigationGuard={navigationGuard} refreshRevision={refreshRevision} rightsReady={!!currentRights?.data}
        historicalOnly={status === 'no_right'} rightBadge={badge}/>
        : <LeaveEventAccounting employeeId={employeeId} type={type} calendar={calendar} history={history} right={badge}
          noRight={status === 'no_right'} showLimit={!!currentRights?.data && status !== 'no_right'}
          actions={<button type="button" className="secondary-button" onClick={() => changeView('history')}>Переглянути історію</button>}/>}
    </>}
    {view === 'history' && <>
      {history.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{history.error}</Alert>}
      {history.loading && <DataState kind="loading" compact message="Завантаження історії…"/>}
      <LeaveJournal employeeId={employeeId} records={history.records} navigationGuard={navigationGuard} onChanged={refresh}
        history={history} context={context} onResume={() => { setContext(null); setView(historyReturn.current) }}/>
    </>}
    {/* Keep this instance mounted while history.suspended hides its modal. */}
    {creating && <LeaveRegistrationForm employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate}
      initialType={type} navigationGuard={navigationGuard} history={history} returnFocus={opener.current}
      onClose={closeRegistration} onSaved={() => {
        closeRegistration()
        notifySystemToast('success', 'Відпустку зареєстровано', 'Історію та залишки оновлено.')
      }}/>}
  </div>
}
