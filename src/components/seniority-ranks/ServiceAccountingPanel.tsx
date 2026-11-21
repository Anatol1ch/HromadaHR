import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { CalendarCheck, CalendarDays, Clock, Layers3, Pencil, Plus } from 'lucide-react'
import ServiceProjectionView, { ServiceDetailRow, ServiceForecastView } from './ServiceProjectionView'
import ServiceAccountingModal from './ServiceAccountingModal'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { ServiceAccounting } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { personnelMessage } from '../../employees/model'
import { formatDate, todayIsoDate } from '../../lib/dates'
import { serviceDurationLabel } from './service-accounting-model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'

export default function ServiceAccountingPanel({ employeeId, hireDate, navigationGuard, onBusyChange, refreshKey=0, onEditingChange, onAccountingChanged, allowanceExtraContent=false, renderAllowancePanel }: {
  refreshKey?:number
  employeeId:string
  hireDate:string
  navigationGuard:RefObject<NavigationGuard>
  onBusyChange:(busy:boolean)=>void
  onEditingChange?:(editing:boolean)=>void
  onAccountingChanged?:()=>void
  allowanceExtraContent?:boolean
  renderAllowancePanel:(state:{value:ServiceProjection|null;error:string;onRetry:()=>void})=>ReactNode
}) {
  const [value,setValue]=useState<ServiceAccounting|null>(null)
  const [loading,setLoading]=useState(true)
  const [retry,setRetry]=useState(0)
  const [modalOpen,setModalOpen]=useState(false)
  const [error,setError]=useState('')
  const [projection,setProjection]=useState<ServiceProjection|null>(null)
  const [projectionError,setProjectionError]=useState('')
  const [projectionRetry,setProjectionRetry]=useState(0)
  const [showAllPeriods,setShowAllPeriods]=useState(false)
  const trigger=useRef<HTMLButtonElement>(null)
  const projectionDate=useRef(todayIsoDate())

  useEffect(()=>()=>onEditingChange?.(false),[onEditingChange])
  useEffect(()=>{
    let current=true
    setLoading(true);setError('')
    void window.hromadaHR.seniorityRanks.getServiceAccounting(employeeId).then(result=>{
      if(!current)return
      if(result.ok){setValue(result.data);setShowAllPeriods(false)}
      else setError(personnelMessage(result.error.code))
    }).catch(()=>{if(current)setError('Не вдалося завантажити підтверджені відомості стажу.')})
      .finally(()=>{if(current)setLoading(false)})
    return()=>{current=false}
  },[employeeId,retry])
  useEffect(()=>{
    const refreshDate=()=>{
      if(document.visibilityState==='hidden')return
      const today=todayIsoDate()
      if(today!==projectionDate.current){projectionDate.current=today;setProjectionRetry(v=>v+1)}
    }
    window.addEventListener('focus',refreshDate);document.addEventListener('visibilitychange',refreshDate)
    return()=>{window.removeEventListener('focus',refreshDate);document.removeEventListener('visibilitychange',refreshDate)}
  },[])
  useEffect(()=>{
    if(loading)return
    let current=true
    setProjection(null);setProjectionError('');projectionDate.current=todayIsoDate()
    void window.hromadaHR.seniorityRanks.getServiceProjection(employeeId).then(result=>{
      if(!current)return
      if(result.ok)setProjection(result.data)
      else setProjectionError(personnelMessage(result.error.code))
    }).catch(()=>{if(current)setProjectionError('Не вдалося отримати прогноз.')})
    return()=>{current=false}
  },[employeeId,value,loading,projectionRetry,refreshKey])

  function openEditor(button:HTMLButtonElement|null){
    trigger.current=button
    setModalOpen(true)
    onEditingChange?.(true)
  }
  function closeEditor(){setModalOpen(false);onEditingChange?.(false)}
  function saved(next:ServiceAccounting){
    setValue(next);setProjection(null);setProjectionRetry(v=>v+1);onAccountingChanged?.();closeEditor()
    requestAnimationFrame(()=>trigger.current?.focus())
  }
  function cleared(){
    setValue(null);setProjection(null);setProjectionRetry(v=>v+1);onAccountingChanged?.();closeEditor()
    requestAnimationFrame(()=>trigger.current?.focus())
  }
  const action=!loading&&!error&&value&&<button ref={trigger} type="button" className="secondary-button" onClick={event=>openEditor(event.currentTarget)}><Pencil size={15} aria-hidden="true"/>Редагувати стаж</button>
  const periods=value?.mode==='periods'?value.periods:[]
  const displayedPeriods=showAllPeriods?periods:periods.slice(0,4)
  const serviceDetailRowCount=!value?0:value.mode==='continuous'?2:value.mode==='snapshot'?3:1+displayedPeriods.length+(periods.length>4?1:0)
  const hasAllowanceExtraContent=allowanceExtraContent||projection?.comparison==='different'
  const detailTrackCount=Math.max(2,serviceDetailRowCount,hasAllowanceExtraContent?3:2)
  const layoutStyle={
    '--service-tab-detail-track-count':detailTrackCount,
    '--service-tab-service-row-count':serviceDetailRowCount,
    '--service-tab-service-span':2+serviceDetailRowCount,
    '--service-tab-allowance-span':4+(hasAllowanceExtraContent?1:0),
  } as CSSProperties

  return <div className="service-tab-layout" style={layoutStyle}>
    <InfoSection className={`service-info-panel service-tab-section service-tab-service${value?' service-tab-sync-service':''}`} title="Стаж служби" icon={<Clock size={17}/>} action={action}>
      {loading?<DataState kind="loading" compact message="Завантаження стажу…"/>:error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:value?<>
        <ServiceProjectionView value={projection} error={projectionError} onRetry={()=>setProjectionRetry(v=>v+1)}/>
        <dl className="service-detail-list service-detail-list-synchronized">
          <ServiceDetailRow icon={Layers3} label="Спосіб обліку" value={value.mode==='continuous'?'Безперервна служба':value.mode==='snapshot'?'Стаж на дату':'Окремі періоди служби'}/>
          {value.mode==='continuous'&&<ServiceDetailRow icon={CalendarCheck} label="Дата початку служби" value={formatDate(value.startDate)}/>}
          {value.mode==='snapshot'&&<>
            <ServiceDetailRow icon={CalendarDays} label="Підтверджена тривалість на дату" value={serviceDurationLabel(value)}/>
            <ServiceDetailRow icon={CalendarDays} label="Опорна дата" value={formatDate(value.asOfDate)}/>
          </>}
          {value.mode==='periods'&&<>
            {displayedPeriods.map((period,index)=><ServiceDetailRow key={period.id} icon={CalendarDays} label={`Період ${index+1}`} value={<>{formatDate(period.startDate)} – {period.endDate?formatDate(period.endDate):'Дотепер'}</>}/>)}
            {periods.length>4&&<div className="service-period-expand"><button type="button" className="secondary-button" aria-expanded={showAllPeriods} onClick={()=>setShowAllPeriods(v=>!v)}>{showAllPeriods?'Згорнути список':`Показати всі періоди (${periods.length})`}</button></div>}
          </>}
        </dl>
      </>:<div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Clock size={22} aria-hidden="true"/>} message="Підтверджений стаж служби не внесено."/><button ref={trigger} type="button" className="primary-button service-empty-action-button" onClick={event=>openEditor(event.currentTarget)}><Plus size={17} aria-hidden="true"/>Внести стаж</button></div>}
    </InfoSection>
    {renderAllowancePanel({value:projection,error:projectionError,onRetry:()=>setProjectionRetry(v=>v+1)})}
    <ServiceForecastView value={projection} error={projectionError} onRetry={()=>setProjectionRetry(v=>v+1)}/>
    {modalOpen&&<ServiceAccountingModal employeeId={employeeId} hireDate={hireDate} navigationGuard={navigationGuard} returnFocus={trigger.current} onClose={closeEditor} onSaved={saved} onCleared={cleared} onBusyChange={onBusyChange}/>}
  </div>
}
