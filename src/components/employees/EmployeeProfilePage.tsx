import EmployeeDocuments from '../documents/EmployeeDocuments'
import type { EmployeeCardTab } from '../../../shared/personnel-control'
import { profileSections,profileSection,requestProfileSection } from '../../employees/profile'
import ProfileIndicatorPanel from '../seniority-ranks/ProfileIndicatorPanel'
import ServiceAccountingPanel from '../seniority-ranks/ServiceAccountingPanel'
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { NavigationGuard } from './useUnsavedChanges'
import ProfileLeaveWorkbench from '../leave/ProfileLeaveWorkbench'
import { ArrowLeft, Award, BriefcaseBusiness, Building2, CalendarCheck, CalendarClock, CalendarDays, Clock3, ContactRound, Landmark, Layers, Pencil, Trash2, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, personnelMessage } from '../../employees/model'
import type { EmployeeFormMode } from '../../employees/model'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { navigateTabs } from '../../lib/tabNavigation'

type EmployeeInformationField = { label: string; value: ReactNode; icon: LucideIcon; date?: boolean }

function EmployeeInformationPanel({ title, icon: SectionIcon, fields, action }: { title: string; icon: LucideIcon; fields: EmployeeInformationField[]; action: ReactNode }) {
  return <InfoSection title={title} icon={<SectionIcon size={17}/>} action={action}>
    <dl className="employee-information-list">
      {fields.map(({ label, value, icon: FieldIcon, date }) => <div key={label} className={`employee-information-row${date ? ' employee-information-row-date' : ''}`}>
        <span className="employee-information-row-icon" aria-hidden="true"><FieldIcon size={17}/></span>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>)}
    </dl>
  </InfoSection>
}

export default function EmployeeProfilePage({ id, onEdit, onLoaded, onDelete, onReturnToRegistry, revision, navigationGuard,initialTab='general',tabRequestId=0 }: {
  initialTab?:EmployeeCardTab;tabRequestId?:number
  id: string; revision: number; onDelete: (id: string) => void;onReturnToRegistry:()=>void
  navigationGuard: RefObject<NavigationGuard>
  onEdit: (employee: EmployeeData, mode: EmployeeFormMode) => void; onLoaded: (employee: EmployeeData) => void
}) {
  const [data, setData] = useState<EmployeeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<EmployeeCardTab>(initialTab)
  useEffect(()=>setTab(initialTab),[id,initialTab,tabRequestId])
  const [baselineBusy,setBaselineBusy]=useState(false)
  const [baselineEditing,setBaselineEditing]=useState(false),[allowanceRefresh,setAllowanceRefresh]=useState(0)
  const tabId = useId()
  const heading=useRef<HTMLHeadingElement>(null),focused=useRef('')
  useEffect(()=>{
    const request=id+':'+tabRequestId
    if(!loading&&focused.current!==request&&heading.current){focused.current=request;heading.current.focus()}
  },[id,tabRequestId,loading])
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void window.hromadaHR.personnel.getEmployee(id).then(result => {
      if (!alive) return
      if (!result.ok) setError(personnelMessage(result.error.code))
      else {
        setData(result.data)
        setTab(current=>profileSection(current,result.data.employeeType))
        onLoaded(result.data)
      }
    }).catch(() => { if (alive) setError('Не вдалося завантажити особову картку. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, retry, revision, tabRequestId, onLoaded])

  const employee = data
  const section=employee?profileSection(tab,employee.employeeType):initialTab
  const personalFields: EmployeeInformationField[] = employee ? [
    { label: 'Прізвище', value: employee.lastName, icon: ContactRound },
    { label: 'Ім’я', value: employee.firstName, icon: UserRound },
    { label: 'По батькові', value: employee.middleName ?? 'Не зазначено', icon: UserRound },
    { label: 'Дата народження', value: displayDate(employee.birthDate), icon: CalendarDays, date: true },
    { label: 'Тип працівника', value: employeeTypeLabels[employee.employeeType], icon: employee.employeeType === 'official' ? Landmark : UserRound },
  ] : []
  const employmentFields: EmployeeInformationField[] = employee ? [
    { label: 'Підрозділ', value: employee.department.name, icon: Building2 },
    { label: 'Посада', value: employee.position.name, icon: BriefcaseBusiness },
    ...(employee.employeeType === 'official' ? [{ label: 'Категорія посади', value: employee.positionCategory ? `${employee.positionCategory} категорія` : 'Не зазначено', icon: Layers }] : []),
    { label: 'Дата прийняття', value: displayDate(employee.hireDate), icon: CalendarCheck, date: true },
    { label: 'На поточній посаді з', value: employee.positionStartedOn ? displayDate(employee.positionStartedOn) : 'Не внесено', icon: CalendarClock, date: true },
  ] : []
  return <article className="employee-profile-page page-transition" aria-labelledby="employee-profile-title">
    <header className="employee-profile-header">
      <button className="employee-profile-return" type="button" aria-label="До списку працівників" title="До списку працівників" onClick={onReturnToRegistry}><ArrowLeft size={22} aria-hidden="true"/></button>
      <span className="employee-profile-return-separator" aria-hidden="true"/>
      <div className="employee-profile-avatar" aria-hidden="true"><UserRound size={22}/></div>
      <div className="employee-profile-identity">
        <h1 id="employee-profile-title" tabIndex={-1} ref={heading}>{employee&&!error?fullName(employee):'Особова картка'}</h1>
        {employee&&!error&&<p>{employee.position.name} <span aria-hidden="true">·</span> {employee.department.name}</p>}
      </div>
      {employee&&!error&&<div className="employee-profile-actions">
        <button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>{if(section==='service')setTab('general');onEdit(employee,'all')})}><Pencil size={16} aria-hidden="true"/>Редагувати</button>
        <button className="secondary-button danger-action" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>onDelete(id))}><Trash2 size={16} aria-hidden="true"/>Видалити</button>
      </div>}
    </header>
    {loading&&!employee?<DataState kind="loading" message="Завантаження особової картки…"/>:error||!employee?
      <Alert variant="error" action={<button type="button" onClick={()=>setRetry(value=>value+1)}>Повторити завантаження</button>}>{error||'Картка недоступна.'}</Alert>:<>
      {loading&&<p className="employee-hint" role="status">Оновлення відомостей…</p>}
      <div className="employee-profile-layout">
        <nav className="settings-section-nav employee-profile-nav" role="tablist" aria-label="Розділи особової картки" onKeyDown={navigateTabs}>
          {profileSections(employee.employeeType).map(item=>{
            const Icon=item.id==='general'?UserRound:item.id==='service'?Clock3:item.id==='rank'?Award:CalendarDays
            return <button type="button" key={item.id} id={tabId+'-'+item.id} role="tab" aria-selected={section===item.id} tabIndex={section===item.id?0:-1}
              className={`settings-section-current${section===item.id?' is-selected':''}`} aria-controls={tabId+'-content'}
              disabled={baselineBusy} onClick={()=>requestProfileSection(section,item.id,employee.employeeType,navigationGuard.current,setTab)}><Icon size={17} aria-hidden="true"/><span>{item.label}</span></button>
          })}
        </nav>
        <section key={id+':'+tabRequestId+':'+section} id={tabId+'-content'} className={`employee-profile-content${section === 'general' ? ' employee-profile-general-content' : ''}`} role="tabpanel" tabIndex={0} aria-labelledby={tabId+'-'+section}>
          {section==='general'?<>
            <div className={`employee-information-panels${employee.employeeType === 'official' ? ' employee-information-panels-synchronized' : ''}`}>
              <EmployeeInformationPanel title="Персональні відомості" icon={UserRound} fields={personalFields} action={<button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>onEdit(employee,'personal'))}><Pencil size={16} aria-hidden="true"/>Редагувати</button>}/>
              <EmployeeInformationPanel title="Кадрові відомості" icon={BriefcaseBusiness} fields={employmentFields} action={<button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>onEdit(employee,'employment'))}><Pencil size={16} aria-hidden="true"/>Редагувати</button>}/>
            </div>
            <EmployeeDocuments employeeId={id}/>
          </>:section==='service'?<ServiceAccountingPanel key={id} employeeId={id} hireDate={employee.hireDate} navigationGuard={navigationGuard} onBusyChange={setBaselineBusy} onEditingChange={setBaselineEditing} onAccountingChanged={()=>setAllowanceRefresh(v=>v+1)} refreshKey={allowanceRefresh} allowanceExtraContent={baselineEditing||baselineBusy||loading}
            renderAllowancePanel={({value})=><ProfileIndicatorPanel employee={employee} kind="allowance" navigationGuard={navigationGuard} disabled={baselineEditing||baselineBusy||loading} refreshKey={revision} onRefresh={()=>setAllowanceRefresh(v=>v+1)} projection={value}/>}/>
            :section==='rank'?<ProfileIndicatorPanel employee={employee} kind="rank" navigationGuard={navigationGuard} disabled={loading} refreshKey={revision}/>
            :<ProfileLeaveWorkbench key={id} employee={employee} navigationGuard={navigationGuard} revision={revision}/>}
        </section>
      </div>
    </>}
  </article>
}
