import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { DocumentNumberingSeries, DocumentSeriesInput } from '../../../shared/documents'
import { formatDocumentNumber, validNumberPattern } from '../../../shared/document-numbering'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import Modal from '../Modal'
import Select from '../Select'
import ValidatedInput from '../ValidatedInput'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { documentKindOptions, documentMessage, kindLabel } from './model'

type Guard={navigationGuard:RefObject<NavigationGuard>}
export default function DocumentSeriesWorkspace({navigationGuard}:Guard) {
  const [retry,setRetry]=useState(0),[state,setState]=useState<{rows?:DocumentNumberingSeries[];error?:string}>({})
  const [editor,setEditor]=useState<DocumentNumberingSeries|'create'|null>(null),[changing,setChanging]=useState<DocumentNumberingSeries|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false)
  const addButton=useRef<HTMLButtonElement>(null),restoreFocus=useRef(false)
  const pending=useRef(false),owner=useRef<HTMLElement>(null),trigger=useRef<HTMLElement|null>(null),alive=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useUnsavedChanges(uncertain,pending,navigationGuard,owner)
  useEffect(()=>{
    let current=true;setState({})
    void window.hromadaHR.documents.listSeries().then(result=>{if(current)setState(result.ok?{rows:result.data}:{error:documentMessage(result.error.code)})}).catch(()=>{if(current)setState({error:'Серії тимчасово недоступні.'})})
    return()=>{current=false}
  },[retry])
  useEffect(()=>{
    if(state.rows&&restoreFocus.current){restoreFocus.current=false;requestAnimationFrame(()=>{if(document.activeElement===document.body)addButton.current?.focus()})}
  },[state.rows])
  async function changeActive(checkOnly=false) {
    if(pending.current||!changing)return
    pending.current=true;setBusy(true);setError('')
    try {
      if(checkOnly){
        const result=await window.hromadaHR.documents.listSeries()
        if(!alive.current)return
        if(!result.ok){setError(documentMessage(result.error.code));return}
        const actual=result.data.find(s=>s.id===changing.id)
        if(actual&&actual.active!==changing.active){setChanging(null);setUncertain(false);setState({rows:result.data});return}
        setUncertain(false);setChanging(null);setState({rows:result.data});return
      }
      const result=await window.hromadaHR.documents.setSeriesActive(changing.id,changing.revision,!changing.active)
      if(!alive.current)return
      if(result.ok){setChanging(null);setState(v=>({rows:v.rows?.map(s=>s.id===result.data.id?result.data:s)}));notifySystemToast('success','Стан серії оновлено','Наявні номери залишилися без змін.')}
      else {setError(result.error.code==='STALE_REVISION'?'Серію вже змінено. Закрийте підтвердження й оновіть довідник.':documentMessage(result.error.code));if(['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code))setUncertain(true)}
    }catch{if(alive.current){setUncertain(true);setError('Результат зміни стану не підтверджено. Перевірте фактичний стан.')}}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  return <section ref={owner} className="dashboard-panel personnel-dictionary-panel">
    <header className="employee-group-heading"><h2>Серії документів</h2><button ref={addButton} type="button" className="primary-button" disabled={busy||!state.rows} onClick={event=>{trigger.current=event.currentTarget;setEditor('create')}}>Додати серію</button></header>
    <p className="employee-hint">Серії визначають незалежну нумерацію за календарними роками. Налаштуйте їх відповідно до вашої системи діловодства.</p>
    {state.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{state.error}</Alert>:!state.rows?<DataState kind="loading" compact message="Завантаження серій…"/>:
      <DictionaryTable label="Серії документів" columns={[{label:'Назва'},{label:'Вид документа'},{label:'Шаблон номера'},{label:'Початкове значення'},{label:'Стан'},{label:'Дії'}]} empty={!state.rows.length?'Серій ще немає. Ручна реєстрація документів без серії доступна.':undefined}>
        {state.rows.map(series=><tr key={series.id}><td>{series.name}<small className="leave-muted"> · {series.code}</small></td><td>{kindLabel({kind:series.kind,customKind:null})}</td><td>{series.pattern}<small className="leave-muted"> · цифр: {series.minDigits}</small></td><td>{series.startAt}</td><td>{series.active?'Активна':'Архівна'}</td><td><div className="registry-row-actions"><button type="button" className="table-action" disabled={busy} onClick={event=>{trigger.current=event.currentTarget;setEditor(series)}}>Редагувати</button><button type="button" className="table-action" disabled={busy} onClick={event=>{trigger.current=event.currentTarget;setError('');setUncertain(false);setChanging(series)}}>{series.active?'Архівувати':'Відновити'}</button></div></td></tr>)}
      </DictionaryTable>}
    {editor&&<SeriesEditor record={editor==='create'?undefined:editor} navigationGuard={navigationGuard} returnFocus={trigger.current} onClose={()=>{restoreFocus.current=true;setEditor(null);setRetry(v=>v+1)}} onSaved={value=>{setEditor(null);setState(v=>({rows:[...(v.rows??[]).filter(s=>s.id!==value.id),value].sort((a,b)=>a.name.localeCompare(b.name,'uk')||a.id.localeCompare(b.id))}))}}/>}
    {changing&&<ConfirmDialog title={changing.active?'Архівувати серію?':'Відновити серію?'} confirmLabel={changing.active?'Архівувати':'Відновити'} confirmDisabled={busy||uncertain} error={error} message={<><p>{changing.name}. Наявні документи й зайняті номери залишаться без змін.</p>{uncertain&&<button type="button" disabled={busy} onClick={()=>void changeActive(true)}>Перевірити фактичний стан</button>}</>} onCancel={()=>{if(!pending.current)navigationGuard.current(()=>{setChanging(null);setUncertain(false);setRetry(v=>v+1)})}} onConfirm={()=>changeActive()}/>}
  </section>
}

function SeriesEditor({record,navigationGuard,returnFocus,onClose,onSaved}:Guard&{record?:DocumentNumberingSeries;returnFocus:HTMLElement|null;onClose:()=>void;onSaved:(value:DocumentNumberingSeries)=>void}) {
  const fields=(s?:DocumentNumberingSeries):DocumentSeriesInput=>({kind:s?.kind??'head_order',code:s?.code??'',name:s?.name??'',pattern:s?.pattern??'{N}',minDigits:s?.minDigits??1,startAt:s?.startAt??1})
  const [draft,setDraft]=useState(()=>fields(record)),initial=useRef(JSON.stringify(fields(record)))
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[stale,setStale]=useState(false)
  const pending=useRef(false),alive=useRef(false),form=useRef<HTMLFormElement>(null),id=useId()
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const close=useUnsavedChanges(JSON.stringify(draft)!==initial.current||uncertain,pending,navigationGuard,form)
  const valid=validNumberPattern(draft.pattern)&&draft.minDigits>=1&&draft.minDigits<=9&&Number.isInteger(draft.minDigits)&&draft.startAt>=1&&draft.startAt<=999999999&&Number.isInteger(draft.startAt)&&/^[\p{L}\p{N}_-]{1,40}$/u.test(draft.code.trim())&&!!draft.name.trim()
  const locked=busy||uncertain||stale
  const same=(s:DocumentNumberingSeries)=>JSON.stringify(fields(s))===JSON.stringify({...draft,name:draft.name.trim(),code:draft.code.trim()})
  async function save(checkOnly=false) {
    if(pending.current||(!checkOnly&&!valid))return
    pending.current=true;setBusy(true);setError('')
    try {
      if(checkOnly){
        const result=await window.hromadaHR.documents.listSeries()
        if(!alive.current)return
        if(!result.ok){setError(documentMessage(result.error.code));return}
        const actual=result.data.find(s=>record?s.id===record.id:s.kind===draft.kind&&s.code.normalize('NFC').toLocaleLowerCase('uk-UA')===draft.code.trim().normalize('NFC').toLocaleLowerCase('uk-UA'))
        if(actual&&same(actual)&&(!record||actual.revision===record.revision+1)){initial.current=JSON.stringify(draft);onSaved(actual);return}
        setUncertain(false)
        if(actual&&(!record||actual.revision!==record.revision))setStale(true)
        setError('Перевірку завершено. Якщо запис змінився, закрийте форму й відкрийте актуальну серію; чернетку збережено.');return
      }
      const result=record?await window.hromadaHR.documents.updateSeries({...draft,id:record.id,expectedRevision:record.revision}):await window.hromadaHR.documents.createSeries(draft)
      if(!alive.current)return
      if(result.ok){initial.current=JSON.stringify(draft);onSaved(result.data);notifySystemToast('success','Серію збережено','Налаштування застосовано.');return}
      setError(result.error.code==='STALE_REVISION'?'Серію вже змінено. Чернетку збережено; перечитайте актуальну серію.':documentMessage(result.error.code));if(result.error.code==='STALE_REVISION'||result.error.code==='SERIES_USED')setStale(true)
      if(['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code))setUncertain(true)
    }catch{if(alive.current){setUncertain(true);setError('Результат збереження не підтверджено. Перевірте фактичний стан перед повтором.')}}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  return <Modal title={record?'Редагувати серію':'Додати серію'} size="large" busy={busy} onClose={()=>close(onClose)} returnFocus={returnFocus} footer={<div className="employee-form-footer">{error&&<Alert variant="error">{error}</Alert>}<div className="employee-form-actions">{stale&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>close(onClose)}>Перечитати серію</button>}{uncertain&&<button type="button" disabled={busy} onClick={()=>void save(true)}>Перевірити фактичний стан</button>}<button type="button" className="secondary-button" disabled={busy} onClick={()=>close(onClose)}>Скасувати</button><button type="submit" form={id} className="primary-button" disabled={locked||!valid}>Зберегти</button></div></div>}>
    <form ref={form} id={id} className="employee-form" onSubmit={event=>{event.preventDefault();void save()}}>
      {record?.used&&<Alert variant="info">У серії вже присвоювали номери. Можна змінити лише назву; вид, код і формат залишаються незмінними.</Alert>}
      <div className="employee-field"><span>Вид документа</span><Select label="Вид документа серії" value={draft.kind} options={documentKindOptions} disabled={locked||record?.used} advanceOnSelect={false} onChange={value=>setDraft(v=>({...v,kind:value as DocumentSeriesInput['kind']}))}/></div>
      {(['name','code','pattern','minDigits','startAt'] as const).map(key=><label className="recipient-field employee-field" key={key}>{({name:'Назва',code:'Код',pattern:'Шаблон номера',minDigits:'Мінімальна кількість цифр',startAt:'Початковий номер'})[key]}<ValidatedInput required type={key==='minDigits'||key==='startAt'?'number':'text'} maxLength={key==='name'?120:key==='code'?40:60} min={key==='minDigits'||key==='startAt'?1:undefined} max={key==='minDigits'?9:key==='startAt'?999999999:undefined} disabled={locked||(record?.used&&key!=='name')} value={draft[key]} onChange={event=>setDraft(v=>({...v,[key]:key==='minDigits'||key==='startAt'?Number(event.target.value):event.target.value}))}/></label>)}
      <p className="employee-hint">{'{N}'} — порядковий номер (рівно один раз); {'{YYYY}'} — рік документа (необов’язково, один раз). Решта символів — буквальні складові номера.</p>
      {valid?<p className="employee-hint">Приклад для 2027 року: {formatDocumentNumber(draft,draft.startAt,2027)}. Це приклад, не зарезервований номер.</p>:<Alert variant="info">Перевірте назву, код (літери, цифри, дефіс або підкреслення), шаблон і числові межі.</Alert>}
    </form>
  </Modal>
}
