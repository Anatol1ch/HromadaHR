import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { Allowance, CurrentRank } from '../../../shared/seniority-ranks'
import { allowancePercentages } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import DateField from '../DateField'
import Select from '../Select'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import { confirmModalClose } from '../closeConfirmation'
import { notifySystemToast } from '../SystemToastHost'
import { formatDate, parseDateInput, todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { allowanceInput, allowanceLabel, draftFor, rankInput, validateDraft, type Draft, type Kind } from './model'

type Props = { kind: Kind; employeeId: string; value: Allowance | CurrentRank | null; busy: boolean; inFlight: RefObject<boolean>; onBusy: (busy: boolean) => void; onDirty: (kind: Kind, dirty: boolean) => void; onSaved: (kind: Kind, value: Allowance | CurrentRank | null) => void }
export default function IndicatorEditor({ kind, employeeId, value, busy, inFlight, onBusy, onDirty, onSaved }: Props) {
 const title = kind === 'allowance' ? 'Надбавка за вислугу років' : 'Поточний ранг'
 const [editing,setEditing]=useState(false)
 const [initial,setInitial]=useState(()=>draftFor(value))
 const [draft,setDraft]=useState(initial)
 const [dates,setDates]=useState(()=>dateValues(initial))
 const [errors,setErrors]=useState<Partial<Record<keyof Draft,string>>>({})
 const [error,setError]=useState('')
 const [clearing,setClearing]=useState(false)
 const form=useRef<HTMLFormElement>(null), alive=useRef(true)
 const id=useId()
 const dirty=editing && JSON.stringify(initial)!==JSON.stringify(draft)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{onDirty(kind,dirty)},[onDirty,kind,dirty])
 function dateValues(v: Draft) { return { assignedOn:parseDateInput(v.assignedOn)??'', effectiveOn:parseDateInput(v.effectiveOn)??'', documentDate:parseDateInput(v.documentDate)??'', reviewOn:parseDateInput(v.reviewOn)??'' } }
 function reset(next: Allowance | CurrentRank | null) { const v=draftFor(next);setInitial(v);setDraft(v);setDates(dateValues(v));setEditing(false);setErrors({});setError('');onDirty(kind,false) }
 function change(key: keyof Draft, text: string) { setDraft(v=>({...v,[key]:text}));setErrors(v=>({...v,[key]:undefined})) }
 async function mutate(clear=false) {
  if(inFlight.current) return
  if(!clear) {
   const next=validateDraft(kind,draft);setErrors(next)
   if(Object.keys(next).length) {setError('Перевірте позначені поля.');return}
   if(!form.current?.checkValidity()) {form.current?.reportValidity();return}
  }
  inFlight.current=true;onBusy(true);setError('')
  try {
   const api=window.hromadaHR.seniorityRanks
   const result=clear ? await (kind==='allowance'?api.clearAllowance(employeeId):api.clearRank(employeeId)) : await (kind==='allowance'?api.saveAllowance(employeeId,allowanceInput(draft)):api.saveRank(employeeId,rankInput(draft)))
   if(!alive.current) return
   if(!result.ok) {setError(personnelMessage(result.error.code));return}
   onSaved(kind,result.data);reset(result.data);setClearing(false)
   notifySystemToast('success',clear?'Відомості очищено':'Відомості збережено',title)
  } catch {if(alive.current)setError('Не вдалося підтвердити результат операції. Чернетку збережено; перевірте дані перед повторною спробою.')}
  finally {inFlight.current=false;if(alive.current)onBusy(false)}
 }
 function date(key: 'assignedOn'|'effectiveOn'|'documentDate'|'reviewOn',label:string,required=false) {
  return <label key={key} htmlFor={id+key}>{label}{required?' *':''}<DateField id={id+key} value={dates[key]} initialDraft={draft[key]} required={required} disabled={busy} max={key==='assignedOn'||key==='effectiveOn'?todayIsoDate():undefined} error={errors[key]} onDraftChange={v=>change(key,v)} onChange={v=>setDates(current=>({...current,[key]:v}))}/>{errors[key]&&<small className="recipient-field-error">{errors[key]}</small>}</label>
 }
 const applicable=kind==='rank'||draft.status==='confirmed'
 return <InfoSection title={title} action={!editing&&<button className="secondary-button" disabled={busy} onClick={()=>{const v=draftFor(value);setDraft(v);setInitial(v);setDates(dateValues(v));setError('');setEditing(true)}}>{value?'Редагувати':'Внести відомості'}</button>}>
  {!editing ? <dl className="info-grid">
   <InfoItem label={kind==='allowance'?'Стан надбавки':'Ранг'} emphasis value={kind==='allowance'?allowanceLabel(value as Allowance|null):value&&'rank' in value?`${value.rank} ранг`:'Не внесено'}/>
   {value&&<>
    {kind==='rank'&&'assignedOn' in value&&<InfoItem label="Дата присвоєння" value={formatDate(value.assignedOn)}/>}
    <InfoItem label="Початок дії" value={formatDate(value.effectiveOn??('assignedOn' in value?value.assignedOn:null))}/>
    <InfoItem label="Наступна перевірка" value={formatDate(value.reviewOn)}/>
    <InfoItem label="Тип документа" value={value.documentType??'Не внесено'}/>
    <InfoItem label="Номер документа" value={value.documentNumber??'Не внесено'}/>
    <InfoItem label="Дата документа" value={formatDate(value.documentDate)}/>
   </>}
  </dl> : <form ref={form} noValidate onSubmit={e=>{e.preventDefault();void mutate()}} className="seniority-form">
   <fieldset disabled={busy} className="seniority-fields">
    {kind==='allowance'&&<label>Статус<Select label="Статус надбавки" value={draft.status} options={[{value:'confirmed',label:'Підтверджено'},{value:'not_applicable',label:'Не застосовується'}]} onChange={v=>change('status',v)} error={errors.status}/></label>}
    {kind==='allowance'&&applicable&&<label>Відсоток *<Select label="Відсоток надбавки" required value={draft.percentage} options={allowancePercentages.map(n=>({value:String(n),label:`${n}%`}))} onChange={v=>change('percentage',v)} error={errors.percentage}/></label>}
    {kind==='rank'&&<label>Номер рангу *<Select label="Номер рангу" required value={draft.rank} options={Array.from({length:15},(_,i)=>({value:String(i+1),label:`${i+1} ранг`}))} onChange={v=>change('rank',v)} error={errors.rank}/></label>}
    {kind==='rank'&&date('assignedOn','Дата присвоєння',true)}
    {applicable&&date('effectiveOn','Дата початку дії',kind==='allowance')}
    <label>Тип документа<input value={draft.documentType} aria-invalid={!!errors.documentType} onChange={e=>change('documentType',e.target.value)}/>{errors.documentType&&<small className="recipient-field-error">{errors.documentType}</small>}</label>
    <label>Номер документа<input value={draft.documentNumber} aria-invalid={!!errors.documentNumber} onChange={e=>change('documentNumber',e.target.value)}/>{errors.documentNumber&&<small className="recipient-field-error">{errors.documentNumber}</small>}</label>
    {date('documentDate','Дата документа')}{date('reviewOn','Дата наступної перевірки')}
   </fieldset>
   {kind==='rank'&&<p className="seniority-note">Без окремої дати початку дії використовується дата присвоєння.</p>}
   <div className="seniority-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>confirmModalClose(dirty,()=>reset(value),form.current)}>Скасувати</button><button type="submit" className="primary-button" disabled={busy}>{kind==='allowance'?'Зберегти надбавку':'Зберегти ранг'}</button></div>
  </form>}
  {error&&!clearing&&<Alert variant="error">{error}</Alert>}
  {value&&<div className="seniority-actions"><button className="secondary-button danger-action" disabled={busy} onClick={()=>{setError('');setClearing(true)}}>{kind==='allowance'?'Очистити відомості про надбавку':'Очистити поточний ранг'}</button></div>}
  {clearing&&<ConfirmDialog title={kind==='allowance'?'Очистити надбавку?':'Очистити поточний ранг?'} message="Поточний запис буде вилучено. Попередня версія не зберігається окремо. Незбережені зміни цієї секції також буде скасовано. Інша секція залишиться без змін." confirmLabel="Очистити" error={error} onCancel={()=>{if(!inFlight.current){setClearing(false);setError('')}}} onConfirm={()=>mutate(true)}/>}
 </InfoSection>
}
