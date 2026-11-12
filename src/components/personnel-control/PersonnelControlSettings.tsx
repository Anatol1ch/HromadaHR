import { useEffect,useRef,useState,type RefObject } from 'react'
import { warningHorizons,type ControlSettings } from '../../../shared/personnel-control'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import useUnsavedChanges from '../employees/useUnsavedChanges'
import Select from '../Select'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { controlError } from './usePersonnelControl'
export default function PersonnelControlSettings({navigationGuard}:{navigationGuard:RefObject<NavigationGuard>}) {
 const [value,setValue]=useState<ControlSettings|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false)
 const pending=useRef(false),alive=useRef(false),owner=useRef<HTMLDivElement>(null)
 useUnsavedChanges(false,pending,navigationGuard,owner)
 useEffect(()=>{let active=true;alive.current=true;setValue(null);setError('');window.hromadaHR.personnelControl.getSettings().then(r=>{if(active){if(r.ok)setValue(r.data);else setError(controlError(r.error.code))}}).catch(()=>{if(active)setError('Не вдалося отримати налаштування.')});return()=>{active=false;alive.current=false}},[retry])
 async function save(horizonDays:ControlSettings['horizonDays']) {
  if(pending.current)return
  pending.current=true;setBusy(true);setError('')
  try{const r=await window.hromadaHR.personnelControl.saveSettings({horizonDays});if(alive.current){if(r.ok)setValue(r.data);else setError(controlError(r.error.code))}}
  catch{if(alive.current)setError('Не вдалося зберегти налаштування.')}
  finally{pending.current=false;if(alive.current)setBusy(false)}
 }
 return <div ref={owner}><InfoSection title="Кадровий контроль">
  {error&&<Alert variant="error" action={<button type="button" disabled={busy} onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>}
  {value?<div className="recipient-field control-horizon"><span>Горизонт попередження</span><Select label="Горизонт попередження" value={String(value.horizonDays)} advanceOnSelect={false} disabled={busy} options={warningHorizons.map(n=>({value:String(n),label:`${n} днів`}))} onChange={v=>void save(Number(v) as ControlSettings['horizonDays'])}/><small>Зберігається після вибору.</small></div>:!error&&<DataState kind="loading" compact message="Завантаження налаштувань…"/>}
  <p className="employee-hint">Строки рекомендаційні. Надбавки, ранги, права та підтверджені дні відпусток автоматично не змінюються.</p>
 </InfoSection></div>
}
