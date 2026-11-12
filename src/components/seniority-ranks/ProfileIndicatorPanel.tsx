import { useEffect,useRef,useState,type RefObject } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { Allowance,CurrentRank } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import type { Kind } from './model'
import { allowanceLabel,documentLabel,rankOriginLabels } from './model'
import { readIndicator } from './profile-indicators'
import FocusedIndicatorEditor from './FocusedIndicatorEditor'
import RankProjectionPanel from './RankProjectionPanel'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'

/** One target read, one shared editor, actual mutation replies; no employee overview scan. */
export default function ProfileIndicatorPanel({employee,kind,navigationGuard,disabled=false,refreshKey=0,onRefresh}:{
 employee:EmployeeCard;kind:Kind;navigationGuard:RefObject<NavigationGuard>;disabled?:boolean;refreshKey?:number
 onRefresh?:()=>void
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
  <InfoSection title={kind==='allowance'?'Підтверджена надбавка за вислугу':'Підтверджений поточний ранг'} action={current&&!current.error&&<button ref={opener} type="button" className="secondary-button" disabled={disabled} onClick={()=>setOpen(true)}>{kind==='allowance'?(value?'Редагувати надбавку':'Внести надбавку'):(value?'Редагувати ранг':'Внести ранг')}</button>}>
   {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?<DataState kind="loading" compact message="Читання підтвердженого показника…"/>:value?<>
    <strong className="seniority-value">{kind==='allowance'?allowanceLabel(allowance??null):`${rank!.rank} ранг`}</strong>
    {(rank||allowance?.status==='confirmed'||value.effectiveOn||value.reviewOn)&&<dl className="info-grid">
     {allowance?.status==='confirmed'&&<InfoItem label="Статус" value="Підтверджено"/>}
     {rank&&<InfoItem label={rank.effectiveOn?'Дата присвоєння':'Присвоєно та діє з'} value={formatDate(rank.assignedOn)}/>}
     {value.effectiveOn&&<InfoItem label="Початок дії" value={formatDate(value.effectiveOn)}/>}
     {rank&&<InfoItem label="Походження рангу" value={rankOriginLabels[rank.origin]}/>}
     {rank?.reviewAnchorOn&&<InfoItem label="Підтверджена опорна дата" value={formatDate(rank.reviewAnchorOn)}/>}
     {value.reviewOn&&<InfoItem label="Ручна контрольна дата" value={formatDate(value.reviewOn)}/>}
     {rank?.originNote&&<InfoItem label="Пояснення підстави" value={rank.originNote} wide/>}
    </dl>}
    {document&&<p className="seniority-document"><span>Документ-підстава</span><span>{document}</span></p>}
   </>:<DataState kind="empty" compact message={kind==='allowance'?'Підтверджену надбавку не внесено.':'Поточний ранг не внесено.'}/>}
   {disabled&&kind==='allowance'&&<p className="employee-hint">Завершіть редагування стажу перед відкриттям надбавки.</p>}
  </InfoSection>
  {kind==='rank'&&<RankProjectionPanel employeeId={employee.id} refreshKey={refreshKey+version} showCurrent={false} showConfirmedDetails={false}/>}
  {open&&<FocusedIndicatorEditor key={employee.id+kind} employeeId={employee.id} kind={kind} navigationGuard={navigationGuard} returnFocus={opener.current} onClose={()=>close()} onSaved={(_,saved)=>{setState({key,value:saved});setVersion(v=>v+1);onRefresh?.();close(false)}}/>}
 </>
}
