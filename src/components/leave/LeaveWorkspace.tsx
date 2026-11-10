import { navigateTabs } from '../../lib/tabNavigation'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { History, ShieldCheck } from 'lucide-react'
import { isPeriodLeave, type EmployeeLeaveRight, type LeaveRecord, type LeaveType } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import Select from '../Select'
import LeaveBalances from './LeaveBalances'
import EmployeeChooser from './EmployeeChooser'
import LeaveTypeNavigation, { type AccountingView } from './LeaveTypeNavigation'
import LeaveAccountingOverview from './LeaveAccountingOverview'
import LeaveEventAccounting from './LeaveEventAccounting'
import useAccountingDate from './useAccountingDate'
import { accountingYears } from './usage'
import LeaveJournal from './LeaveJournal'
import LeaveRights from './LeaveRights'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import { notifySystemToast } from '../SystemToastHost'
import { leaveLabels, rightLabels } from './presentation'
import { initialLeaveNavigation, type LeaveNavigationIntent, type LeaveSection } from './navigation'
import type { LeaveJournalContext, RegistrationHistory } from './registry'
export default function LeaveWorkspace({navigationGuard,initialIntent}:{navigationGuard:RefObject<NavigationGuard>;initialIntent?:LeaveNavigationIntent}) {
  const navId=useId()
  const [initial] = useState(() => initialLeaveNavigation(initialIntent))
  const pendingFocus = useRef(initialIntent?.section)
  const accountingPanel = useRef<HTMLDivElement>(null)
  const rightsPanel = useRef<HTMLDivElement>(null)
  const rightsTab = useRef<HTMLButtonElement>(null)
  const registerButton = useRef<HTMLElement | null>(null)
  const accountingTab = useRef<HTMLButtonElement>(null)
  const accountingDetail = useRef<HTMLDivElement>(null)
  const [accountingView, setAccountingView] = useState<AccountingView>(initial.accountingView)
  const [chosenYear, setChosenYear] = useState('')
  const { throughDate } = useAccountingDate()
  const [section,setSection]=useState<LeaveSection>(initial.section)
  const [employees,setEmployees]=useState<EmployeeCard[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [records,setRecords]=useState<LeaveRecord[]>([]),[recordsLoaded,setRecordsLoaded]=useState(false),[recordsError,setRecordsError]=useState(''),[revision,setRevision]=useState(0)
  const [recordsRevision, setRecordsRevision] = useState(-1)
  const [selected,setSelected]=useState(initial.selected),[creating,setCreating]=useState(false),[createEmployee,setCreateEmployee]=useState('')
  const [rightsRevision, setRightsRevision] = useState(0)
  const [journalContext, setJournalContext] = useState<LeaveJournalContext | null>(null)
  const [accountingContext, setAccountingContext] = useState<LeaveJournalContext | null>(null)
  const [rights, setRights] = useState<{ key: string; data?: EmployeeLeaveRight[]; error?: string }>()
  const employee=employees.find(p=>p.id===selected),person=employees.find(p=>p.id===createEmployee)
  const employeeId = employee?.id
  const missingEmployee = loaded && !!selected && !employee
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    if (section !== target) { pendingFocus.current = undefined; return }
    if (!loaded && !error) return
    pendingFocus.current = undefined
    const panel = target === 'rights' ? rightsPanel.current : accountingDetail.current ?? accountingPanel.current
    panel?.focus()
  }, [section, loaded, error])
  const rightsKey = JSON.stringify([selected, rightsRevision])
  useEffect(() => {
    if (section !== 'balances' || !employeeId) return
    let active = true
    void window.hromadaHR.leave.listRights(employeeId).then(result => {
      if (!active) return
      setRights(result.ok ? { key: rightsKey, data: result.data } : { key: rightsKey, error: personnelMessage(result.error.code) })
    }).catch(() => {
      if (active) setRights({ key: rightsKey, error: 'Не вдалося завантажити статуси прав.' })
    })
    return () => { active = false }
  }, [employeeId, section, rightsKey])
  const currentRights = rights?.key === rightsKey ? rights : undefined
  const statusFor = (type: LeaveType) => currentRights?.data?.find(right => right.leaveType === type)?.status ?? 'unknown'
  const rightFor = (type: LeaveType) => {
    if (!currentRights?.data) return currentRights?.error ? null : <small className="leave-muted">Завантаження права…</small>
    const status = statusFor(type)
    return <span className={'leave-right-status is-' + status}>{rightLabels[status]}</span>
  }
  function openSection(value: typeof section) {
    setCreating(false)
    setJournalContext(null)
    setAccountingContext(null)
    setSection(value)
  }
  function changeAccountingView(view: AccountingView, fromCard = false) {
    if (view === accountingView) return
    navigationGuard.current(() => {
      setAccountingView(view)
      if (fromCard) requestAnimationFrame(() => accountingDetail.current?.focus())
    })
  }
  const checkRight = <button type="button" className="secondary-button"
    onClick={() => navigationGuard.current(() => {
      openSection('rights')
      rightsTab.current?.focus()
    })}><ShieldCheck size={16} aria-hidden="true"/>Перевірити права</button>
  function accountingActions(type: LeaveType) {
    return <div className="leave-accounting-actions">
      {checkRight}
      <button type="button" className="secondary-button" onClick={() => navigationGuard.current(() => {
        openSection('journal')
        setAccountingContext({ employeeId: selected, type, year: isPeriodLeave(type) ? '' : calendar.year })
      })}><History size={16} aria-hidden="true"/>Переглянути в журналі</button>
    </div>
  }
  const refreshRights = () => setRightsRevision(value => value + 1)
  useEffect(()=>{let active=true;void window.hromadaHR.personnel.listEmployees().then(result=>{if(!active)return;if(result.ok){setEmployees(result.data);setLoaded(true)}else setError(personnelMessage(result.error.code))}).catch(()=>{if(active)setError('Не вдалося завантажити працівників.')});return()=>{active=false}},[retry])
  useEffect(() => {
    let active = true
    void window.hromadaHR.leave.listRecords(null).then(result => {
      if (!active) return
      if (result.ok) { setRecords(result.data); setRecordsLoaded(true); setRecordsError('') }
      else setRecordsError(personnelMessage(result.error.code))
    }).catch(() => { if (active) setRecordsError('Не вдалося завантажити журнал.') })
      .finally(() => { if (active) setRecordsRevision(revision) })
    return () => { active = false }
  }, [revision])
  const refresh=()=>setRevision(v=>v+1)
  const currentYear = throughDate.slice(0, 4)
  const years = accountingYears(records, selected, currentYear)
  const calendar = { year: years.includes(chosenYear) ? chosenYear : currentYear, years, onYear: setChosenYear }
  const loadingRecords = recordsRevision !== revision
  const history: RegistrationHistory = {
    records, error: loadingRecords ? '' : recordsError, loading: loadingRecords, retry: refresh,
    open: context => { setJournalContext(context); refresh() }, suspended: journalContext !== null || section !== 'journal',
  }
  const register=()=>{registerButton.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;setCreateEmployee('');setCreating(true)}
  return <div className="page-transition leave-workspace"><header className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Відпустки</h1></div></header>
    <nav className="settings-section-nav leave-section-nav" role="tablist" aria-label="Розділи відпусток" onKeyDown={navigateTabs}>{(['journal','balances','rights'] as const).map(value=><button key={value} ref={value === 'rights' ? rightsTab : value === 'balances' ? accountingTab : undefined} id={navId+value} role="tab" aria-selected={section===value} aria-controls={navId+value+'-panel'} tabIndex={section===value?0:-1} className={'settings-section-current'+(section===value?' is-selected':'')} onClick={()=>{if(value!==section)navigationGuard.current(()=>openSection(value))}}>{value==='journal'?'Журнал відпусток':value==='balances'?'Облік відпусток':'Права на відпустки'}</button>)}</nav>
    {error&&<Alert variant="error" action={<button type="button" onClick={()=>{setError('');setRetry(v=>v+1)}}>Повторити</button>}>{error}</Alert>}
    <div id={navId+'journal-panel'} role="tabpanel" aria-labelledby={navId+'journal'} hidden={section!=='journal'}>
      {history.error && <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{history.error}</Alert>}
      {(journalContext || accountingContext) && loadingRecords && <DataState kind="loading" compact message="Оновлення журналу…"/>}
      {recordsLoaded && loaded ? <LeaveJournal records={records} employeeRows={employees} navigationGuard={navigationGuard}
        active={section==='journal'} onChanged={refresh} onRegister={register} history={history} context={journalContext ?? accountingContext} fromAccounting={!!accountingContext && !journalContext}
        onResume={() => { if (journalContext) setJournalContext(null); else navigationGuard.current(() => { openSection('balances'); accountingTab.current?.focus() }) }}/> : !history.error && <DataState kind="loading" message="Завантаження журналу…"/>}
    </div>
    {section!=='journal'&&<EmployeeChooser employees={employees} selected={selected} loading={!loaded} onSelect={id=>{if(id!==selected)navigationGuard.current(()=>setSelected(id))}}/>}
    <div ref={accountingPanel} tabIndex={-1} id={navId+'balances-panel'} role="tabpanel" aria-labelledby={navId+'balances'} hidden={section!=='balances'}>
      {section === 'balances' && employee ? <div className="leave-balances-workbench">
        <LeaveTypeNavigation value={accountingView} onChange={changeAccountingView}/>
        <div ref={accountingDetail} tabIndex={-1} role="region" aria-label={accountingView === 'overview' ? 'Усі види відпусток' : leaveLabels[accountingView]} className="leave-balances-detail">
          {currentRights?.error && <Alert variant="error" action={<button type="button" onClick={refreshRights}>Повторити</button>}>{currentRights.error}</Alert>}
          {accountingView === 'overview' ? <LeaveAccountingOverview key={employee.id} employeeId={employee.id}
            calendar={calendar} history={history} rightFor={rightFor} isHistorical={type => statusFor(type) === 'no_right'}
            onDetails={type => changeAccountingView(type, true)}/>
            : isPeriodLeave(accountingView) ? <>
              {accountingActions(accountingView)}
              <LeaveBalances key={employee.id + accountingView} type={accountingView}
                employeeId={employee.id} employeeName={fullName(employee)} hireDate={employee.hireDate} navigationGuard={navigationGuard}
                refreshRevision={revision} rightsReady={Boolean(currentRights?.data)} historicalOnly={statusFor(accountingView) === 'no_right'}
                rightBadge={rightFor(accountingView)}/>
            </> : <LeaveEventAccounting type={accountingView} employeeId={employee.id} calendar={calendar}
              history={history} right={rightFor(accountingView)} noRight={statusFor(accountingView) === 'no_right'} showLimit={Boolean(currentRights?.data) && statusFor(accountingView) !== 'no_right'} actions={accountingActions(accountingView)}/>}
        </div>
      </div> : <DataState kind="empty" message={missingEmployee ? 'Працівник недоступний. Оберіть працівника для перегляду обліку.' : 'Оберіть працівника для перегляду обліку.'}/>}
    </div>
    <div ref={rightsPanel} tabIndex={-1} id={navId+'rights-panel'} role="tabpanel" aria-labelledby={navId+'rights'} hidden={section!=='rights'}>{section==='rights'&&employee?<LeaveRights key={employee.id} employeeId={employee.id} navigationGuard={navigationGuard} onSaved={refreshRights}/>:<DataState kind="empty" message={missingEmployee ? 'Працівник недоступний. Оберіть працівника для перевірки прав.' : 'Оберіть працівника для перевірки прав.'}/>}</div>
    {creating&&<LeaveRegistrationForm key={createEmployee||'new'} employeeId={person?.id??''} employeeName={person?fullName(person):undefined} hireDate={person?.hireDate??'0001-01-01'} initialType="annual_main" navigationGuard={navigationGuard} returnFocus={registerButton.current} history={history}
      employeePicker={<div className="recipient-field"><span>Працівник</span><Select label="Працівник для нової відпустки" required searchable value={createEmployee} options={employees.map(p=>({value:p.id,label:fullName(p)}))} advanceOnSelect={false} onChange={id=>navigationGuard.current(()=>setCreateEmployee(id))}/>{!employees.length&&<p>Додайте працівника до кадрового реєстру.</p>}</div>}
      onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);refresh();notifySystemToast('success','Відпустку зареєстровано','Дані оновлено.')}}/>}
  </div>
}
