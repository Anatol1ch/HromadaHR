import { isPeriodLeave, type PeriodLeaveType } from '../../../shared/leave'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { EmployeeLeaveRight, LeaveRightInput, LeaveRecord } from '../../../shared/leave'
import { leaveOptions } from './presentation'
import Select from '../Select'
import Alert from '../Alert'
import { formatDateTime } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
export default function LeaveRights({employeeId,records,navigationGuard,onPeriods}: {employeeId:string;records:LeaveRecord[];navigationGuard:RefObject<NavigationGuard>;onPeriods:(type:PeriodLeaveType)=>void}) {
  const [saved,setSaved]=useState<EmployeeLeaveRight[]>()
  const [draft,setDraft]=useState<Record<string,string>>({})
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
  const owner=useRef<HTMLElement>(null),pending=useRef(false),alive=useRef(false)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{let active=true;void window.hromadaHR.leave.listRights(employeeId).then(result=>{if(!active)return;if(result.ok){setSaved(result.data);setDraft(Object.fromEntries(result.data.map(r=>[r.leaveType,r.status])))}else setError(personnelMessage(result.error.code))}).catch(()=>{if(active)setError('Не вдалося завантажити права.')});return()=>{active=false}},[employeeId,retry])
  const changes:LeaveRightInput[]=leaveOptions.filter(option=>(draft[option.value]??'')!==(saved?.find(r=>r.leaveType===option.value)?.status??'')).map(option=>({leaveType:option.value,status:(draft[option.value]||null) as LeaveRightInput['status']}))
  useUnsavedChanges(changes.length>0,pending,navigationGuard,owner)
  async function save(){if(pending.current||!saved)return;pending.current=true;setBusy(true);setError('');try{const result=await window.hromadaHR.leave.saveRights(employeeId,changes.length ? changes : saved.map(r=>({leaveType:r.leaveType,status:r.status})));if(!alive.current)return;if(result.ok){setSaved(result.data);setDraft(Object.fromEntries(result.data.map(r=>[r.leaveType,r.status])));notifySystemToast('success','Статуси права збережено','Дні та минулі реєстрації не змінено.')}else setError(personnelMessage(result.error.code))}catch{if(alive.current)setError('Результат не підтверджено. Повторне збереження тих самих статусів безпечне.')}finally{pending.current=false;if(alive.current)setBusy(false)}}
  return <section ref={owner} className="dashboard-panel leave-rights-panel"><header className="employee-group-heading"><h2>Права на відпустки</h2><button type="button" className="secondary-button" disabled={!saved||(!changes.length&&!saved.length)||busy} onClick={()=>void save()}>Зберегти перевірку</button></header>
    <p className="leave-muted">Поточний висновок кадровика. Статус не нараховує днів і не змінює минулі відпустки.</p>
    {error&&<Alert variant="error" action={!saved&&<button type="button" onClick={()=>{setError('');setRetry(v=>v+1)}}>Повторити</button>}>{error}</Alert>}
    <div className="leave-rights-list">{leaveOptions.map(option=>{const right=saved?.find(r=>r.leaveType===option.value);return <div key={option.value}><span>{option.label}{right&&<small>Перевірено {formatDateTime(right.checkedAt)}</small>}</span>
      <Select label={'Право: '+option.label} value={draft[option.value]??''} options={[{value:'',label:'Не перевірено'},{value:'has_right',label:'Право підтверджено'},{value:'no_right',label:'Права немає'}]} disabled={!saved||busy} onChange={value=>setDraft(current=>({...current,[option.value]:value}))} advanceOnSelect={false}/>
      {isPeriodLeave(option.value)&&<button type="button" className="secondary-button" onClick={()=>{if(isPeriodLeave(option.value))onPeriods(option.value)}}>Періоди та залишки</button>}
      {draft[option.value]==='no_right'&&records.some(r=>r.employeeId===employeeId&&r.leaveType===option.value)&&<p className="leave-right-warning">Є попередні реєстрації цього виду. Перевірте відповідність поточного стану; історію не змінено.</p>}</div>})}</div>
  </section>
}
