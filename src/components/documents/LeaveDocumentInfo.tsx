import { useContext, useEffect, useState } from 'react'
import type { DocumentNumberingSeries, LeaveDocumentLink } from '../../../shared/documents'
import { formatDate } from '../../lib/dates'
import Alert from '../Alert'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import { DocumentNavigationContext } from './DocumentNavigationContext'
import { kindLabel, documentSeriesLabel } from './model'
export default function LeaveDocumentInfo({link,onClose}:{link:LeaveDocumentLink|null;onClose:()=>void}) {
  const open=useContext(DocumentNavigationContext)
  const seriesId=link?.document.seriesId??null
  const [retry,setRetry]=useState(0),[series,setSeries]=useState<{key:string;value?:DocumentNumberingSeries;error?:string}>()
  const key=JSON.stringify([seriesId,retry])
  useEffect(()=>{
    if(!seriesId)return
    let current=true
    void window.hromadaHR.documents.listSeries().then(result=>{
      if(!current)return
      const value=result.ok?result.data.find(s=>s.id===seriesId):undefined
      setSeries(value?{key,value}:{key,error:'Відомості про серію документа недоступні. Повторіть читання.'})
    }).catch(()=>{if(current)setSeries({key,error:'Не вдалося завантажити серію документа.'})})
    return()=>{current=false}
  },[seriesId,key])
  const current=series?.key===key?series:undefined
  if(!link)return null
  return <InfoSection title="Кадровий документ" action={open&&<button type="button" className="secondary-button" onClick={()=>open(link.document.id,onClose)}>Відкрити документ</button>}>
    <dl className="info-grid info-grid-two"><InfoItem label="Вид" value={kindLabel(link.document)}/><InfoItem label="Номер і дата" value={'№ '+link.document.number+' від '+formatDate(link.document.issuedOn)}/><InfoItem label="Серія реєстрації" value={!seriesId?'Без серії':current?.value?documentSeriesLabel(current.value):current?.error?'Серія недоступна':'Завантаження…'}/><InfoItem label="Назва" value={link.document.title} wide/></dl>
    {seriesId&&current?.error&&<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>}
    <p className="employee-hint">Структурний зв’язок підтверджено в реєстрі кадрових документів.</p>
  </InfoSection>
}
