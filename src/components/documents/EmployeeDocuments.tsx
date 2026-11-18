import { useContext, useEffect, useState } from 'react'
import { ArrowRight, FileText } from 'lucide-react'
import type { DocumentNumberingSeries, PersonnelDocumentSummary } from '../../../shared/documents'
import InfoSection from '../InfoSection'
import DictionaryTable from '../DictionaryTable'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate } from '../../lib/dates'
import { kindLabel, documentSeriesLabel } from './model'
import { DocumentNavigationContext } from './DocumentNavigationContext'
export default function EmployeeDocuments({employeeId}:{employeeId:string}) {
  const open=useContext(DocumentNavigationContext),[retry,setRetry]=useState(0)
  const [state,setState]=useState<{key:string;rows?:PersonnelDocumentSummary[];series?:DocumentNumberingSeries[];error?:string}>()
  const key=JSON.stringify([employeeId,retry])
  useEffect(()=>{
    let active=true
    void Promise.all([window.hromadaHR.documents.listDocuments(),window.hromadaHR.documents.listSeries()]).then(([documents,series])=>{
      if(!active)return
      if(!documents.ok){setState({key,error:'Не вдалося завантажити документи працівника.'});return}
      if(!series.ok){setState({key,error:'Не вдалося прочитати серії документів. Повторіть завантаження.'});return}
      setState({key,rows:documents.data.filter(row=>row.employeeIds.includes(employeeId)),series:series.data})
    })
      .catch(()=>{if(active)setState({key,error:'Документи працівника тимчасово недоступні.'})})
    return()=>{active=false}
  },[employeeId,key])
  const current=state?.key===key?state:undefined
  return <InfoSection title="Кадрові документи" icon={<FileText size={17}/>}>
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:!current?.rows?<DataState kind="loading" compact message="Завантаження документів…"/>:
      <DictionaryTable label="Документи працівника" className="employee-documents-table" empty={!current.rows.length?'Пов’язаних кадрових документів немає.':undefined} columns={[{label:'Вид',width:'32%'},{label:'Дата',width:'14%'},{label:'Номер',width:'14%'},{label:'Назва',width:'40%'}]}>
        {current.rows.map(row=><tr key={row.id}><td>{kindLabel(row)}</td><td>{formatDate(row.issuedOn)}</td><td>{row.number}{row.seriesId&&<small className="document-series-caption">{documentSeriesLabel(current.series?.find(s=>s.id===row.seriesId))}</small>}</td><td>{open?<button type="button" className="employee-document-link" onClick={()=>open(row.id)}><span className="employee-document-link-text">{row.title}</span><ArrowRight size={14} aria-hidden="true"/></button>:row.title}</td></tr>)}
      </DictionaryTable>}
  </InfoSection>
}
