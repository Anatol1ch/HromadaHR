import { useEffect, useRef, useState, type RefObject } from 'react'
import { Clock, Plus } from 'lucide-react'
import ServiceProjectionView from './ServiceProjectionView'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { ServiceAccounting } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import ConfirmDialog from '../ConfirmDialog'
import ValidatedInput from '../ValidatedInput'
import DateField from '../DateField'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { personnelMessage } from '../../employees/model'
import { formatDate, formatDateTime, todayIsoDate } from '../../lib/dates'
import { snapshotDraft, snapshotErrors, snapshotInput, serviceDurationLabel, type SnapshotDraft } from './service-accounting-model'

export default function ServiceAccountingPanel({ employeeId, navigationGuard, onBusyChange,refreshKey=0,onEditingChange,showConfirmedAllowance=true }: {
 refreshKey?:number;onEditingChange?:(editing:boolean)=>void;showConfirmedAllowance?:boolean
 employeeId:string;navigationGuard:RefObject<NavigationGuard>;onBusyChange:(busy:boolean)=>void
}) {
 const [value,setValue]=useState<ServiceAccounting|null>(null),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0)
 const [editing,setEditing]=useState(false),[error,setError]=useState(''),[clearing,setClearing]=useState(false),[busy,setBusy]=useState(false)
 const [initial,setInitial]=useState(()=>snapshotDraft(null)),[draft,setDraft]=useState(initial),[iso,setIso]=useState('')
 const [errors,setErrors]=useState<Partial<Record<keyof SnapshotDraft,string>>>({})
 const owner=useRef<HTMLDivElement>(null),inFlight=useRef(false),alive=useRef(true)
 const [projection,setProjection]=useState<ServiceProjection|null>(null),[projectionError,setProjectionError]=useState(''),[projectionRetry,setProjectionRetry]=useState(0)
 const projectionDate=useRef(todayIsoDate()),dirty=editing&&JSON.stringify(initial)!==JSON.stringify(draft)
 const requestClose=useUnsavedChanges(dirty,inFlight,navigationGuard,owner)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>()=>onEditingChange?.(false),[onEditingChange])
 useEffect(()=>{
  let current=true;setLoading(true);setError('')
  window.hromadaHR.seniorityRanks.getServiceAccounting(employeeId).then(result=>{if(!current)return;if(result.ok)setValue(result.data);else setError(personnelMessage(result.error.code))})
   .catch(()=>{if(current)setError('Не вдалося завантажити підтверджені відомості стажу.')}).finally(()=>{if(current)setLoading(false)})
  return()=>{current=false}
 },[employeeId,retry])
 useEffect(()=>{
  const refreshDate=()=>{if(document.visibilityState==='hidden')return;const today=todayIsoDate();if(today!==projectionDate.current){projectionDate.current=today;setProjectionRetry(v=>v+1)}}
  window.addEventListener('focus',refreshDate);document.addEventListener('visibilitychange',refreshDate)
  return()=>{window.removeEventListener('focus',refreshDate);document.removeEventListener('visibilitychange',refreshDate)}
 },[])
 useEffect(()=>{
  if(loading)return
  let current=true;setProjection(null);setProjectionError('');projectionDate.current=todayIsoDate()
  window.hromadaHR.seniorityRanks.getServiceProjection(employeeId).then(result=>{if(current){if(result.ok)setProjection(result.data);else setProjectionError(personnelMessage(result.error.code))}}).catch(()=>{if(current)setProjectionError('Не вдалося отримати прогноз.')})
  return()=>{current=false}
 },[employeeId,value,loading,projectionRetry,refreshKey])
 function reset(next:ServiceAccounting|null){const v=snapshotDraft(next);setDraft(v);setInitial(v);setIso(next?.mode==='snapshot'?next.asOfDate:'');setEditing(false);onEditingChange?.(false);setErrors({});setError('')}
 function beginEdit(){if(value&&value.mode!=='snapshot')return;reset(value);setEditing(true);onEditingChange?.(true)}
 function change<K extends keyof SnapshotDraft>(key:K,text:SnapshotDraft[K]){setDraft(v=>({...v,[key]:text}));setErrors(v=>({...v,[key]:undefined}))}
 async function save(clear=false){
  if(inFlight.current)return
  if(!clear){const next=snapshotErrors(draft);setErrors(next);if(Object.keys(next).length)return}
  inFlight.current=true;setBusy(true);onBusyChange(true);setError('')
  try{
   const api=window.hromadaHR.seniorityRanks
   const result=clear?await api.clearServiceAccounting(employeeId):await api.saveServiceAccounting(employeeId,snapshotInput(draft))
   if(!alive.current)return
   if(!result.ok){setError(personnelMessage(result.error.code));return}
   setProjection(null);setValue(result.data);setProjectionRetry(v=>v+1);reset(result.data);setClearing(false)
   notifySystemToast('success',clear?'Відомості стажу очищено':'Відомості стажу збережено','Підтверджені вихідні відомості оновлено.')
  }catch{if(alive.current)setError('Не вдалося підтвердити результат. Чернетку збережено; перевірте запис перед повторною спробою.')}
  finally{inFlight.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}
 }
 const editable=value===null||value.mode==='snapshot'
 return <div ref={owner} className="employee-form">
  <InfoSection title="Підтверджений стаж служби" action={!loading&&!error&&!editing&&value?.mode==='snapshot'&&<button type="button" className="secondary-button" onClick={beginEdit}>Редагувати стаж</button>}>
   {loading?<DataState kind="loading" compact message="Завантаження стажу…"/>:editing?<form className="employee-form service-baseline-form" noValidate onSubmit={e=>{e.preventDefault();void save()}}>
    <fieldset className="recipient-fieldset service-baseline-fields" disabled={busy}><div className="employee-form-grid">
     {(['years','months','days'] as const).map((key,index)=><div className="recipient-field employee-field" key={key}><label htmlFor={employeeId+key}>{['Роки','Місяці','Дні'][index]} *</label><ValidatedInput id={employeeId+key} required inputMode="numeric" pattern="[0-9]+" value={draft[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key]?employeeId+key+'-error':undefined} onChange={e=>change(key,e.target.value)}/>{errors[key]&&<span className="field-error" id={employeeId+key+'-error'}>{errors[key]}</span>}</div>)}
     <div className="recipient-field employee-field"><label htmlFor={employeeId+'asOfDate'}>Стаж визначено станом на *</label><DateField id={employeeId+'asOfDate'} value={iso} initialDraft={draft.asOfDate} max={todayIsoDate()} required disabled={busy} error={errors.asOfDate} onChange={setIso} onDraftChange={text=>change('asOfDate',text)}/></div>
    </div></fieldset>
    {error&&<Alert variant="error">{error}</Alert>}
    <div className="seniority-footer-actions">{value&&<button type="button" className="secondary-button danger-action" disabled={busy} onClick={()=>{setError('');setClearing(true)}}>Очистити</button>}<div className="employee-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>requestClose(()=>reset(value))}>Скасувати</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Збереження…':'Зберегти'}</button></div></div>
   </form>:error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:value?<>
    {value.mode==='snapshot'?<><strong>{serviceDurationLabel(value)}</strong><dl className="info-grid"><InfoItem label="Спосіб обліку" value="Підтверджений стаж на дату"/><InfoItem label="Стаж визначено станом на" value={formatDate(value.asOfDate)}/><InfoItem label="Останнє підтвердження" value={formatDateTime(value.confirmedAt)}/></dl></>:<><strong>{value.mode==='continuous'?'Безперервна служба':'Окремі періоди служби'}</strong><dl className="info-grid">{value.mode==='continuous'?<InfoItem label="Дата початку служби" value={formatDate(value.startDate)}/>:<>{value.periods.map((period,index)=><InfoItem key={period.id} label={`Період служби ${index+1}`} value={`${formatDate(period.startDate)} – ${period.endDate?formatDate(period.endDate):'дотепер'}`}/>)}</>}<InfoItem label="Останнє підтвердження" value={formatDateTime(value.confirmedAt)}/></dl><p className="employee-hint">Цей спосіб обліку зараз доступний лише для перегляду. Змінити або очистити його можна буде у редакторі обліку стажу.</p></>}
   </>:editable?<div className="service-empty-action-state"><DataState kind="empty" className="service-empty-state-message" icon={<Clock size={22} aria-hidden="true"/>} message="Підтверджений стаж служби не внесено."/><button type="button" className="primary-button service-empty-action-button" onClick={beginEdit}><Plus size={17} aria-hidden="true"/>Внести стаж</button></div>:null}
  </InfoSection>
  {!editing&&!loading&&<ServiceProjectionView showConfirmedAllowance={showConfirmedAllowance} value={projection} error={projectionError} onRetry={()=>setProjectionRetry(v=>v+1)}/>}
  {clearing&&<ConfirmDialog title="Очистити підтверджений стаж?" message="Вихідні відомості стажу буде вилучено. Надбавка, ранг і відпустки залишаться без змін." confirmLabel="Очистити" error={error} onCancel={()=>{if(!inFlight.current){setClearing(false);setError('')}}} onConfirm={()=>save(true)}/>}
 </div>
}
