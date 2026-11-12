import { useEffect, useRef, useState, type RefObject } from 'react'
import type { DocumentLeaveLink, DocumentLeaveLinkInput, DocumentLeaveLinks, PersonnelDocument } from '../../../shared/documents'
import { formatDate } from '../../lib/dates'
import { leaveLabels } from '../leave/presentation'
import LeaveRecordAction from '../leave/LeaveRecordAction'
import type { RegistrationHistory } from '../leave/registry'
import InfoSection from '../InfoSection'
import DictionaryTable from '../DictionaryTable'
import Alert from '../Alert'
import DataState from '../DataState'
import ConfirmDialog from '../ConfirmDialog'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { notifySystemToast } from '../SystemToastHost'
import DocumentLeaveLinkDialog from './DocumentLeaveLinkDialog'
import { documentMessage } from './model'
import { verifyLeaveLink } from './leave-links-model'
import { uncertainDocumentResult } from './mutations'

export default function DocumentLeaveLinksPanel({document,navigationGuard,onChanged}:{document:PersonnelDocument;navigationGuard:RefObject<NavigationGuard>;onChanged:()=>void}) {
  const [retry,setRetry]=useState(0),[data,setData]=useState<{key:string;value?:DocumentLeaveLinks;error?:string}>()
  const [modal,setModal]=useState<{kind:'link'}|{kind:'view';id:string}|null>(null),[unlink,setUnlink]=useState<DocumentLeaveLink|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const pending=useRef(false),unresolved=useRef<DocumentLeaveLinkInput|null>(null),owner=useRef<HTMLDivElement>(null),alive=useRef(false)
  const key=JSON.stringify([document.id,document.revision,retry])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    let current=true
    void window.hromadaHR.documents.listLeaveLinks(document.id).then(result=>{if(current){if(result.ok)unresolved.current=null;setData(result.ok?{key,value:result.data}:{key,error:documentMessage(result.error.code)})}})
      .catch(()=>{if(current)setData({key,error:'Не вдалося завантажити пов’язані відпустки.'})})
    return()=>{current=false}
  },[document.id,key])
  useUnsavedChanges(false,pending,navigationGuard,owner)
  const current=data?.key===key?data:undefined
  const changed=()=>{setModal(null);setUnlink(null);onChanged();notifySystemToast('success','Документальні зв’язки оновлено','Відпустки та дні не змінено.')}
  async function remove(checkOnly=false) {
    if(pending.current||!unlink||!current?.value)return
    const input=unresolved.current??{documentId:document.id,leaveRecordId:unlink.leaveRecordId,expectedDocumentRevision:current.value.document.revision,expectedLeaveRevision:unlink.leaveRevision}
    pending.current=true;setBusy(true);setError('')
    try {
      if(!checkOnly){
        const result=await window.hromadaHR.documents.unlinkLeaveRecord(input)
        if(!alive.current)return
        if(result.ok){unresolved.current=null;changed();return}
        if(!uncertainDocumentResult(result.error.code)){setError(documentMessage(result.error.code));return}
      }
      unresolved.current=input
      const actual=await verifyLeaveLink(window.hromadaHR.documents,input,true)
      if(!alive.current)return
      if(!actual.ok){setError('Результат розірвання не підтверджено. '+documentMessage(actual.error.code));return}
      unresolved.current=null
      if(actual.data.applied){changed();return}
      setData({key,value:actual.data.snapshot});setUnlink(null);setError('Зв’язок усе ще існує. Дані перечитано, повторіть явну дію за потреби.')
    }catch{if(alive.current){unresolved.current=input;setError('Результат невизначений. Перевірте фактичний стан перед повтором.')}}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  const history:RegistrationHistory={records:[],loading:false,error:'',retry:()=>{},open:()=>{},suspended:false}
  return <div ref={owner}><InfoSection title="Пов’язані відпустки" action={<button type="button" className="secondary-button" disabled={busy||document.employeeIds.length!==1||!current?.value} onClick={()=>setModal({kind:'link'})}>Пов’язати відпустку</button>}>
    {document.employeeIds.length!==1&&<p className="employee-hint">Спочатку зазначте рівно одного працівника в редакторі документа; старі множинні зв’язки потрібно узгодити явно.</p>}
    {error&&!unlink&&<Alert variant="error">{error}</Alert>}
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?.value?<DataState kind="loading" compact message="Завантаження зв’язків…"/>:
      <DictionaryTable label="Пов’язані відпустки документа" empty={!current.value.links.length?'Документ ще не пов’язаний із відпустками.':undefined} columns={[{label:'Відпустка'},{label:'Дати'},{label:'Днів'},{label:'Статус'},{label:'Дії'}]}>
        {current.value.links.map(link=><tr key={link.leaveRecordId}><td>{leaveLabels[link.leaveType]}</td><td>{formatDate(link.startDate)}–{formatDate(link.endDate)}</td><td>{link.usedDays}</td><td>{link.status==='cancelled'?'Реєстрацію відпустки скасовано':'Зареєстровано'}</td><td><div className="document-context-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setModal({kind:'view',id:link.leaveRecordId})}>Переглянути</button><button type="button" className="secondary-button danger-action" disabled={busy} onClick={()=>{unresolved.current=null;setError('');setUnlink(link)}}>Розірвати зв’язок</button></div></td></tr>)}
      </DictionaryTable>}
  </InfoSection>
    {modal?.kind==='link'&&<DocumentLeaveLinkDialog documentId={document.id} navigationGuard={navigationGuard} onClose={()=>setModal(null)} onChanged={changed}/>}
    {modal?.kind==='view'&&<LeaveRecordAction id={modal.id} kind="view" expectedEmployeeId={document.employeeIds[0]} navigationGuard={navigationGuard} history={history} onClose={()=>setModal(null)} onChanged={onChanged}/>}
    {unlink&&<ConfirmDialog title="Розірвати зв’язок із відпусткою?" confirmLabel="Розірвати зв’язок" confirmDisabled={busy||!!unresolved.current} error={error}
      message={<div className="document-delete-summary"><p>{leaveLabels[unlink.leaveType]} · {formatDate(unlink.startDate)}–{formatDate(unlink.endDate)}</p><p>Зв’язок між документом і відпусткою буде прибрано. Сам документ і запис відпустки залишаться без змін.</p>
        {!!unresolved.current&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void remove(true)}>Перевірити фактичний стан</button>}
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{unresolved.current=null;setUnlink(null);setRetry(v=>v+1)}}>Перечитати зв’язки</button>
      </div>} onCancel={()=>{if(!pending.current){setUnlink(null);if(unresolved.current)setRetry(v=>v+1)}}} onConfirm={()=>remove()}/>}
  </div>
}
