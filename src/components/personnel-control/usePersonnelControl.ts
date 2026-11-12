import { createControlRequests } from './requests'
import type { IpcErrorCode } from '../../../shared/ipc'
import { useCallback,useEffect,useRef,useState } from 'react'
import type { ControlOverview,ReminderStateInput } from '../../../shared/personnel-control'
import { todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
export function controlError(code:IpcErrorCode) {return code==='STALE_REMINDER'?'Кадрові відомості змінилися. Оновіть огляд і перевірте актуальне питання.':personnelMessage(code)}
/** One renderer snapshot for bell and overview, event invalidation only; late reads cannot overwrite newer ones. */
export default function usePersonnelControl(enabled:boolean) {
 const [data,setData]=useState<ControlOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [requests]=useState(createControlRequests)
 const pending=requests.pending,day=useRef(todayIsoDate())
 const refresh=useCallback(async()=>{
  if(!enabled)return
  const request=requests.beginRead()
  try {
   const result=await window.hromadaHR.personnelControl.getOverview()
   if(!requests.current(request))return
   if(result.ok){setData(result.data);setError('');day.current=result.data.calculatedOn}
   else {setData(null);setError(controlError(result.error.code))}
  }catch{if(requests.current(request)){setData(null);setError('Не вдалося завантажити кадрові нагадування.')}}
 },[enabled,requests])
 useEffect(()=>{
  requests.activate()
  if(!enabled){setData(null);return()=>{requests.stop()}}
  void refresh()
  const unsubscribe=window.hromadaHR.personnelControl.onChanged(()=>void refresh())
  const checkDay=()=>{if(document.visibilityState!=='hidden'&&day.current!==todayIsoDate())void refresh()}
  window.addEventListener('focus',checkDay);document.addEventListener('visibilitychange',checkDay)
  return()=>{requests.stop();unsubscribe();window.removeEventListener('focus',checkDay);document.removeEventListener('visibilitychange',checkDay)}
 },[enabled,refresh,requests])
 const mutate=async(input:ReminderStateInput)=>{
  if(!requests.beginMutation())return
  const lifetime=requests.lifetime()
  setBusy(true)
  try {
   const result=await window.hromadaHR.personnelControl.setReminderState(input)
   if(!requests.currentLifetime(lifetime))return
   if(!result.ok){setError(controlError(result.error.code));requests.invalidate();return}
   await refresh()
  }catch{if(requests.currentLifetime(lifetime))setError('Не вдалося змінити стан нагадування.')}
  finally{requests.endMutation();if(requests.mounted())setBusy(false)}
 }
 return {data,error,busy,pending,refresh,mutate}
}
export type PersonnelControlModel=ReturnType<typeof usePersonnelControl>
