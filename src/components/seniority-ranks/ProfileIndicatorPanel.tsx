import { useEffect,useRef,useState,type RefObject } from 'react'
import { BadgePercent, CalendarDays, FileText, Percent, Plus, Pencil } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { Allowance,CurrentRank } from '../../../shared/seniority-ranks'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import type { Kind } from './model'
import { documentLabel,rankOriginLabels } from './model'
import { readIndicator } from './profile-indicators'
import FocusedIndicatorEditor from './FocusedIndicatorEditor'
import RankProjectionPanel from './RankProjectionPanel'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { ServiceDetailRow } from './ServiceProjectionView'

/** One target read, one shared editor, actual mutation replies; no employee overview scan. */
export default function ProfileIndicatorPanel({employee,kind,navigationGuard,disabled=false,refreshKey=0,onRefresh,projection=null}:{
 employee:EmployeeCard;kind:Kind;navigationGuard:RefObject<NavigationGuard>;disabled?:boolean;refreshKey?:number
 onRefresh?:()=>void
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
 const document=documentLabel(value??null)
 const close=(reconcile=true)=>{
  setOpen(false)
  // Cancel/close also reconciles an operation whose transport result may be unknown; never touch its draft while open.
  if(reconcile){setRetry(v=>v+1);setVersion(v=>v+1);onRefresh?.()}
  requestAnimationFrame(()=>{if(!opener.current?.isConnected)window.document.getElementById('employee-profile-title')?.focus()})
 }
 return <>
  {kind==='allowance'?<InfoSection className="service-info-panel service-tab-section service-tab-allowance" title="Надбавка за вислугу років" icon={<BadgePercent size={17}/>} action={current&&!current.error&&allowance&&<button ref={opener} type="button" className="secondary-button" disabled={disabled} onClick={()=>setOpen(true)}><Pencil size={15} aria-hidden="true"/>Редагувати надбавку</button>}>
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?<DataState kind="loading" compact message="Завантаження надбавки…"/>:allowance?<div className="service-allowance-summary">
      <div className="service-allowance-primary">
        <strong>{allowance.status==='confirmed'?`${allowance.percentage}%`:'Не застосовується'}</strong>
        <span>{allowance.status==='confirmed'?'Підтверджено':'Не застосовується'}</span>
      </div>
      <dl className="service-allowance-facts">
        <ServiceDetailRow icon={CalendarDays} label="Дата початку дії" value={allowance.status==='confirmed'&&allowance.effectiveOn?formatDate(allowance.effectiveOn):'Не застосовується'}/>
        <ServiceDetailRow icon={FileText} label="Документальна підстава" value={document||'Реквізити не зазначено'}/>
      </dl>
    </div>:<div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Percent size={22} aria-hidden="true"/>} message="Підтверджену надбавку за вислугу не внесено."/><button ref={opener} type="button" className="primary-button service-empty-action-button" disabled={disabled} onClick={()=>setOpen(true)}><Plus size={17} aria-hidden="true"/>Внести надбавку</button></div>}
    {projection?.comparison==='different'&&<Alert variant="warning">Розрахункова надбавка відрізняється від підтвердженої. Потрібна кадрова перевірка.</Alert>}
    {disabled&&<p className="employee-hint">Завершіть редагування стажу перед відкриттям надбавки.</p>}
   </InfoSection>
   :<InfoSection title="Підтверджений поточний ранг" action={current&&!current.error&&value&&<button ref={opener} type="button" className="secondary-button" disabled={disabled} onClick={()=>setOpen(true)}>{value?'Редагувати ранг':'Внести ранг'}</button>}>
   {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?<DataState kind="loading" compact message="Читання підтвердженого показника…"/>:value?<>
    <strong className="seniority-value">{`${rank!.rank} ранг`}</strong>
    {rank&&<dl className="info-grid">
     <InfoItem label={rank.effectiveOn?'Дата присвоєння':'Присвоєно та діє з'} value={formatDate(rank.assignedOn)}/>
     {rank.effectiveOn&&<InfoItem label="Початок дії" value={formatDate(rank.effectiveOn)}/>}
     <InfoItem label="Походження рангу" value={rankOriginLabels[rank.origin]}/>
     {rank.reviewAnchorOn&&<InfoItem label="Підтверджена опорна дата" value={formatDate(rank.reviewAnchorOn)}/>}
     {rank.reviewOn&&<InfoItem label="Ручна контрольна дата" value={formatDate(rank.reviewOn)}/>}
     {rank.originNote&&<InfoItem label="Пояснення підстави" value={rank.originNote} wide/>}
    </dl>}
    {document&&<p className="seniority-document"><span>Документ-підстава</span><span>{document}</span></p>}
   </>:<DataState kind="empty" compact message="Поточний ранг не внесено."/>}
  </InfoSection>}
  {kind==='rank'&&<RankProjectionPanel employeeId={employee.id} refreshKey={refreshKey+version} showCurrent={false} showConfirmedDetails={false}/>}
  {open&&<FocusedIndicatorEditor key={employee.id+kind} employeeId={employee.id} kind={kind} navigationGuard={navigationGuard} returnFocus={opener.current} onClose={()=>close()} onSaved={(_,saved)=>{setState({key,value:saved});setVersion(v=>v+1);onRefresh?.();close(false)}}/>}
 </>
}
