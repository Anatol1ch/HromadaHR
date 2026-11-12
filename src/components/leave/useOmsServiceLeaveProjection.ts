import { useEffect, useState } from 'react'
import type { OmsServiceLeaveProjection } from '../../../shared/service-leave-calculations'
import { todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'

/** Shared read-only loading, cancellation and calendar-day refresh for views and draft assistance. */
export default function useOmsServiceLeaveProjection(employeeId:string,revision:number|string=0,enabled=true) {
 const [today,setToday]=useState(todayIsoDate),[retry,setRetry]=useState(0)
 const key=JSON.stringify([employeeId,revision,today,retry])
 const [state,setState]=useState<{key:string;value:OmsServiceLeaveProjection|null;error:string}>()
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState!=='hidden')setToday(todayIsoDate())}
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
 },[])
 useEffect(()=>{
  if(!enabled)return
  let alive=true
  window.hromadaHR.leave.getOmsServiceLeaveProjection(employeeId).then(result=>{
   if(alive)setState({key,value:result.ok?result.data:null,error:result.ok?'':personnelMessage(result.error.code)})
  }).catch(()=>{if(alive)setState({key,value:null,error:'Не вдалося отримати розрахунок відпустки за стаж.'})})
  return()=>{alive=false}
 },[employeeId,enabled,key])
 const current=enabled&&state?.key===key?state:undefined
 return {value:current?.value??null,error:current?.error??'',today,onRetry:()=>setRetry(v=>v+1)}
}
