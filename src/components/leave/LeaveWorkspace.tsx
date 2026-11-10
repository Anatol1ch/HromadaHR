import { navigateTabs } from '../../lib/tabNavigation'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { EmployeeLeaveRight, LeaveRecord, PeriodLeaveType } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import Select from '../Select'
import LeaveBalances from './LeaveBalances'
import EmployeeChooser from './EmployeeChooser'
import LeaveTypeNavigation from './LeaveTypeNavigation'
import LeaveJournal from './LeaveJournal'
import LeaveRights from './LeaveRights'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import { notifySystemToast } from '../SystemToastHost'
export default function LeaveWorkspace({navigationGuard,initialEmployeeId=''}:{navigationGuard:RefObject<NavigationGuard>;initialEmployeeId?:string}) {
  const navId=useId()
  const rightsTab = useRef<HTMLButtonElement>(null)
  const registerButton = useRef<HTMLElement | null>(null)
  const [periodType,setPeriodType]=useState<PeriodLeaveType>('annual_main')
  const [section,setSection]=useState<'journal'|'balances'|'rights'>(initialEmployeeId?'balances':'journal')
  const [employees,setEmployees]=useState<EmployeeCard[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [records,setRecords]=useState<LeaveRecord[]>([]),[recordsLoaded,setRecordsLoaded]=useState(false),[recordsError,setRecordsError]=useState(''),[revision,setRevision]=useState(0)
  const [selected,setSelected]=useState(initialEmployeeId),[creating,setCreating]=useState(false),[createEmployee,setCreateEmployee]=useState('')
  const [rightsRevision, setRightsRevision] = useState(0)
  const [rights, setRights] = useState<{ key: string; data?: EmployeeLeaveRight[]; error?: string }>()
  const rightsKey = JSON.stringify([selected, rightsRevision])
  useEffect(() => {
    if (section !== 'balances' || !selected) return
    let active = true
    void window.hromadaHR.leave.listRights(selected).then(result => {
      if (!active) return
      setRights(result.ok ? { key: rightsKey, data: result.data } : { key: rightsKey, error: personnelMessage(result.error.code) })
    }).catch(() => {
      if (active) setRights({ key: rightsKey, error: 'Не вдалося завантажити статуси прав.' })
    })
    return () => { active = false }
  }, [selected, section, rightsKey])
  const currentRights = rights?.key === rightsKey ? rights : undefined
  const rightStatus = currentRights?.data?.find(right => right.leaveType === periodType)?.status
  const noRight = rightStatus === 'no_right'
  const rightBadge = currentRights?.data && !noRight && <span className={'leave-right-status is-' + (rightStatus ?? 'unknown')}>
    {rightStatus === 'has_right' ? 'Право підтверджено' : 'Не перевірено'}
  </span>
  function openSection(value: typeof section) {
    setCreating(false)
    setSection(value)
  }
  const rightNotice = noRight && <Alert variant="info" className="leave-right-notice" action={<button type="button" className="secondary-button"
    onClick={() => navigationGuard.current(() => {
      openSection('rights')
      rightsTab.current?.focus()
    })}><ShieldCheck size={16} aria-hidden="true"/>Перевірити право</button>}>
    <strong>Право на цей вид відпустки відсутнє</strong>
    <span>Перед підтвердженням нового права перевірте його статус.</span>
  </Alert>
  const refreshRights = () => setRightsRevision(value => value + 1)
  useEffect(()=>{let active=true;void window.hromadaHR.personnel.listEmployees().then(result=>{if(!active)return;if(result.ok){setEmployees(result.data);setLoaded(true)}else setError(personnelMessage(result.error.code))}).catch(()=>{if(active)setError('Не вдалося завантажити працівників.')});return()=>{active=false}},[retry])
  useEffect(()=>{let active=true;setRecordsError('');void window.hromadaHR.leave.listRecords(null).then(result=>{if(!active)return;if(result.ok){setRecords(result.data);setRecordsLoaded(true)}else setRecordsError(personnelMessage(result.error.code))}).catch(()=>{if(active)setRecordsError('Не вдалося завантажити журнал.')});return()=>{active=false}},[revision])
  const employee=employees.find(p=>p.id===selected),person=employees.find(p=>p.id===createEmployee)
  const refresh=()=>setRevision(v=>v+1)
  const register=()=>{registerButton.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;setCreateEmployee('');setCreating(true)}
  return <div className="page-transition leave-workspace"><header className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Відпустки</h1></div></header>
    <nav className="settings-section-nav leave-section-nav" role="tablist" aria-label="Розділи відпусток" onKeyDown={navigateTabs}>{(['journal','balances','rights'] as const).map(value=><button key={value} ref={value === 'rights' ? rightsTab : undefined} id={navId+value} role="tab" aria-selected={section===value} aria-controls={navId+value+'-panel'} tabIndex={section===value?0:-1} className={'settings-section-current'+(section===value?' is-selected':'')} onClick={()=>navigationGuard.current(()=>openSection(value))}>{value==='journal'?'Журнал відпусток':value==='balances'?'Залишки відпусток':'Права на відпустки'}</button>)}</nav>
    {error&&<Alert variant="error" action={<button type="button" onClick={()=>{setError('');setRetry(v=>v+1)}}>Повторити</button>}>{error}</Alert>}
    <div id={navId+'journal-panel'} role="tabpanel" aria-labelledby={navId+'journal'} hidden={section!=='journal'}>
      {recordsError?<Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{recordsError}</Alert>:!recordsLoaded||!loaded?<DataState kind="loading" message="Завантаження журналу…"/>:<LeaveJournal records={records} employeeRows={employees} navigationGuard={navigationGuard} active={section==='journal'} onChanged={refresh} onRegister={register}/>}
    </div>
    {section!=='journal'&&<EmployeeChooser employees={employees} selected={selected} loading={!loaded} onSelect={(id,accepted)=>navigationGuard.current(()=>{setSelected(id);accepted()})}/>}
    <div id={navId+'balances-panel'} role="tabpanel" aria-labelledby={navId+'balances'} hidden={section!=='balances'}>
      {section === 'balances' && employee ? <div className="leave-balances-workbench">
        <LeaveTypeNavigation value={periodType} onChange={type => {
          if (type !== periodType) navigationGuard.current(() => { setPeriodType(type) })
        }}/>
        <div className="leave-balances-detail">
          {currentRights?.error && <Alert variant="error" action={<button type="button" onClick={refreshRights}>Повторити</button>}>{currentRights.error}</Alert>}
          <LeaveBalances key={employee.id + periodType} type={periodType}
            employeeId={employee.id} employeeName={fullName(employee)} hireDate={employee.hireDate} navigationGuard={navigationGuard}
            refreshRevision={revision} rightsReady={Boolean(currentRights?.data)} historicalOnly={noRight} rightBadge={rightBadge} rightNotice={rightNotice}/>
        </div>
      </div> : <DataState kind="empty" message="Оберіть працівника для роботи із залишками."/>}
    </div>
    <div id={navId+'rights-panel'} role="tabpanel" aria-labelledby={navId+'rights'} hidden={section!=='rights'}>{section==='rights'&&employee?<LeaveRights key={employee.id} employeeId={employee.id} records={records} navigationGuard={navigationGuard} onSaved={refreshRights}/>:<DataState kind="empty" message="Оберіть працівника для перевірки прав."/>}</div>
    {creating&&<LeaveRegistrationForm key={createEmployee||'new'} employeeId={person?.id??''} employeeName={person?fullName(person):undefined} hireDate={person?.hireDate??'0001-01-01'} initialType="annual_main" navigationGuard={navigationGuard} returnFocus={registerButton.current}
      employeePicker={<div className="recipient-field"><span>Працівник</span><Select label="Працівник для нової відпустки" required searchable value={createEmployee} options={employees.map(p=>({value:p.id,label:fullName(p)}))} advanceOnSelect={false} onChange={id=>navigationGuard.current(()=>setCreateEmployee(id))}/>{!employees.length&&<p>Додайте працівника до кадрового реєстру.</p>}</div>}
      onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);refresh();notifySystemToast('success','Відпустку зареєстровано','Дані оновлено.')}}/>}
  </div>
}
