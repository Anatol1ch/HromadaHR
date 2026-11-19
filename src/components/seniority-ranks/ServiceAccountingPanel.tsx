import { useEffect, useRef, useState, type RefObject } from 'react'
import { Clock, Plus } from 'lucide-react'
import ServiceProjectionView from './ServiceProjectionView'
import ServiceAccountingModal from './ServiceAccountingModal'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { ServiceAccounting } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import { personnelMessage } from '../../employees/model'
import { formatDate, formatDateTime, todayIsoDate } from '../../lib/dates'
import { serviceDurationLabel } from './service-accounting-model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'

export default function ServiceAccountingPanel({ employeeId, hireDate, navigationGuard, onBusyChange, refreshKey=0, onEditingChange, onAccountingChanged, showConfirmedAllowance=true }: {
  refreshKey?:number
  employeeId:string
  hireDate:string
  navigationGuard:RefObject<NavigationGuard>
  onBusyChange:(busy:boolean)=>void
  onEditingChange?:(editing:boolean)=>void
  onAccountingChanged?:()=>void
  showConfirmedAllowance?:boolean
}) {
  const [value,setValue]=useState<ServiceAccounting|null>(null)
  const [loading,setLoading]=useState(true)
  const [retry,setRetry]=useState(0)
  const [modalOpen,setModalOpen]=useState(false)
  const [error,setError]=useState('')
  const [projection,setProjection]=useState<ServiceProjection|null>(null)
  const [projectionError,setProjectionError]=useState('')
  const [projectionRetry,setProjectionRetry]=useState(0)
  const trigger=useRef<HTMLButtonElement>(null)
  const panelFocus=useRef<HTMLDivElement>(null)
  const projectionDate=useRef(todayIsoDate())

  useEffect(()=>()=>onEditingChange?.(false),[onEditingChange])
  useEffect(()=>{
    let current=true
    setLoading(true);setError('')
    void window.hromadaHR.seniorityRanks.getServiceAccounting(employeeId).then(result=>{
      if(!current)return
      if(result.ok)setValue(result.data)
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
    requestAnimationFrame(()=>{(trigger.current?.isConnected?trigger.current:panelFocus.current)?.focus()})
  }
  function cleared(){
    setValue(null);setProjection(null);setProjectionRetry(v=>v+1);onAccountingChanged?.();closeEditor()
    requestAnimationFrame(()=>panelFocus.current?.focus())
  }
  const action=!loading&&!error&&value&&<button ref={trigger} type="button" className="secondary-button" onClick={event=>openEditor(event.currentTarget)}>Редагувати стаж</button>

  return <div ref={panelFocus} tabIndex={-1} className="employee-form service-accounting-panel">
    <InfoSection title="Підтверджений стаж служби" action={action}>
      {loading?<DataState kind="loading" compact message="Завантаження стажу…"/>:error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:value?
        value.mode==='snapshot'?<><strong>{serviceDurationLabel(value)}</strong><dl className="info-grid"><InfoItem label="Спосіб обліку" value="Підтверджений стаж на дату"/><InfoItem label="Стаж визначено станом на" value={formatDate(value.asOfDate)}/><InfoItem label="Останнє підтвердження" value={formatDateTime(value.confirmedAt)}/></dl></>:
        <><strong>{value.mode==='continuous'?'Безперервна служба':'Окремі періоди служби'}</strong><dl className="info-grid">{value.mode==='continuous'?<InfoItem label="Дата початку служби" value={formatDate(value.startDate)}/>:value.periods.map((period,index)=><InfoItem key={period.id} label={`Період служби ${index+1}`} value={`${formatDate(period.startDate)} – ${period.endDate?formatDate(period.endDate):'дотепер'}`}/>)}<InfoItem label="Останнє підтвердження" value={formatDateTime(value.confirmedAt)}/></dl></>:
        <div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Clock size={22} aria-hidden="true"/>} message="Підтверджений стаж служби не внесено."/><button ref={trigger} type="button" className="primary-button service-empty-action-button" onClick={event=>openEditor(event.currentTarget)}><Plus size={17} aria-hidden="true"/>Внести стаж</button></div>}
    </InfoSection>
    {!modalOpen&&!loading&&<ServiceProjectionView showConfirmedAllowance={showConfirmedAllowance} value={projection} error={projectionError} onRetry={()=>setProjectionRetry(v=>v+1)}/>}
    {modalOpen&&<ServiceAccountingModal employeeId={employeeId} hireDate={hireDate} navigationGuard={navigationGuard} returnFocus={trigger.current??panelFocus.current} onClose={closeEditor} onSaved={saved} onCleared={cleared} onBusyChange={onBusyChange}/>}
  </div>
}
