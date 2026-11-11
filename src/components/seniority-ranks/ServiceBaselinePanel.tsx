import { useEffect, useRef, useState, type RefObject } from 'react'
import ServiceProjectionView from './ServiceProjectionView'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { ServiceBaseline } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import ConfirmDialog from '../ConfirmDialog'
import ValidatedInput, { ValidatedTextarea } from '../ValidatedInput'
import DateField from '../DateField'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { personnelMessage } from '../../employees/model'
import { formatDate, formatDateTime, todayIsoDate } from '../../lib/dates'
import { baselineDraft, baselineErrors, baselineInput, baselineLabel, type BaselineDraft } from './baseline-model'

export default function ServiceBaselinePanel({ employeeId, navigationGuard, onBusyChange }: {
 employeeId: string; navigationGuard: RefObject<NavigationGuard>; onBusyChange: (busy:boolean)=>void
}) {
 const [value,setValue]=useState<ServiceBaseline|null>(null), [loading,setLoading]=useState(true), [retry,setRetry]=useState(0)
 const [editing,setEditing]=useState(false), [error,setError]=useState(''), [clearing,setClearing]=useState(false), [busy,setBusy]=useState(false)
 const [initial,setInitial]=useState(()=>baselineDraft(null)), [draft,setDraft]=useState(initial)
 const [iso,setIso]=useState(''), [errors,setErrors]=useState<Partial<Record<keyof BaselineDraft,string>>>({})
 const owner=useRef<HTMLDivElement>(null), inFlight=useRef(false), alive=useRef(true)
 const [projection,setProjection]=useState<ServiceProjection|null>(null),[projectionError,setProjectionError]=useState(''),[projectionRetry,setProjectionRetry]=useState(0)
 const projectionDate=useRef(todayIsoDate())
 const dirty=editing&&JSON.stringify(initial)!==JSON.stringify(draft)
 const requestClose=useUnsavedChanges(dirty,inFlight,navigationGuard,owner)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  let current=true;setLoading(true);setError('')
  window.hromadaHR.seniorityRanks.getServiceBaseline(employeeId).then(result=>{
   if(!current)return
   if(result.ok)setValue(result.data);else setError(personnelMessage(result.error.code))
  }).catch(()=>{if(current)setError('Не вдалося завантажити підтверджений стаж.')}).finally(()=>{if(current)setLoading(false)})
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
 },[employeeId,value,loading,projectionRetry])
 function reset(next:ServiceBaseline|null) {const v=baselineDraft(next);setDraft(v);setInitial(v);setIso(next?.asOfDate??'');setEditing(false);setErrors({});setError('')}
 function change<K extends keyof BaselineDraft>(key:K,text:BaselineDraft[K]) {setDraft(v=>({...v,[key]:text}));setErrors(v=>({...v,[key]:undefined}))}
 async function save(clear=false) {
  if(inFlight.current)return
  if(!clear){const next=baselineErrors(draft);setErrors(next);if(Object.keys(next).length)return}
  inFlight.current=true;setBusy(true);onBusyChange(true);setError('')
  try {
   const api=window.hromadaHR.seniorityRanks
   const result=clear?await api.clearServiceBaseline(employeeId):await api.saveServiceBaseline(employeeId,baselineInput(draft))
   if(!alive.current)return
   if(!result.ok){setError(personnelMessage(result.error.code));return}
   setProjection(null);setValue(result.data);setProjectionRetry(v=>v+1);reset(result.data);setClearing(false)
   notifySystemToast('success',clear?'Підтверджений стаж очищено':'Підтверджений стаж збережено','Опорні кадрові відомості оновлено.')
  } catch {if(alive.current)setError('Не вдалося підтвердити результат. Чернетку збережено; перевірте запис перед повторною спробою.')}
  finally {inFlight.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}
 }
 return <div ref={owner} className="employee-form">
  <InfoSection title="Підтверджений стаж служби" action={!loading&&!error&&!editing&&<button type="button" className="secondary-button" onClick={()=>{reset(value);setEditing(true)}}>{value?'Редагувати стаж':'Внести стаж'}</button>}>
   {loading?<DataState kind="loading" compact message="Завантаження стажу…"/>:editing?<form className="employee-form service-baseline-form" noValidate onSubmit={e=>{e.preventDefault();void save()}}>
    <fieldset className="recipient-fieldset service-baseline-fields" disabled={busy}>
     <div className="employee-form-grid">
      {(['years','months','days'] as const).map((key,index)=><div className="recipient-field employee-field" key={key}>
       <label htmlFor={employeeId+key}>{['Роки','Місяці','Дні'][index]} *</label>
       <ValidatedInput id={employeeId+key} required inputMode="numeric" pattern="[0-9]+" value={draft[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key]?employeeId+key+'-error':undefined} onChange={e=>change(key,e.target.value)}/>
       {errors[key]&&<span className="field-error" id={employeeId+key+'-error'}>{errors[key]}</span>}
      </div>)}
      <div className="recipient-field employee-field"><label htmlFor={employeeId+'asOfDate'}>Стаж визначено станом на *</label><DateField id={employeeId+'asOfDate'} value={iso} initialDraft={draft.asOfDate} max={todayIsoDate()} required disabled={busy} error={errors.asOfDate} onChange={setIso} onDraftChange={text=>change('asOfDate',text)}/></div>
     </div>
     <div className="seniority-date-option">
      <button type="button" role="switch" className="seniority-switch" aria-checked={draft.autoAccrueAfterBaseline} aria-labelledby={employeeId+'auto-label'} aria-describedby={employeeId+'auto-hint'} disabled={busy} onClick={()=>change('autoAccrueAfterBaseline',!draft.autoAccrueAfterBaseline)}><span aria-hidden="true"/></button>
      <div><span id={employeeId+'auto-label'}>Автоматично враховувати подальший період служби</span><small id={employeeId+'auto-hint'}>Програма розраховуватиме стаж від зазначеної дати за умови безперервного зарахування часу</small></div>
     </div>
     <div className="recipient-field employee-field"><label htmlFor={employeeId+'basisNote'}>Підстава підтвердження</label><ValidatedTextarea id={employeeId+'basisNote'} rows={3} maxLength={2000} value={draft.basisNote} aria-invalid={!!errors.basisNote} onChange={e=>change('basisNote',e.target.value)}/>{errors.basisNote&&<span className="field-error">{errors.basisNote}</span>}</div>
    </fieldset>
    {error&&<Alert variant="error">{error}</Alert>}
    <div className="seniority-footer-actions">
     {value&&<button type="button" className="secondary-button danger-action" disabled={busy} onClick={()=>{setError('');setClearing(true)}}>Очистити</button>}
     <div className="employee-form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>requestClose(()=>reset(value))}>Скасувати</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Збереження…':'Зберегти'}</button></div>
    </div>
   </form>:error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:value?<>
    <strong>{baselineLabel(value)}</strong><dl className="info-grid">
     <InfoItem label="Подальше зарахування" value={value.autoAccrueAfterBaseline?'Дозволено для прогнозу':'Не дозволено'}/><InfoItem label="Стаж визначено станом на" value={formatDate(value.asOfDate)}/><InfoItem label="Останнє підтвердження" value={formatDateTime(value.confirmedAt)}/>
     {value.basisNote&&<InfoItem label="Підстава" value={value.basisNote} wide/>}
    </dl>
   </>:<DataState kind="empty" compact message="Підтверджений стаж не внесено"/>}
  </InfoSection>
  {!editing&&!loading&&<ServiceProjectionView value={projection} error={projectionError} onRetry={()=>setProjectionRetry(v=>v+1)}/>}
  {clearing&&<ConfirmDialog title="Очистити підтверджений стаж?" message="Поточний опорний запис і його чернетку буде вилучено. Попередня версія окремо не зберігається. Надбавка, ранг і відпустки залишаться без змін." confirmLabel="Очистити" error={error} onCancel={()=>{if(!inFlight.current){setClearing(false);setError('')}}} onConfirm={()=>save(true)}/>}
 </div>
}
