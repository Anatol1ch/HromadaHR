import { useEffect,useRef,useState,type RefObject } from 'react'
import { Award, BadgePercent, CalendarDays, FileText, Layers, Percent, Plus, Pencil } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { Allowance,CurrentRank } from '../../../shared/seniority-ranks'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import type { Kind } from './model'
import { documentLabel,rankOriginLabel } from './model'
import { readIndicator } from './profile-indicators'
import FocusedIndicatorEditor from './FocusedIndicatorEditor'
import RankProjectionPanel from './RankProjectionPanel'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { ServiceDetailRow } from './ServiceProjectionView'
import { categoryRanks } from '../../../shared/rank-projection'

/** One target read, one shared editor, actual mutation replies; no employee overview scan. */
export default function ProfileIndicatorPanel({employee,kind,navigationGuard,disabled=false,refreshKey=0,onRefresh,onEditEmployee,projection=null}:{
 employee:EmployeeCard;kind:Kind;navigationGuard:RefObject<NavigationGuard>;disabled?:boolean;refreshKey?:number
 onRefresh?:()=>void
 onEditEmployee?:()=>void
 projection?:ServiceProjection|null
}) {
 const [state,setState]=useState<{key:string;value?:Allowance|CurrentRank|null;error?:string}>(),[retry,setRetry]=useState(0),[version,setVersion]=useState(0),[open,setOpen]=useState(false)
 const opener=useRef<HTMLButtonElement|null>(null)
 const key=JSON.stringify([employee.id,kind,refreshKey,retry]),current=state?.key===key?state:undefined
 useEffect(()=>{
  let active=true
  readIndicator(window.hromadaHR.seniorityRanks,employee.id,kind).then(result=>{if(active)setState(result.ok?{key,value:result.data}:{key,error:personnelMessage(result.error.code)})})
  return()=>{active=false}
 },[employee.id,kind,key])
 const value=current?.value,rank=kind==='rank'?value as CurrentRank|null|undefined:null,allowance=kind==='allowance'?value as Allowance|null|undefined:null
 const canSyncAllowance=Boolean(current&&!current.error&&allowance)
 const document=documentLabel(value??null)
 const categoryRange=employee.positionCategory?categoryRanks[employee.positionCategory]:null
 const rankCategoryStatus=!rank?'Поточний ранг не внесено':!categoryRange?'Категорію посади не зазначено':rank.origin==='pension_exception'?'Пенсійна підстава може передбачати ранг поза звичайним діапазоном':rank.rank<categoryRange[0]?rank.origin==='oms_retained'?'Ранг ОМС збережено за попереднім рішенням':rank.origin==='civil_service_equivalence'?'Ранг ураховано з державної служби':rank.origin==='oms_early'?'Перевірте межу категорії для дострокового присвоєння':'Вище звичайного діапазону':rank.rank>categoryRange.at(-1)!?rank.origin==='oms_early'?'Перевірте межу категорії для дострокового присвоєння':'Потрібно перевірити відповідність категорії':rank.origin==='oms_early'?'У межах категорії; присвоєно достроково':'У межах звичайного діапазону'
 const close=(reconcile=true)=>{
  setOpen(false)
  // Cancel/close also reconciles an operation whose transport result may be unknown; never touch its draft while open.
  if(reconcile){setRetry(v=>v+1);setVersion(v=>v+1);onRefresh?.()}
  requestAnimationFrame(()=>{if(!opener.current?.isConnected)window.document.getElementById('employee-profile-title')?.focus()})
 }
 return <>
  {kind==='allowance'?<InfoSection className={`service-info-panel service-tab-section service-tab-allowance${canSyncAllowance?' service-tab-sync-allowance':''}`} title="Надбавка за вислугу років" icon={<BadgePercent size={17}/>} action={current&&!current.error&&allowance&&<button ref={opener} type="button" className="secondary-button section-header-edit-button" disabled={disabled} onClick={()=>setOpen(true)}><Pencil size={15} aria-hidden="true"/>Редагувати надбавку</button>}>
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?<DataState kind="loading" compact message="Завантаження надбавки…"/>:allowance?<>
      <div className="service-allowance-primary">
        <strong>{allowance.status==='confirmed'?`${allowance.percentage}%`:'Не застосовується'}</strong>
        <span>{allowance.status==='confirmed'?'Підтверджено':'Не застосовується'}</span>
      </div>
      <dl className="service-detail-list service-detail-list-synchronized service-allowance-facts">
        <ServiceDetailRow icon={CalendarDays} label="Дата початку дії" value={allowance.status==='confirmed'&&allowance.effectiveOn?formatDate(allowance.effectiveOn):'Не застосовується'}/>
        <ServiceDetailRow icon={FileText} label="Документальна підстава" value={document||'Реквізити не зазначено'}/>
      </dl>
    </>:<div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Percent size={22} aria-hidden="true"/>} message="Підтверджену надбавку за вислугу не внесено."/><button ref={opener} type="button" className="primary-button service-empty-action-button" disabled={disabled} onClick={()=>setOpen(true)}><Plus size={17} aria-hidden="true"/>Внести надбавку</button></div>}
    {(projection?.comparison==='different'||disabled)&&<div className="service-allowance-extra-content">
      {projection?.comparison==='different'&&<Alert variant="warning">Розрахункова надбавка відрізняється від підтвердженої. Потрібна кадрова перевірка.</Alert>}
      {disabled&&<p className="employee-hint">Завершіть редагування стажу перед відкриттям надбавки.</p>}
    </div>}
   </InfoSection>
   :<div className="rank-tab-layout">
    <InfoSection className="service-info-panel service-tab-section rank-tab-panel rank-tab-current" title="Поточний ранг" icon={<Award size={17} aria-hidden="true"/>} action={current&&!current.error&&rank&&<button ref={opener} type="button" className="secondary-button section-header-edit-button" disabled={disabled} onClick={()=>setOpen(true)}><Pencil size={15} aria-hidden="true"/>Редагувати ранг</button>}>
     {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?<DataState kind="loading" compact message="Читання підтвердженого рангу…"/>:rank?<>
      <div className="service-current-summary rank-tab-primary"><div className="service-current-value"><strong>{`${rank.rank} ранг`}</strong></div></div>
      <dl className="service-detail-list rank-tab-details rank-tab-current-details">
       <ServiceDetailRow icon={CalendarDays} label="Дата присвоєння" value={formatDate(rank.assignedOn)}/>
       <ServiceDetailRow icon={Award} label="Походження рангу" value={rankOriginLabel(rank.origin)}/>
       <ServiceDetailRow icon={FileText} label="Документальна підстава" value={document||'Реквізити не зазначено'}/>
      </dl>
     </>:<div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Award size={22} aria-hidden="true"/>} message="Поточний ранг працівника не внесено"/><button ref={opener} type="button" className="primary-button service-empty-action-button" disabled={disabled} onClick={()=>setOpen(true)}><Plus size={17} aria-hidden="true"/>Внести ранг</button></div>}
    </InfoSection>
    <InfoSection className="service-info-panel service-tab-section rank-tab-panel rank-tab-category" title="Категорія посади" icon={<Layers size={17} aria-hidden="true"/>} action={<button type="button" className="secondary-button section-header-edit-button" disabled={disabled} onClick={onEditEmployee}><Pencil size={15} aria-hidden="true"/>Редагувати</button>}>
     <div className="service-current-summary rank-tab-primary"><div className={`service-current-value${employee.positionCategory?'':' service-metric-neutral'}`}><strong>{employee.positionCategory?`${employee.positionCategory} категорія`:'Категорію не зазначено'}</strong></div></div>
     <dl className="service-detail-list rank-tab-details rank-tab-category-details">
      <ServiceDetailRow icon={Layers} label="Звичайний діапазон рангів" value={categoryRange?categoryRange.join('–'):'Не визначено'}/>
      <ServiceDetailRow icon={Award} label="Відповідність категорії" value={rankCategoryStatus}/>
     </dl>
    </InfoSection>
    <RankProjectionPanel employeeId={employee.id} refreshKey={refreshKey+version}/>
   </div>}
  {open&&<FocusedIndicatorEditor key={employee.id+kind} employeeId={employee.id} kind={kind} navigationGuard={navigationGuard} returnFocus={opener.current} onClose={()=>close()} onSaved={(_,saved)=>{setState({key,value:saved});setVersion(v=>v+1);onRefresh?.();close(false)}}/>}
 </>
}
