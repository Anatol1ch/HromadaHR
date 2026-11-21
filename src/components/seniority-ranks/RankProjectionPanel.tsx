import { useEffect, useRef, useState } from 'react'
import type { RankProjection } from '../../../shared/rank-projection'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate, todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { ArrowRight, CalendarClock, CalendarDays, Info, Timer } from 'lucide-react'

/** Read-only projection display. It never proposes or writes a rank decision. */
export default function RankProjectionPanel({employeeId,refreshKey}:{employeeId:string;refreshKey?:number}) {
 const [value,setValue]=useState<RankProjection|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const day=useRef(todayIsoDate())
 useEffect(()=>{
  const check=()=>{const next=todayIsoDate();if(document.visibilityState!=='hidden'&&next!==day.current){day.current=next;setRetry(v=>v+1)}}
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check)
  return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}
 },[])
 useEffect(()=>{
  let alive=true;setValue(null);setError('');day.current=todayIsoDate()
  window.hromadaHR.seniorityRanks.getRankProjection(employeeId).then(result=>{if(alive){if(result.ok)setValue(result.data);else setError(personnelMessage(result.error.code))}}).catch(()=>{if(alive)setError('Не вдалося отримати прогноз рангу.')})
  return()=>{alive=false}
 },[employeeId,refreshKey,retry])
 return <InfoSection className="service-info-panel service-tab-section rank-tab-forecast" title="Наступний ранг" icon={<CalendarClock size={17} aria-hidden="true"/>}>
  {error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:!value?<DataState kind="loading" compact message="Отримання прогнозу рангу…"/>:value.status==='not_applicable'?<DataState kind="planned" className="service-empty-state rank-projection-state" icon={<CalendarClock size={22} aria-hidden="true"/>} message={value.explanation}/>:value.status==='projected'&&value.reviewOn&&value.nextRank!==null&&value.rank?<>
   <div className="service-forecast-container">
    <div className="service-forecast-cards rank-forecast-cards">
     <div className="service-forecast-card"><CalendarDays size={18} aria-hidden="true"/><strong>Орієнтовна дата</strong><span className="service-forecast-card-value">{formatDate(value.reviewOn)}</span></div>
     <div className="service-forecast-card"><Timer size={18} aria-hidden="true"/><strong>Контрольний строк</strong><span className="service-forecast-card-value">2 роки</span></div>
     <div className="service-forecast-card rank-forecast-transition"><CalendarClock size={18} aria-hidden="true"/><strong>Прогноз рангу</strong><div className="service-forecast-values"><span className="service-forecast-value-current"><small>Поточний</small><b>{value.rank.rank}</b></span><ArrowRight size={17} aria-hidden="true"/><span className="service-forecast-value-projected"><small>Наступний</small><b>{value.nextRank}</b></span></div></div>
    </div>
   </div>
   <p className="service-forecast-note"><Info size={15} aria-hidden="true"/><span>Орієнтовна дата не гарантує присвоєння рангу без відповідного кадрового рішення.</span></p>
  </>:<DataState kind="planned" className="service-empty-state rank-projection-state" icon={<CalendarClock size={22} aria-hidden="true"/>} message={value.explanation}/>}
 </InfoSection>
}
