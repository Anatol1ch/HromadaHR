import { navigateTabs } from '../../lib/tabNavigation'
import { useEffect, useId, useState, type RefObject } from 'react'
import type { LeaveRecord, PeriodLeaveType } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import SearchField from '../SearchField'
import Select from '../Select'
import LeaveBalances from './LeaveBalances'
import LeaveJournal from './LeaveJournal'
import LeaveRights from './LeaveRights'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import { notifySystemToast } from '../SystemToastHost'
export default function LeaveWorkspace({navigationGuard,initialEmployeeId=''}:{navigationGuard:RefObject<NavigationGuard>;initialEmployeeId?:string}) {
  const navId=useId()
  const [periodType,setPeriodType]=useState<PeriodLeaveType>('annual_main')
  const [section,setSection]=useState<'journal'|'balances'>(initialEmployeeId?'balances':'journal')
  const [employees,setEmployees]=useState<EmployeeCard[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [records,setRecords]=useState<LeaveRecord[]>([]),[recordsLoaded,setRecordsLoaded]=useState(false),[recordsError,setRecordsError]=useState(''),[revision,setRevision]=useState(0)
  const [selected,setSelected]=useState(initialEmployeeId),[query,setQuery]=useState(''),[creating,setCreating]=useState(false),[createEmployee,setCreateEmployee]=useState('')
  useEffect(()=>{let active=true;void window.hromadaHR.personnel.listEmployees().then(result=>{if(!active)return;if(result.ok){setEmployees(result.data);setLoaded(true)}else setError(personnelMessage(result.error.code))}).catch(()=>{if(active)setError('Не вдалося завантажити працівників.')});return()=>{active=false}},[retry])
  useEffect(()=>{let active=true;setRecordsError('');void window.hromadaHR.leave.listRecords(null).then(result=>{if(!active)return;if(result.ok){setRecords(result.data);setRecordsLoaded(true)}else setRecordsError(personnelMessage(result.error.code))}).catch(()=>{if(active)setRecordsError('Не вдалося завантажити журнал.')});return()=>{active=false}},[revision])
  const employee=employees.find(p=>p.id===selected),person=employees.find(p=>p.id===createEmployee)
  const choices=employees.filter(p=>fullName(p).toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk').trim()))
  const refresh=()=>setRevision(v=>v+1)
  const register=()=>{setCreateEmployee(selected);setCreating(true)}
  function balances(id:string){setSelected(id);setSection('balances')}
  return <div className="page-transition leave-workspace"><header className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Відпустки</h1></div></header>
    <nav className="settings-section-nav leave-section-nav" role="tablist" aria-label="Розділи відпусток" onKeyDown={navigateTabs}>{(['journal','balances'] as const).map(value=><button key={value} id={navId+value} role="tab" aria-selected={section===value} aria-controls={navId+value+'-panel'} tabIndex={section===value?0:-1} className={'settings-section-current'+(section===value?' is-selected':'')} onClick={()=>navigationGuard.current(()=>setSection(value))}>{value==='journal'?'Журнал відпусток':'Залишки відпусток'}</button>)}</nav>
    {error&&<Alert variant="error" action={<button type="button" onClick={()=>{setError('');setRetry(v=>v+1)}}>Повторити</button>}>{error}</Alert>}
    <div id={navId+'journal-panel'} role="tabpanel" aria-labelledby={navId+'journal'} hidden={section!=='journal'}>
      {recordsError?<Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{recordsError}</Alert>:!recordsLoaded||!loaded?<DataState kind="loading" message="Завантаження журналу…"/>:<LeaveJournal records={records} employeeRows={employees} navigationGuard={navigationGuard} active={section==='journal'} onChanged={refresh} onRegister={register} onBalances={balances}/>}
    </div>
    <div id={navId+'balances-panel'} role="tabpanel" aria-labelledby={navId+'balances'} hidden={section!=='balances'}><div className="leave-balance-workspace">
      <aside className="dashboard-panel leave-person-picker"><h2>Працівники</h2><SearchField label="Пошук працівника" placeholder="Прізвище, ім’я" value={query} onChange={setQuery}/><div className="leave-person-list">{choices.map(p=><button type="button" key={p.id} aria-pressed={selected===p.id} onClick={()=>navigationGuard.current(()=>setSelected(p.id))}><strong>{fullName(p)}</strong><small>{p.position.name} · {p.department.name}</small></button>)}{loaded&&!choices.length&&<p>Працівників не знайдено.</p>}</div></aside>
      <main className="leave-person-content">{section==='balances'&&employee?<><header className="leave-person-context"><h2>{fullName(employee)}</h2><p>{employee.position.name} · {employee.department.name}</p></header><LeaveRights key={'rights'+employee.id} employeeId={employee.id} records={records} navigationGuard={navigationGuard} onPeriods={setPeriodType}/><LeaveBalances selectedType={periodType} onTypeChange={setPeriodType} key={employee.id} employeeId={employee.id} employeeName={fullName(employee)} hireDate={employee.hireDate} navigationGuard={navigationGuard} showJournal={false} showRegister={false} refreshRevision={revision}/></>:<DataState kind="empty" message="Оберіть працівника зі списку" description="Тут з’являться його права, залишки та періоди."/>}</main>
    </div></div>
    {creating&&<LeaveRegistrationForm key={createEmployee||'new'} employeeId={person?.id??''} employeeName={person?fullName(person):undefined} hireDate={person?.hireDate??'0001-01-01'} initialType="annual_main" navigationGuard={navigationGuard}
      employeePicker={<div className="recipient-field"><span>Працівник</span><Select label="Працівник для нової відпустки" required searchable value={createEmployee} options={employees.map(p=>({value:p.id,label:fullName(p)}))} advanceOnSelect={false} onChange={id=>navigationGuard.current(()=>setCreateEmployee(id))}/>{!employees.length&&<p>Додайте працівника до кадрового реєстру.</p>}</div>}
      onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);refresh();notifySystemToast('success','Відпустку зареєстровано','Дані оновлено.')}} onBalances={()=>{setCreating(false);if(person)balances(person.id)}}/>}
  </div>
}
