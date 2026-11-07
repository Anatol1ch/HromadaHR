import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { EmployeeLeaveRight, LeaveRightInput, LeaveRecord } from '../../../shared/leave'
import { leaveOptions } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'
import Alert from '../Alert'
import { formatDateTime } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
export default function LeaveRights({employeeId,records,navigationGuard}: {employeeId:string;records:LeaveRecord[];navigationGuard:RefObject<NavigationGuard>}) {
  const radioId=useId()
  const [saved,setSaved]=useState<EmployeeLeaveRight[]>()
  const [draft,setDraft]=useState<Record<string,string>>({})
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
  const owner=useRef<HTMLElement>(null),pending=useRef(false),alive=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{let active=true;void window.hromadaHR.leave.listRights(employeeId).then(result=>{if(!active)return;if(result.ok){setSaved(result.data);setDraft(Object.fromEntries(result.data.map(r=>[r.leaveType,r.status])))}else setError(personnelMessage(result.error.code))}).catch(()=>{if(active)setError('Не вдалося завантажити права.')});return()=>{active=false}},[employeeId,retry])
  const changes:LeaveRightInput[]=leaveOptions.filter(option=>(draft[option.value]??'')!==(saved?.find(r=>r.leaveType===option.value)?.status??'')).map(option=>({leaveType:option.value,status:(draft[option.value]||null) as LeaveRightInput['status']}))
  useUnsavedChanges(changes.length>0,pending,navigationGuard,owner)
  async function save(){if(pending.current||!saved||!changes.length)return;pending.current=true;setBusy(true);setError('');try{const result=await window.hromadaHR.leave.saveRights(employeeId,changes);if(!alive.current)return;if(result.ok){setSaved(result.data);setDraft(Object.fromEntries(result.data.map(r=>[r.leaveType,r.status])));notifySystemToast('success','Статуси права збережено','Дні та минулі реєстрації не змінено.')}else setError(personnelMessage(result.error.code))}catch{if(alive.current)setError('Результат не підтверджено. Повторне збереження тих самих статусів безпечне.')}finally{pending.current=false;if(alive.current)setBusy(false)}}
  return <section ref={owner} className="dashboard-panel leave-rights-panel"><header className="employee-group-heading"><h2>Права на відпустки</h2><button type="button" className="secondary-button" disabled={!saved||!changes.length||busy} onClick={()=>void save()}>Зберегти перевірку</button></header>
    <p className="leave-muted">Поточний висновок кадровика. Статус не нараховує днів і не змінює минулі відпустки.</p>
    {error&&<Alert variant="error" action={!saved&&<button type="button" onClick={()=>{setError('');setRetry(v=>v+1)}}>Повторити</button>}>{error}</Alert>}
    <div className="leave-rights-list">{leaveOptions.map(option=>{const right=saved?.find(r=>r.leaveType===option.value);return <div className="leave-right-row" key={option.value}>
      <div className="leave-right-description"><LeaveTypeIcon type={option.value}/><div><strong id={radioId+option.value}>{option.label}</strong><span className={'leave-right-status is-'+(right?.status??'unknown')}>{right?.status==='has_right'?'Право підтверджено':right?.status==='no_right'?'Права немає':'Не перевірено'}</span>{right&&<small>Попередня перевірка: {formatDateTime(right.checkedAt)}</small>}</div></div>
      <div role="radiogroup" aria-labelledby={radioId+option.value} className="leave-right-switch">{[{value:'',label:'Не перевірено'},{value:'has_right',label:'Право є'},{value:'no_right',label:'Права немає'}].map(state=><label key={state.value}><input type="radio" name={radioId+option.value} value={state.value} checked={(draft[option.value]??'')===state.value} disabled={!saved||busy} onChange={()=>setDraft(current=>({...current,[option.value]:state.value}))}/><span>{state.label}</span></label>)}</div>
      {draft[option.value]==='no_right'&&records.some(r=>r.employeeId===employeeId&&r.leaveType===option.value)&&<p className="leave-right-warning">Є попередні реєстрації цього виду. Перевірте відповідність поточного стану; історію не змінено.</p>}</div>})}</div>
  </section>
}
