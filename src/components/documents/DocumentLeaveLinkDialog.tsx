import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { DocumentLeaveLinkInput, DocumentLeaveLinks } from '../../../shared/documents'
import type { LeaveRecord } from '../../../shared/leave'
import { formatDate } from '../../lib/dates'
import { leaveLabels } from '../leave/presentation'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import Modal from '../Modal'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import { documentMessage } from './model'
import { leaveLinkReason, verifyLeaveLink } from './leave-links-model'
import { uncertainDocumentResult } from './mutations'

export default function DocumentLeaveLinkDialog({documentId,navigationGuard,onClose,onChanged}:{documentId:string;navigationGuard:RefObject<NavigationGuard>;onClose:()=>void;onChanged:()=>void}) {
  const choiceId=useId()
  const [retry,setRetry]=useState(0),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [data,setData]=useState<{key:number;snapshot?:DocumentLeaveLinks;rows?:{record:LeaveRecord;owner:string|null}[];error?:string}>()
  const unresolved=useRef<DocumentLeaveLinkInput|null>(null),pending=useRef(false),alive=useRef(false),owner=useRef<HTMLDivElement>(null)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    let current=true
    async function load(){
      try {
        const snapshot=await window.hromadaHR.documents.listLeaveLinks(documentId)
        if(!current)return
        if(!snapshot.ok){setData({key:retry,error:documentMessage(snapshot.error.code)});return}
        if(snapshot.data.document.employeeIds.length!==1){setData({key:retry,error:documentMessage('DOCUMENT_EMPLOYEE_REQUIRED')});return}
        const records=await window.hromadaHR.leave.listRecords(snapshot.data.document.employeeIds[0])
        if(!current)return
        if(!records.ok){setData({key:retry,error:'Не вдалося завантажити відпустки працівника.'});return}
        const rows=await Promise.all(records.data.map(async record=>{
          // Invalid requisites cannot become candidates; no extra IPC is needed for them.
          if(leaveLinkReason(snapshot.data.document,record,null))return {record,owner:null}
          const link=await window.hromadaHR.documents.getLeaveDocument(record.id)
          if(!link.ok)throw Error('READ_FAILED')
          return {record,owner:link.data?.document.id??null}
        }))
        if(current)setData({key:retry,snapshot:snapshot.data,rows})
      }catch{if(current)setData({key:retry,error:'Не вдалося перевірити стан зв’язування. Повторіть читання.'})}
    }
    void load();return()=>{current=false}
  },[documentId,retry])
  const current=data?.key===retry?data:undefined
  const close=useUnsavedChanges(!!selected||!!unresolved.current,pending,navigationGuard,owner)
  function refresh(){setSelected('');setRetry(v=>v+1)}
  async function execute(checkOnly=false) {
    const row=current?.rows?.find(row=>row.record.id===selected),document=current?.snapshot?.document
    if(pending.current||(!checkOnly&&(!row||!document)))return
    const input=unresolved.current??(row&&document?{documentId,leaveRecordId:row.record.id,expectedDocumentRevision:document.revision,expectedLeaveRevision:row.record.revision}:null)
    if(!input)return
    pending.current=true;setBusy(true);setError('')
    try {
      if(!checkOnly){
        const result=await window.hromadaHR.documents.linkLeaveRecord(input)
        if(!alive.current)return
        if(result.ok){unresolved.current=null;onChanged();onClose();return}
        if(!uncertainDocumentResult(result.error.code)){setError(documentMessage(result.error.code));return}
      }
      unresolved.current=input
      const verified=await verifyLeaveLink(window.hromadaHR.documents,input,false)
      if(!alive.current)return
      if(!verified.ok){setError('Результат зв’язування не підтверджено. '+documentMessage(verified.error.code));return}
      unresolved.current=null
      if(verified.data.applied){onChanged();onClose();return}
      refresh();setError('Зв’язок не підтверджено. Відомості перечитуються; перевірте запис перед новою спробою.')
    }catch{if(alive.current){unresolved.current=input;setError('Результат зв’язування невизначений. Перевірте фактичний стан.')}}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  return <Modal title="Пов’язати відпустку" size="large" busy={busy} onClose={()=>close(onClose)} footer={<div className="employee-form-actions">
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>close(onClose)}>Скасувати</button>
    {unresolved.current?<button type="button" className="primary-button" disabled={busy} onClick={()=>void execute(true)}>Перевірити фактичний стан</button>:<button type="button" className="primary-button" disabled={busy||!selected||!current?.snapshot} onClick={()=>void execute()}>Пов’язати відпустку</button>}
  </div>}><div ref={owner} className="personnel-document-details document-leave-selector">
    <p className="employee-hint">Оберіть надання того самого працівника. Номер і дата мають збігатися; жодні реквізити чи дні не змінюються.</p>
    {error&&<Alert variant="error" action={!unresolved.current&&<button type="button" disabled={busy} onClick={refresh}>Перечитати відпустки</button>}>{error}</Alert>}
    {current?.error?<Alert variant="error" action={<button type="button" disabled={busy||!!unresolved.current} onClick={refresh}>Повторити</button>}>{current.error}</Alert>:!current?.rows?<DataState kind="loading" message="Перевірка відпусток і документальних зв’язків…"/>:
      <DictionaryTable label="Відпустки працівника для зв’язування" empty={!current.rows.length?'Зареєстрованих відпусток немає.':undefined} columns={[{label:'Вибір'},{label:'Відпустка'},{label:'Розпорядження'},{label:'Стан зв’язування'}]}>
        {current.rows.map(({record,owner:linkedOwner})=>{const reason=leaveLinkReason(current.snapshot!.document,record,linkedOwner);return <tr key={record.id}>
          <td><input type="radio" name={choiceId} aria-label={'Обрати '+leaveLabels[record.leaveType]+' від '+formatDate(record.startDate)} checked={selected===record.id} disabled={busy||!!unresolved.current||!!reason} onChange={()=>setSelected(record.id)}/></td>
          <td>{leaveLabels[record.leaveType]}<small>{formatDate(record.startDate)}–{formatDate(record.endDate)} · {record.usedDays} к. дн.</small></td>
          <td>{record.orderNumber??'Не зазначено'} · {formatDate(record.orderDate)}</td><td>{reason==='ALREADY_LINKED'?'Пов’язано з цим документом':reason?documentMessage(reason):'Можна пов’язати'}</td>
        </tr>})}
      </DictionaryTable>}
  </div></Modal>
}
