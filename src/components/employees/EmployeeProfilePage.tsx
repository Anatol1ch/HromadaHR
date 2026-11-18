import EmployeeDocuments from '../documents/EmployeeDocuments'
import type { EmployeeCardTab } from '../../../shared/personnel-control'
import { profileSections,profileSection,requestProfileSection } from '../../employees/profile'
import ProfileIndicatorPanel from '../seniority-ranks/ProfileIndicatorPanel'
import ServiceBaselinePanel from '../seniority-ranks/ServiceBaselinePanel'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { NavigationGuard } from './useUnsavedChanges'
import ProfileLeaveWorkbench from '../leave/ProfileLeaveWorkbench'
import { Award, BriefcaseBusiness, CalendarDays, Clock3, Pencil, Trash2, UserRound } from 'lucide-react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, personnelMessage } from '../../employees/model'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import { navigateTabs } from '../../lib/tabNavigation'

export default function EmployeeProfilePage({ id, onEdit, onLoaded, onDelete, revision, navigationGuard,initialTab='general',tabRequestId=0 }: {
  initialTab?:EmployeeCardTab;tabRequestId?:number
  id: string; revision: number; onDelete: (id: string) => void
  navigationGuard: RefObject<NavigationGuard>
  onEdit: (employee: EmployeeData) => void; onLoaded: (employee: EmployeeData) => void
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
  const sections = employee ? [
    {
      title: 'Персональні відомості',
      icon: UserRound,
      gridClass: 'employee-profile-personal-grid',
      fields: [
        ['Прізвище', employee.lastName],
        ['Ім’я', employee.firstName],
        ['По батькові', employee.middleName ?? 'Не зазначено'],
        ['Дата народження', displayDate(employee.birthDate)],
        ['Тип працівника', employeeTypeLabels[employee.employeeType]],
      ],
    },
    {
      title: 'Кадрові відомості',
      icon: BriefcaseBusiness,
      gridClass: employee.employeeType === 'official' ? 'employee-profile-official-grid' : 'employee-profile-staff-grid',
      fields: [
        ['Підрозділ', employee.department.name],
        ['Посада', employee.position.name],
        ...(employee.employeeType==='official' ? [['Категорія посади', employee.positionCategory ? `${employee.positionCategory} категорія` : 'Не зазначено']] : []),
        ['Дата прийняття', displayDate(employee.hireDate)],
        ['На поточній посаді з', employee.positionStartedOn ? displayDate(employee.positionStartedOn) : 'Не внесено'],
      ],
    },
  ] : []
  return <article className="employee-profile-page page-transition" aria-labelledby="employee-profile-title">
    <header className="employee-profile-header">
      <div className="employee-profile-avatar" aria-hidden="true"><UserRound size={23}/></div>
      <div className="employee-profile-identity">
        <h1 id="employee-profile-title" tabIndex={-1} ref={heading}>{employee&&!error?fullName(employee):'Особова картка'}</h1>
        {employee&&!error&&<p>{employee.position.name} <span aria-hidden="true">·</span> {employee.department.name}</p>}
      </div>
      {employee&&!error&&<div className="employee-profile-actions">
        <button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>{if(section==='service')setTab('general');onEdit(employee)})}><Pencil size={16} aria-hidden="true"/>Редагувати</button>
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
        <section key={id+':'+tabRequestId+':'+section} id={tabId+'-content'} className="employee-profile-content" role="tabpanel" tabIndex={0} aria-labelledby={tabId+'-'+section}>
          {section==='general'?<>
            {sections.map(({title,icon:Icon,gridClass,fields})=><InfoSection key={title} title={title} icon={<Icon size={17}/>}>
              <dl className={`info-grid employee-profile-info-grid ${gridClass}`}>{fields.map(([field,value])=><InfoItem key={field} label={field} value={value}/>)}</dl>
            </InfoSection>)}
            <EmployeeDocuments employeeId={id}/>
          </>:section==='service'?<>
            <ServiceBaselinePanel key={id} employeeId={id} navigationGuard={navigationGuard} onBusyChange={setBaselineBusy} onEditingChange={setBaselineEditing} refreshKey={allowanceRefresh} showConfirmedAllowance={false}/>
            <ProfileIndicatorPanel employee={employee} kind="allowance" navigationGuard={navigationGuard} disabled={baselineEditing||baselineBusy||loading} refreshKey={revision} onRefresh={()=>setAllowanceRefresh(v=>v+1)}/>
          </>
            :section==='rank'?<ProfileIndicatorPanel employee={employee} kind="rank" navigationGuard={navigationGuard} disabled={loading} refreshKey={revision}/>
            :<ProfileLeaveWorkbench key={id} employee={employee} navigationGuard={navigationGuard} revision={revision}/>}
        </section>
      </div>
    </>}
  </article>
}
