import DocumentLeaveLinksPanel from './DocumentLeaveLinksPanel'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import type { DocumentNumberingSeries, PersonnelDocument } from '../../../shared/documents'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName } from '../../employees/model'
import { formatDate, formatDateTime } from '../../lib/dates'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import ConfirmDialog from '../ConfirmDialog'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { documentMessage, kindLabel } from './model'
import { uncertainDocumentResult } from './mutations'

export default function PersonnelDocumentDetails({id,active,revision,navigationGuard,onBack,onEdit,onDeleted,onChanged}:{id:string;active:boolean;revision:number;navigationGuard:RefObject<NavigationGuard>;onBack:()=>void;onEdit:()=>void;onDeleted:()=>void;onChanged:()=>void}) {
  const [retry,setRetry]=useState(0),[confirm,setConfirm]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[stale,setStale]=useState(false)
  const [state,setState]=useState<{key:string;document?:PersonnelDocument;people?:EmployeeCard[];series?:DocumentNumberingSeries[];error?:string}>()
  const pending=useRef(false),alive=useRef(false),owner=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null)
  const key=JSON.stringify([id,revision,retry])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{if(!active){setConfirm(false);return}heading.current?.focus()},[active,id])
  useEffect(()=>{
    if(!active)return
    let current=true
    setState(undefined)
    void Promise.all([window.hromadaHR.documents.getDocument(id),window.hromadaHR.personnel.listEmployees(),window.hromadaHR.documents.listSeries()]).then(([record,people,series])=>{
      if(!current)return
      if(!record.ok){setState({key,error:documentMessage(record.error.code)});return}
      if(!people.ok){setState({key,error:'Не вдалося завантажити працівників. Повторіть читання зв’язків документа.'});return}
      if(!series.ok){setState({key,error:documentMessage(series.error.code)});return}
      setState({key,document:record.data,people:people.data,series:series.data})
    }).catch(()=>{if(current)setState({key,error:'Не вдалося завантажити картку документа.'})})
    return()=>{current=false}
  },[active,key,id])
  useUnsavedChanges(false,pending,navigationGuard,owner)
  const current=state?.key===key?state:undefined,record=current?.document
  function deleted(){setConfirm(false);onDeleted();notifySystemToast('success','Запис документа видалено','Юридичну чинність документа ця дія не змінює.')}
  function reload(){setConfirm(false);setError('');setUncertain(false);setStale(false);setRetry(v=>v+1)}
  async function verify() {
    const actual=await window.hromadaHR.documents.getDocument(id)
    if(!alive.current)return
    if(!actual.ok){if(actual.error.code==='NOT_FOUND'){deleted();return}setUncertain(true);setError('Результат видалення ще не підтверджено. Повторіть перевірку.');return}
    setUncertain(false);setStale(actual.data.revision!==record?.revision)
    setError(actual.data.revision!==record?.revision?documentMessage('STALE_REVISION'):'Запис усе ще існує. Видалення не підтверджено; можна повторити дію.')
  }
  async function remove(checkOnly=false) {
    if(pending.current||!record)return
    pending.current=true;setBusy(true);setError('')
    try {
      if(checkOnly){await verify();return}
      const result=await window.hromadaHR.documents.deleteDocument(id,record.revision)
      if(!alive.current)return
      if(result.ok){deleted();return}
      if(uncertainDocumentResult(result.error.code)){setUncertain(true);await verify();return}
      setError(documentMessage(result.error.code));if(result.error.code==='STALE_REVISION')setStale(true)
    }catch{if(alive.current){setUncertain(true);setError('Результат видалення невизначений. Перевірте фактичний запис перед повтором.')}}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  return <article ref={owner} className="personnel-document-details">
    <div className="document-context-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>navigationGuard.current(onBack)}><ArrowLeft size={16}/>До реєстру</button>
      {record&&<><button type="button" className="secondary-button" disabled={busy} onClick={()=>navigationGuard.current(onEdit)}><Pencil size={16}/>Редагувати</button><button type="button" className="secondary-button danger-action" disabled={busy} onClick={()=>{setError('');setStale(false);setUncertain(false);setConfirm(true)}}><Trash2 size={16}/>Видалити запис</button></>}
    </div>
    <h2 ref={heading} tabIndex={-1}>Картка кадрового документа</h2>
    {current?.error?<Alert variant="error" action={<button type="button" onClick={reload}>Повторити</button>}>{current.error} Поверніться до реєстру, якщо запис видалено.</Alert>:!record?<DataState kind="loading" message="Завантаження документа…"/>:<>
      <InfoSection title={kindLabel(record)}><dl className="info-grid info-grid-two"><InfoItem label="Номер" value={record.number}/><InfoItem label="Серія реєстрації" value={record.seriesId?(current?.series?.find(s=>s.id===record.seriesId)?.name??'Серія недоступна'):'Без серії'}/><InfoItem label="Дата документа" value={formatDate(record.issuedOn)}/><InfoItem label="Назва документа" value={record.title} wide/>{record.note&&<InfoItem label="Примітка" value={record.note} wide/>}</dl></InfoSection>
      <InfoSection title="Працівник">
        {record.employeeIds.length>1&&<Alert variant="warning">Збережено кілька зв’язків попередньої моделі. Редактор підтримує одного працівника; заміна потребує явного узгодження.</Alert>}
        {record.employeeIds.length?<ul className="document-people">{record.employeeIds.map(id=>{const person=current?.people?.find(p=>p.id===id);return <li key={id}>{person?<><strong>{fullName(person)}</strong><span>{person.position.name} · {person.department.name}</span></>:<Alert variant="warning">Пов’язаний працівник недоступний. Оновіть дані перед редагуванням.</Alert>}</li>})}</ul>:<p className="employee-hint">Працівника не зазначено.</p>}
        {!!record.employeeIds.length&&<p className="employee-hint">Посаду та підрозділ наведено за поточною особовою карткою, а не станом на дату документа.</p>}
      </InfoSection>
      <DocumentLeaveLinksPanel document={record} navigationGuard={navigationGuard} onChanged={()=>{onChanged();requestAnimationFrame(()=>heading.current?.focus())}}/>
      <InfoSection title="Відомості реєстру"><dl className="info-grid info-grid-two"><InfoItem label="Створено" value={formatDateTime(record.createdAt)}/><InfoItem label="Остання зміна" value={formatDateTime(record.updatedAt)}/></dl></InfoSection>
      <InfoSection title="Формування документа"><p className="employee-hint">Формування DOCX за шаблоном буде доступне в наступних версіях HromadaHR.</p></InfoSection>
    </>}
    {active&&confirm&&record&&<ConfirmDialog title="Видалити запис документа?" confirmLabel="Видалити запис" confirmDisabled={busy||uncertain||stale} error={error} onCancel={()=>{if(!pending.current)setConfirm(false)}} onConfirm={()=>remove()}
      message={<div className="document-delete-summary"><p>{kindLabel(record)} № {record.number} від {formatDate(record.issuedOn)}</p><strong>{record.title}</strong><p>Запис документа буде видалено з реєстру. Ця дія не скасовує сам документ як юридичний акт.</p>
        {uncertain&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void remove(true)}>Перевірити фактичний результат</button>}
        {stale&&<button type="button" className="secondary-button" disabled={busy} onClick={reload}>Перечитати документ</button>}
      </div>}/>}
  </article>
}
