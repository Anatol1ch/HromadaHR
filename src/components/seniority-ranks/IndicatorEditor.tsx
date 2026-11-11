import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Allowance, CurrentRank, SeniorityOverview } from '../../../shared/seniority-ranks'
import { allowancePercentages } from '../../../shared/seniority-ranks'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import DateField from '../DateField'
import Select from '../Select'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import Modal from '../Modal'
import ValidatedInput from '../ValidatedInput'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { UserRound, Pencil, Check, X, Trash2 } from 'lucide-react'
import { navigateTabs } from '../../lib/tabNavigation'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import { notifySystemToast } from '../SystemToastHost'
import { formatDate, parseDateInput, todayIsoDate } from '../../lib/dates'
import { personnelMessage, fullName, employeeTypeLabels } from '../../employees/model'
import { directionsFor, documentTypeOptions, documentLabel, toggleSeparateDate, canCopyDocumentDate, copyDocumentDate, allowanceInput, allowanceLabel, rankLabel, draftFor, rankInput, validateDraft, type Draft, type Kind } from './model'

type Props = {
 kind: Kind; row: SeniorityOverview; navigationGuard: RefObject<NavigationGuard>
 onSwitch: (kind: Kind) => void; onClose: () => void
 onSaved: (kind: Kind, value: Allowance | CurrentRank | null) => void
}
export default function IndicatorEditor({ kind, row, navigationGuard, onSwitch, onClose, onSaved }: Props) {
 const value = kind === 'allowance' ? row.allowance : row.rank
 const employeeId = row.employee.id
 const inFlight = useRef(false)
 const [busy,onBusy] = useState(false)
 const title = kind === 'allowance' ? 'Надбавка за вислугу років' : 'Поточний ранг'
 const [editing,setEditing]=useState(false)
 const [initial,setInitial]=useState(()=>draftFor(value))
 const [draft,setDraft]=useState(initial)
 const [dates,setDates]=useState(()=>dateValues(initial))
 const [errors,setErrors]=useState<Partial<Record<keyof Draft,string>>>({})
 const [error,setError]=useState('')
 const [clearing,setClearing]=useState(false)
 const [separateDate,setSeparateDate]=useState(!!value?.effectiveOn)
 const [effectiveRevision,setEffectiveRevision]=useState(0)
 const form=useRef<HTMLFormElement>(null), owner=useRef<HTMLDivElement>(null), alive=useRef(true)
 const id=useId()
 const dirty=editing && JSON.stringify(initial)!==JSON.stringify(draft)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const requestClose=useUnsavedChanges(dirty,inFlight,navigationGuard,owner)
 function dateValues(v: Draft) { return { assignedOn:parseDateInput(v.assignedOn)??'', effectiveOn:parseDateInput(v.effectiveOn)??'', documentDate:parseDateInput(v.documentDate)??'', reviewOn:parseDateInput(v.reviewOn)??'' } }
 function reset(next: Allowance | CurrentRank | null) { const v=draftFor(next);setInitial(v);setDraft(v);setDates(dateValues(v));setEditing(false);setSeparateDate(!!next?.effectiveOn);setErrors({});setError('') }
 function change(key: keyof Draft, text: string) { setDraft(v=>({...v,[key]:text}));setErrors(v=>({...v,[key]:undefined})) }
 async function mutate(clear=false) {
  if(inFlight.current) return
  if(!clear) {
   const next=validateDraft(kind,draft);setErrors(next)
   if(Object.keys(next).length) {setError('Перевірте позначені поля.');requestAnimationFrame(()=>{if(form.current)focusFirstInvalid(form.current)});return}
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
 function field(key: keyof Draft, label: string, control: ReactNode, required=false) {
  return <div className="recipient-field employee-field"><label htmlFor={id+key}>{label}{required&&<span aria-hidden="true"> *</span>}</label>{control}</div>
 }
 function date(key: 'assignedOn'|'effectiveOn'|'documentDate'|'reviewOn',label:string,required=false) {
  return field(key,label,<DateField key={key==='effectiveOn'?effectiveRevision:key} id={id+key} value={dates[key]} initialDraft={draft[key]} required={required} disabled={busy}
   max={key==='assignedOn'||key==='effectiveOn'?todayIsoDate():undefined} error={errors[key]}
   onDraftChange={v=>change(key,v)} onChange={v=>setDates(current=>({...current,[key]:v}))}/>,required)
 }
 function text(key: 'documentType'|'documentNumber', label: string, max: number) {
  return field(key,label,<><ValidatedInput id={id+key} value={draft[key]} maxLength={max} disabled={busy}
   aria-invalid={!!errors[key]} aria-describedby={errors[key]?id+key+'-error':undefined} onChange={e=>change(key,e.target.value)}/>
   {errors[key]&&<span className="field-error" id={id+key+'-error'}>{errors[key]}</span>}</>)
 }
 function select(key: 'status'|'percentage'|'rank'|'documentType',label:string,options:{value:string;label:string}[],required=false) {
  return <div className="recipient-field employee-field"><span>{label}{required?' *':''}</span>
   <Select label={label} value={draft[key]} options={options} required={required} disabled={busy} onChange={v=>change(key,v)} error={errors[key]}/>
  </div>
 }
 function edit() {
  const v=draftFor(value);setDraft(v);setInitial(v);setDates(dateValues(v));setSeparateDate(!!value?.effectiveOn);setError('');setEditing(true)
 }
 const applicable=kind==='rank'||draft.status==='confirmed'
 const rankValue=kind==='rank'?row.rank:null
 const document=documentLabel(value)
 const futureDocumentDate=(parseDateInput(draft.documentDate)??'')>todayIsoDate()
 const headline=value ? kind==='allowance'?allowanceLabel(row.allowance):rankLabel(row) : kind==='allowance'?'Надбавку не внесено':'Ранг не внесено'
 const close=()=>requestClose(onClose)
 const footer=<div className="employee-form-footer">
  {error&&!clearing&&<Alert variant="error">{error}</Alert>}
  <div className="seniority-footer-actions">
   {editing&&value&&<button type="button" className="secondary-button danger-action" disabled={busy} onClick={()=>{setError('');setClearing(true)}}><Trash2 size={17} aria-hidden="true"/>Очистити показник</button>}
   <div className="employee-form-actions">
    {editing?<>
     <button type="button" className="secondary-button" disabled={busy} onClick={()=>requestClose(()=>reset(value))}><X size={17} aria-hidden="true"/>Скасувати</button>
     <button type="submit" form={id} className="primary-button" disabled={busy} aria-busy={busy}><Check size={17} aria-hidden="true"/>{busy?'Збереження…':'Зберегти зміни'}</button>
    </>:<button type="button" className="secondary-button" disabled={busy} onClick={close}>Закрити</button>}
   </div>
  </div>
 </div>
 return <Modal title="Ранги та вислуга" size="wide" className="employee-form-modal seniority-modal" busy={busy} onClose={close} footer={footer}>
  <div ref={owner} className="employee-card">
   <header className="employee-card-header">
    <div className="employee-card-avatar" aria-hidden="true"><UserRound size={23}/></div>
    <div className="employee-card-identity"><h3>{fullName(row.employee)}</h3><p>{row.employee.position.name} · {row.employee.department.name}</p><small className="employee-muted">{employeeTypeLabels[row.employee.employeeType]}</small></div>
   </header>
   <nav className="employee-card-tabs" role="tablist" aria-label="Напрями кадрових показників" onKeyDown={navigateTabs}>
    {directionsFor(row.employee.employeeType).map(direction=><button type="button" key={direction} role="tab" id={id+direction} aria-selected={kind===direction} aria-controls={id+'-panel'} tabIndex={kind===direction?0:-1} disabled={busy}
     onClick={()=>{if(direction!==kind)requestClose(()=>{reset(direction==='allowance'?row.allowance:row.rank);onSwitch(direction)})}}>{direction==='allowance'?'Надбавка за вислугу':'Ранг'}<small>{direction==='allowance'?allowanceLabel(row.allowance):rankLabel(row)}</small></button>)}
   </nav>
   {row.employee.employeeType==='staff'&&<p className="employee-hint seniority-staff-note">Облік рангів застосовується до посадових осіб місцевого самоврядування.</p>}
   <div id={id+'-panel'} role="tabpanel" aria-labelledby={id+kind}>
    {!editing?<section className="seniority-overview" aria-label={title}>
     <div className="seniority-overview-heading"><strong className={value?'seniority-value':'seniority-empty'}>{headline}</strong><button type="button" className="secondary-button" onClick={edit}><Pencil size={16} aria-hidden="true"/>{value?'Редагувати':kind==='allowance'?'Внести надбавку':'Внести ранг'}</button></div>
     {value&&(rankValue||value.effectiveOn||value.reviewOn)&&<dl className="info-grid seniority-dates">
      {rankValue&&<InfoItem label={rankValue.effectiveOn&&rankValue.effectiveOn!==rankValue.assignedOn?'Дата присвоєння':'Присвоєно та діє з'} value={formatDate(rankValue.assignedOn)}/>}
      {value.effectiveOn&&(!rankValue||value.effectiveOn!==rankValue.assignedOn)&&<InfoItem label="Початок дії" value={formatDate(value.effectiveOn)}/>}
      {value.reviewOn&&<InfoItem label="Наступна перевірка" value={formatDate(value.reviewOn)}/>}
     </dl>}
     {document&&<p className="seniority-document"><span>Документ-підстава</span><span>{document}</span></p>}
    </section>:<form id={id} ref={form} noValidate className="employee-form" aria-busy={busy} onSubmit={e=>{e.preventDefault();void mutate()}}>
     <InfoSection title={kind==='allowance'?'Відомості про надбавку':'Відомості про ранг'}>
      <fieldset className="recipient-fieldset" disabled={busy}><div className="employee-form-grid">
       {kind==='allowance'?<>
        {select('status','Статус',[{value:'confirmed',label:'Підтверджено'},{value:'not_applicable',label:'Не застосовується'}])}
        {applicable&&select('percentage','Відсоток',allowancePercentages.map(n=>({value:String(n),label:`${n}%`})),true)}
        {applicable&&date('effectiveOn','Дата початку дії',true)}
       </>:<>
        {select('rank','Номер рангу',Array.from({length:15},(_,i)=>({value:String(i+1),label:`${i+1} ранг`})),true)}
        {date('assignedOn','Дата присвоєння',true)}
       </>}
      </div></fieldset>
      {kind==='allowance'&&applicable&&<div className="seniority-date-help">
       <button type="button" className="secondary-button" disabled={busy||!canCopyDocumentDate(draft)} onClick={()=>{const next=copyDocumentDate(draft);setEffectiveRevision(v=>v+1);setDraft(next);setDates(v=>({...v,effectiveOn:parseDateInput(next.effectiveOn)??''}));setErrors(v=>({...v,effectiveOn:undefined}))}}>Використати дату документа</button>
       {futureDocumentDate&&<span className="field-error">Дата документа пізніша за сьогодні. Її не можна використати як підтверджений початок дії.</span>}
      </div>}
      {kind==='rank'&&<>
       <div className="seniority-date-option">
        <button type="button" className="seniority-switch" role="switch" aria-checked={separateDate} aria-labelledby={id+'-separate-label'} aria-describedby={id+'-separate-hint'} aria-controls={separateDate?id+'-separate-field':undefined} disabled={busy}
         onClick={()=>{const next=toggleSeparateDate(draft,!separateDate);setSeparateDate(!separateDate);setDraft(next);setDates(v=>({...v,effectiveOn:parseDateInput(next.effectiveOn)??''}));setErrors(v=>({...v,effectiveOn:undefined}))}}><span aria-hidden="true"/></button>
        <div><span id={id+'-separate-label'}>Окрема дата початку дії</span><small id={id+'-separate-hint'}>За замовчуванням збігається з датою присвоєння</small></div>
       </div>
       {separateDate&&<div id={id+'-separate-field'} className="employee-form-grid">{date('effectiveOn','Дата початку дії')}</div>}
      </>}
     </InfoSection>
     <InfoSection title="Документальна підстава"><fieldset className="recipient-fieldset" disabled={busy}><div className="employee-form-grid">
      {select('documentType','Тип документа',documentTypeOptions(draft.documentType))}{text('documentNumber','Номер документа',100)}{date('documentDate','Дата документа')}
     </div></fieldset></InfoSection>
     <InfoSection title="Контроль"><div className="employee-form-grid">{date('reviewOn','Дата наступної перевірки')}</div></InfoSection>
    </form>}
   </div>
  </div>
  {clearing&&<ConfirmDialog title={kind==='allowance'?'Очистити надбавку?':'Очистити поточний ранг?'} message="Поточний запис і незбережені зміни цього напряму буде вилучено. Попередня версія не зберігається окремо. Інший показник залишиться без змін." confirmLabel="Очистити" error={error} onCancel={()=>{if(!inFlight.current){setClearing(false);setError('')}}} onConfirm={()=>mutate(true)}/>}
 </Modal>
}
