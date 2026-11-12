import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { PersonnelDocument, PersonnelDocumentKind } from '../../../shared/documents'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName } from '../../employees/model'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import Alert from '../Alert'
import DataState from '../DataState'
import DateField from '../DateField'
import InfoSection from '../InfoSection'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import Select from '../Select'
import ValidatedInput, { ValidatedTextarea } from '../ValidatedInput'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { changeDocumentKind, documentDraft, documentDraftErrors, documentInput, documentKindOptions, documentMessage, reconcileDocumentEmployees, selectDocumentEmployee, type DocumentDraft } from './model'
import { submitDocument, updateOutcome, type DocumentAttempt, type SavePayload } from './mutations'

type Props={id?:string;navigationGuard:RefObject<NavigationGuard>;onClose:()=>void;onSaved:(value:PersonnelDocument)=>void;returnFocus:HTMLElement|null}
export default function PersonnelDocumentEditor(props:Props) {
  const [retry,setRetry]=useState(0),[peopleRetry,setPeopleRetry]=useState(0)
  const [record,setRecord]=useState<{key:string;value?:PersonnelDocument|null;linked?:boolean;error?:string}>()
  const [people,setPeople]=useState<{key:number;data?:EmployeeCard[];error?:string}>()
  const key=JSON.stringify([props.id,retry])
  useEffect(()=>{
    let alive=true
    if(!props.id){setRecord({key,value:null});return}
    void Promise.all([window.hromadaHR.documents.getDocument(props.id),window.hromadaHR.documents.listLeaveLinks(props.id)]).then(([record,links])=>{
      if(!alive)return
      if(!record.ok){setRecord({key,error:documentMessage(record.error.code)});return}
      if(!links.ok){setRecord({key,error:documentMessage(links.error.code)});return}
      setRecord({key,value:links.data.document,linked:links.data.links.length>0})
    }).catch(()=>{if(alive)setRecord({key,error:'Не вдалося прочитати актуальний документ і його зв’язки.'})})
    return()=>{alive=false}
  },[props.id,key])
  useEffect(()=>{
    let alive=true
    void window.hromadaHR.personnel.listEmployees().then(result=>{if(alive)setPeople(result.ok?{key:peopleRetry,data:result.data}:{key:peopleRetry,error:'Не вдалося завантажити працівників.'})})
      .catch(()=>{if(alive)setPeople({key:peopleRetry,error:'Перелік працівників тимчасово недоступний.'})})
    return()=>{alive=false}
  },[peopleRetry])
  const current=record?.key===key?record:undefined,currentPeople=people?.key===peopleRetry?people:undefined
  if(current?.value!==undefined)return <DocumentForm key={key} {...props} record={current.value??undefined} identityLocked={!!current.linked} people={currentPeople?.data} peopleError={currentPeople?.error}
    reloadPeople={()=>setPeopleRetry(v=>v+1)} reloadRecord={()=>setRetry(v=>v+1)}/>
  return <Modal title={props.id?'Редагувати документ':'Додати документ'} onClose={props.onClose} returnFocus={props.returnFocus} size="large">
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:<DataState kind="loading" message="Завантаження актуального документа…"/>}
  </Modal>
}

function DocumentForm({record,identityLocked,people,peopleError,reloadPeople,reloadRecord,...props}:Props&{record?:PersonnelDocument;identityLocked:boolean;people?:EmployeeCard[];peopleError?:string;reloadPeople:()=>void;reloadRecord:()=>void}) {
  const [draft,setDraft]=useState(()=>documentDraft(record)),initial=useRef(JSON.stringify(documentDraft(record)))
  const [iso,setIso]=useState(record?.issuedOn??'')
  const [requestId]=useState(()=>crypto.randomUUID())
  const [errors,setErrors]=useState<Partial<Record<keyof DocumentDraft,string>>>({})
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[blocked,setBlocked]=useState(false),[reconcile,setReconcile]=useState(false)
  const attempt=useRef<DocumentAttempt>({pending:false,unresolved:null}),pending=useRef(false),alive=useRef(false),form=useRef<HTMLFormElement>(null),employeeField=useRef<HTMLDivElement>(null)
  const id=useId()
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const requestClose=useUnsavedChanges(JSON.stringify(draft)!==initial.current||!!attempt.current.unresolved,pending,props.navigationGuard,form)
  const uncertain=attempt.current.unresolved,locked=busy||!!uncertain||blocked
  const missing=!!people&&draft.employeeIds.some(id=>!people.some(person=>person.id===id)),multiple=draft.employeeIds.length>1
  function change<K extends keyof DocumentDraft>(key:K,value:DocumentDraft[K]){setDraft(v=>({...v,[key]:value}));setErrors(v=>({...v,[key]:undefined}))}
  function saved(value:PersonnelDocument){initial.current=JSON.stringify(draft);attempt.current.unresolved=null;props.onSaved(value);notifySystemToast('success',record?'Документ оновлено':'Документ створено','Реквізити збережено.')}
  async function submit() {
    if(pending.current||stale||blocked||!people||missing||multiple)return
    if(uncertain?.kind==='edit')return
    const next=documentDraftErrors(draft);setErrors(next)
    if(Object.keys(next).length){requestAnimationFrame(()=>{if(form.current)focusFirstInvalid(form.current)});return}
    if(!form.current?.checkValidity()){form.current?.reportValidity();return}
    pending.current=true;setBusy(true);setError('')
    const payload:SavePayload=record?{kind:'edit',input:{...documentInput(draft),id:record.id,expectedRevision:record.revision}}:{kind:'create',input:{...documentInput(draft),requestId}}
    try {
      const result=await submitDocument(window.hromadaHR.documents,attempt.current,payload)
      if(!alive.current||!result)return
      if(result.ok){saved(result.data);return}
      setError(result.error.code==='DOCUMENT_REQUEST_CONFLICT'?documentMessage(result.error.code):attempt.current.unresolved?'Результат збереження не підтверджено. Чернетку та надісланий запит збережено; поля тимчасово заблоковано.':documentMessage(result.error.code))
      if(result.error.code==='STALE_REVISION'||result.error.code==='NOT_FOUND')setStale(true)
      if(result.error.code==='DOCUMENT_REQUEST_CONFLICT')setBlocked(true)
      if(result.error.code==='DOCUMENT_NUMBER_CONFLICT')setErrors({number:documentMessage(result.error.code)})
      if(result.error.code==='DOCUMENT_EMPLOYEE_NOT_FOUND')reloadPeople()
    }finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  async function verifyUpdate() {
    const unresolved=attempt.current.unresolved
    if(pending.current||unresolved?.kind!=='edit')return
    pending.current=true;setBusy(true)
    try {
      const actual=await window.hromadaHR.documents.getDocument(unresolved.input.id)
      if(!alive.current)return
      if(!actual.ok){setError(documentMessage(actual.error.code));return}
      const outcome=updateOutcome(actual.data,unresolved.input)
      if(outcome==='saved'){saved(actual.data);return}
      attempt.current.unresolved=null;setStale(outcome==='stale')
      setError(outcome==='stale'?documentMessage('STALE_REVISION'):'Зміни не підтверджено: ревізія залишилася початковою. Можна перевірити поля й повторити збереження.')
    }catch{if(alive.current)setError('Не вдалося перевірити фактичний результат. Повторіть перевірку.')}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  const close=()=>requestClose(props.onClose)
  const text=(key:'number'|'title'|'customKind',label:string,maxLength:number,placeholder?:string)=><div className="recipient-field employee-field"><label htmlFor={id+key}>{label} *</label><ValidatedInput id={id+key} required maxLength={maxLength} value={draft[key]} placeholder={placeholder} disabled={locked||(identityLocked&&key!=='title')} aria-invalid={!!errors[key]} aria-describedby={errors[key]?id+key+'-error':undefined} onChange={event=>change(key,event.target.value)}/>{errors[key]&&<span id={id+key+'-error'} className="field-error">{errors[key]}</span>}</div>
  return <Modal title={record?'Редагувати документ':'Додати документ'} size="large" className="employee-form-modal document-editor-modal" busy={busy} onClose={close} returnFocus={props.returnFocus}
    footer={<div className="employee-form-footer">{error&&<Alert variant="error">{error}</Alert>}<div className="employee-form-actions">
      {stale&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>requestClose(reloadRecord)}>Перечитати документ</button>}
      {uncertain?.kind==='edit'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void verifyUpdate()}>Перевірити фактичний результат</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={close}>Скасувати</button>
      <button type="submit" form={id} className="primary-button" disabled={busy||stale||blocked||!people||missing||multiple||uncertain?.kind==='edit'}>{busy?'Збереження…':uncertain?'Повторити той самий запит':'Зберегти'}</button>
    </div></div>}>
    <form ref={form} id={id} className="employee-form" noValidate onSubmit={event=>{event.preventDefault();void submit()}}>
      <InfoSection title="Реквізити документа">{identityLocked&&<Alert variant="info">Документ пов’язаний із відпустками. Можна змінювати назву та примітку; для зміни інших реквізитів спочатку розірвіть зв’язки.</Alert>}<div className="employee-form-grid">
        <div className="recipient-field employee-field"><span>Вид документа *</span><Select label="Вид документа" required value={draft.kind} options={documentKindOptions} disabled={locked||identityLocked} advanceOnSelect={false} onChange={value=>setDraft(v=>changeDocumentKind(v,value as PersonnelDocumentKind))}/></div>
        {text('number','Номер',80,'001-к, 15-ос, 123/2026')}
        <div className="recipient-field employee-field"><label htmlFor={id+'date'}>Дата документа *</label><DateField id={id+'date'} value={iso} initialDraft={draft.issuedOn} required disabled={locked||identityLocked} error={errors.issuedOn} onDraftChange={value=>change('issuedOn',value)} onChange={setIso}/></div>
      </div>{draft.kind==='other'&&text('customKind','Уточніть вид документа',120)}{text('title','Назва документа',500)}
        <label className="recipient-field employee-field">Примітка<ValidatedTextarea rows={3} maxLength={2000} value={draft.note} disabled={locked} onChange={event=>change('note',event.target.value)}/>{errors.note&&<span className="field-error">{errors.note}</span>}</label>
      </InfoSection>
      <InfoSection title="Працівник">
        {peopleError?<Alert variant="error" action={<button type="button" disabled={busy} onClick={reloadPeople}>Повторити завантаження</button>}>{peopleError}</Alert>:!people?<DataState kind="loading" compact message="Завантаження працівників…"/>:<>
          {multiple?<Alert variant="warning" action={<button type="button" className="secondary-button" disabled={locked||identityLocked} onClick={()=>setReconcile(true)}>Узгодити зв’язки</button>}>У документі збережено кілька працівників. Поточний редактор розрахований на одну особу. Наявні зв’язки збережено: {draft.employeeIds.map(id=>people.find(p=>p.id===id)).map(p=>p?fullName(p):'Недоступний працівник').join('; ')}.</Alert>
            :<div ref={employeeField} className="recipient-field employee-field"><span>Працівник</span><Select label="Працівник документа" searchable value={draft.employeeIds[0]??''} options={[{value:'',label:'Не зазначено'},...people.map(person=>({value:person.id,label:fullName(person),description:person.position.name+' · '+person.department.name,searchText:person.position.name+' '+person.department.name}))]} advanceOnSelect={false} disabled={locked||identityLocked} onChange={value=>setDraft(v=>selectDocumentEmployee(v,value))} onClear={()=>setDraft(v=>selectDocumentEmployee(v,''))} clearLabel="Очистити вибір працівника"/></div>}
          {missing&&<Alert variant="warning" action={<button type="button" disabled={busy} onClick={reloadPeople}>Оновити перелік</button>}>Збереженого працівника не знайдено. Перевірте зв’язок перед збереженням.</Alert>}
          {!people.length&&<p className="employee-hint">Працівників ще немає. Документ можна зберегти без прив’язки до особи.</p>}
          {!draft.employeeIds.length&&<p className="employee-hint">Для загального документа працівника можна не зазначати.</p>}
        </>}
      </InfoSection>
    </form>
    {reconcile&&<ConfirmDialog title="Узгодити зв’язки документа?" confirmLabel="Перейти до одиночного вибору" message="Наявні зв’язки буде прибрано лише з чернетки. Виберіть одного працівника або явно залиште поле порожнім. Зміни набудуть чинності після збереження документа." onCancel={()=>setReconcile(false)} onConfirm={()=>{setDraft(v=>reconcileDocumentEmployees(v));setReconcile(false);requestAnimationFrame(()=>employeeField.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus())}}/>}
  </Modal>
}
