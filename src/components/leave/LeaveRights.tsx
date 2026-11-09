import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { CircleHelp, CircleCheck, CircleX } from 'lucide-react'
import type { EmployeeLeaveRight, LeaveRightInput, LeaveRecord } from '../../../shared/leave'
import { leaveOptions } from './presentation'
import LeaveTypeIcon from './LeaveTypeIcon'
import Alert from '../Alert'
import { formatDateTime } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'

const rightStates = [
  { value: '', label: 'Не перевірено', Icon: CircleHelp },
  { value: 'has_right', label: 'Право є', Icon: CircleCheck },
  { value: 'no_right', label: 'Права немає', Icon: CircleX },
] as const
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
  return <section ref={owner} className="dashboard-panel leave-rights-panel"><header className="employee-group-heading"><h2>Права на відпустки</h2></header>
    <p className="leave-muted">Поточний висновок кадровика. Статус не нараховує днів і не змінює минулі відпустки.</p>
    {error && !saved && <Alert variant="error" action={<button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Повторити</button>}>{error}</Alert>}
    <div className="leave-rights-list">{leaveOptions.map(option => {
      const right = saved?.find(item => item.leaveType === option.value)
      const value = draft[option.value] ?? ''
      const savedValue = right?.status ?? ''
      const savedState = rightStates.find(state => state.value === savedValue)
      return <div className="leave-right-row" key={option.value}>
        <div className="leave-right-description"><LeaveTypeIcon type={option.value}/><div>
          <strong id={radioId + option.value}>{option.label}</strong>
          {value !== savedValue && <small>Збережений стан — {savedState?.label}</small>}
          {right && <small>Попередня перевірка — {formatDateTime(right.checkedAt)}</small>}
        </div></div>
        <div role="radiogroup" aria-labelledby={radioId + option.value} className="leave-right-switch">
          {rightStates.map(({ value: state, label, Icon }) => <label key={state}>
            <input type="radio" name={radioId + option.value} value={state} checked={value === state} disabled={!saved || busy}
              onChange={() => setDraft(current => ({ ...current, [option.value]: state }))}/>
            <span><Icon size={16} aria-hidden="true"/>{label}</span>
          </label>)}
        </div>
        {value === 'no_right' && records.some(record => record.employeeId === employeeId && record.leaveType === option.value) &&
          <p className="leave-right-warning">Є попередні реєстрації цього виду. Перевірте відповідність поточного стану.</p>}
      </div>
    })}</div>
    {error && saved && <Alert variant="error">{error}</Alert>}
    <footer className="leave-rights-footer">
      <span className="leave-muted" role="status">{changes.length > 0 ? 'Є незбережені зміни' : ''}</span>
      <button type="button" className="primary-button" disabled={!saved||!changes.length||busy} onClick={() => void save()}>
        {busy ? 'Збереження…' : 'Зберегти перевірку'}
      </button>
    </footer>
  </section>
}
