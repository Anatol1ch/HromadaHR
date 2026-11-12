import { useEffect, useRef, useState } from 'react'
import type { CurrentRank } from '../../../shared/seniority-ranks'
import type { RankProjection } from '../../../shared/rank-projection'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate, todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { rankOriginLabels } from './model'

/** Read-only view shared by the rank editor and employee card. Never proposes a write. */
export default function RankProjectionPanel({employeeId,refreshKey,showCurrent=true,showConfirmedDetails=true}:{employeeId:string;refreshKey?:CurrentRank|null|number;showCurrent?:boolean;showConfirmedDetails?:boolean}) {
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
 return <InfoSection title="Контроль рангу">
  {error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{error}</Alert>:!value?<DataState kind="loading" compact message="Отримання прогнозу рангу…"/>:<>
   {value.status!=='not_applicable'&&<dl className="info-grid">
    {showCurrent&&value.rank&&<InfoItem label="Підтверджений поточний ранг" value={`${value.rank.rank} ранг`}/>}
    <InfoItem label="Категорія посади" value={value.category??'Не зазначено'}/>
    {value.usualRanks.length>0&&<InfoItem label="Звичайний діапазон" value={value.usualRanks.join(', ')}/>}
    {value.nextRank!==null&&<InfoItem label="Наступний можливий ранг" value={`${value.nextRank} ранг`}/>}
    {value.reviewOn&&<InfoItem label="Орієнтовна перевірка" value={formatDate(value.reviewOn)}/>}
    {showConfirmedDetails&&value.rank&&<InfoItem label="Походження рангу" value={rankOriginLabels[value.rank.origin]}/>}
    {showConfirmedDetails&&value.rank?.reviewAnchorOn&&<InfoItem label="Підтверджена опорна дата" value={formatDate(value.rank.reviewAnchorOn)}/>}
    {showConfirmedDetails&&value.rank?.reviewOn&&<InfoItem label="Ручна контрольна дата" value={formatDate(value.rank.reviewOn)}/>}
    {showConfirmedDetails&&value.rank?.originNote&&<InfoItem label="Пояснення підстави" value={value.rank.originNote} wide/>}
   </dl>}
   <p className="employee-hint">{value.explanation}</p>
   {(value.timing==='past'||value.timing==='today')&&<Alert variant="info">Настав орієнтовний строк перевірки можливості присвоєння чергового рангу.</Alert>}
   {value.rank?.reviewOn&&value.reviewOn&&value.rank.reviewOn!==value.reviewOn&&<p className="employee-hint">Ручна й розрахункова дати відрізняються. Ручну дату не змінено.</p>}
  </>}
 </InfoSection>
}
