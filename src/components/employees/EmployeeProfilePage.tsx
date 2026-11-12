import type { EmployeeCardTab } from '../../../shared/personnel-control'
import { profileSections,profileSection,requestProfileSection } from '../../employees/profile'
import ProfileIndicatorPanel from '../seniority-ranks/ProfileIndicatorPanel'
import ServiceBaselinePanel from '../seniority-ranks/ServiceBaselinePanel'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { NavigationGuard } from './useUnsavedChanges'
import LeaveOverview from '../leave/LeaveOverview'
import type { LeaveNavigationIntent } from '../leave/navigation'
import { ArrowLeft, BriefcaseBusiness, Pencil, Trash2, UserRound } from 'lucide-react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { displayDate, employeeTypeLabels, fullName, personnelMessage } from '../../employees/model'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'

export default function EmployeeProfilePage({ id, onClose, onEdit, onLoaded, onDelete, revision, onOpenLeave, navigationGuard,initialTab='general',tabRequestId=0 }: {
  initialTab?:EmployeeCardTab;tabRequestId?:number
  onOpenLeave: (intent: LeaveNavigationIntent) => void; id: string; revision: number; onClose: () => void; onDelete: (id: string) => void
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
  const close=()=>navigationGuard.current(onClose)
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
      fields: [
        ['Підрозділ', employee.department.name],
        ['Посада', employee.position.name],
        ['Дата прийняття', displayDate(employee.hireDate)],
        ['Дата призначення на поточну посаду', employee.positionStartedOn ? displayDate(employee.positionStartedOn) : 'Не внесено'],
        ...(employee.employeeType==='official' ? [['Категорія посади', employee.positionCategory ? `${employee.positionCategory} категорія` : 'Не зазначено']] : []),
      ],
    },
  ] : []
  return <article className="employee-profile-page page-transition" aria-labelledby="employee-profile-title">
    <div className="employee-profile-context">
      <p className="employee-hint">Працівники / Особова картка</p>
      <button type="button" className="secondary-button" disabled={baselineBusy} onClick={close}><ArrowLeft size={16} aria-hidden="true"/>До списку працівників</button>
    </div>
    <header className="employee-profile-header">
      <div className="employee-profile-avatar" aria-hidden="true"><UserRound size={23}/></div>
      <div className="employee-profile-identity">
        <h1 id="employee-profile-title" tabIndex={-1} ref={heading}>{employee&&!error?fullName(employee):'Особова картка'}</h1>
        {employee&&!error&&<><p>{employee.position.name} <span aria-hidden="true">·</span> {employee.department.name}</p>
          <p className="employee-hint">{employeeTypeLabels[employee.employeeType]}{employee.employeeType==='official'?` · ${employee.positionCategory?employee.positionCategory+' категорія':'Категорію не зазначено'}`:''}</p></>}
      </div>
      {employee&&!error&&<button className="secondary-button" type="button" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>{if(section==='service')setTab('general');onEdit(employee)})}><Pencil size={16} aria-hidden="true"/>Редагувати</button>}
    </header>
    {loading&&!employee?<DataState kind="loading" message="Завантаження особової картки…"/>:error||!employee?
      <Alert variant="error" action={<button type="button" onClick={()=>setRetry(value=>value+1)}>Повторити завантаження</button>}>{error||'Картка недоступна.'}</Alert>:<>
      {loading&&<p className="employee-hint" role="status">Оновлення відомостей…</p>}
      <div className="employee-profile-layout">
        <nav className="settings-section-nav employee-profile-nav" aria-label="Розділи особової картки">
          {profileSections(employee.employeeType).map(item=><button type="button" key={item.id}
            className={`settings-section-current${section===item.id?' is-selected':''}`} aria-current={section===item.id?'page':undefined}
            aria-controls={tabId+'-content'} disabled={baselineBusy} onClick={()=>requestProfileSection(section,item.id,employee.employeeType,navigationGuard.current,setTab)}>{item.label}</button>)}
        </nav>
        <section key={id+':'+tabRequestId+':'+section} id={tabId+'-content'} className="employee-profile-content" aria-labelledby={tabId+'-heading'}>
          <h2 id={tabId+'-heading'} className="employee-profile-section-title">{profileSections(employee.employeeType).find(item=>item.id===section)?.label}</h2>
          {section==='general'?<>
            {sections.map(({title,icon:Icon,fields})=><InfoSection key={title} title={title} icon={<Icon size={17}/>}>
              <dl className="info-grid">{fields.map(([field,value])=><InfoItem key={field} label={field} value={value}/>)}</dl>
            </InfoSection>)}
            <div><button type="button" className="secondary-button danger-action" disabled={loading||baselineBusy} onClick={()=>navigationGuard.current(()=>onDelete(id))}><Trash2 size={16} aria-hidden="true"/>Видалити працівника</button></div>
          </>:section==='service'?<>
            <ServiceBaselinePanel key={id} employeeId={id} navigationGuard={navigationGuard} onBusyChange={setBaselineBusy} onEditingChange={setBaselineEditing} refreshKey={allowanceRefresh} showConfirmedAllowance={false}/>
            <ProfileIndicatorPanel employee={employee} kind="allowance" navigationGuard={navigationGuard} disabled={baselineEditing||baselineBusy||loading} refreshKey={revision} onRefresh={()=>setAllowanceRefresh(v=>v+1)}/>
          </>
            :section==='rank'?<ProfileIndicatorPanel employee={employee} kind="rank" navigationGuard={navigationGuard} disabled={loading} refreshKey={revision}/>
            :<LeaveOverview onOpen={destination=>onOpenLeave({...destination,employeeId:id})} employeeId={id} revision={revision}/>}
        </section>
      </div>
    </>}
  </article>
}
