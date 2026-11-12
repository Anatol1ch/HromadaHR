import { useEffect, useId, useState } from 'react'
import { Eye, FilterX, Plus, SlidersHorizontal } from 'lucide-react'
import type { DocumentNumberingSeries, PersonnelDocumentSummary } from '../../../shared/documents'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName } from '../../employees/model'
import { formatDate } from '../../lib/dates'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import SearchField from '../SearchField'
import Select from '../Select'
import { documentKindOptions, documentMessage, documentRows, emptyDocumentFilters, kindLabel, type DocumentSort } from './model'

export default function PersonnelDocumentsRegistry({active,revision,onOpen,onCreate}:{active:boolean;revision:number;onOpen:(id:string)=>void;onCreate:()=>void}) {
  const [filters,setFilters]=useState(emptyDocumentFilters),[open,setOpen]=useState(false)
  const [sort,setSort]=useState<DocumentSort>({key:'issuedOn',direction:'desc'})
  const [retry,setRetry]=useState(0)
  const [state,setState]=useState<{key:string;rows?:PersonnelDocumentSummary[];people?:EmployeeCard[];series?:DocumentNumberingSeries[];error?:string}>()
  const key=JSON.stringify([revision,retry]),panelId=useId()
  useEffect(()=>{
    if(!active)return
    let alive=true
    setState(undefined)
    void Promise.all([window.hromadaHR.documents.listDocuments(),window.hromadaHR.personnel.listEmployees(),window.hromadaHR.documents.listSeries()]).then(([documents,people,series])=>{
      if(!alive)return
      if(!documents.ok){setState({key,error:documentMessage(documents.error.code)});return}
      if(!people.ok){setState({key,error:'Не вдалося завантажити працівників. Зв’язки документів недоступні для перегляду.'});return}
      if(!series.ok){setState({key,error:documentMessage(series.error.code)});return}
      setState({key,rows:documents.data,people:people.data,series:series.data})
    }).catch(()=>{if(alive)setState({key,error:'Не вдалося завантажити реєстр документів.'})})
    return()=>{alive=false}
  },[active,key])
  const current=state?.key===key?state:undefined
  const people=current?.people??[],names=new Map(people.map(person=>[person.id,fullName(person)]))
  const rows=current?.rows,visible=documentRows(rows??[],people,filters,sort,current?.series)
  const count=Object.entries(filters).filter(([key,value])=>key!=='query'&&value).length
  const missingLinks=rows?.some(row=>row.employeeIds.some(id=>!names.has(id)))
  const filtered=!!count||!!filters.query.trim()
  const reset=()=>setFilters(emptyDocumentFilters)
  const years=[...new Set(rows?.map(row=>row.issuedOn.slice(0,4)))].sort().reverse()
  function sortable(key:DocumentSort['key'],label:string){return {label:<button type="button" className="registry-sort-button" onClick={()=>setSort({key,direction:sort.key===key&&sort.direction==='asc'?'desc':'asc'})}>{label}<span aria-hidden="true">{sort.key===key?(sort.direction==='asc'?'↑':'↓'):'↕'}</span></button>,sort:sort.key===key?(sort.direction==='asc'?'ascending' as const:'descending' as const):undefined}}
  return <section className="personnel-documents-registry">
    <section className="dashboard-panel aid-registry-panel employee-registry-tools">
      <div className="aid-toolbar">
        <SearchField label="Пошук кадрових документів" placeholder="Номер, заголовок або працівник" value={filters.query} onChange={query=>setFilters(value=>({...value,query}))}/>
        <button type="button" className="secondary-button aid-filter-toggle" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(!open)}><SlidersHorizontal size={17}/>Фільтри{count>0&&<span className="aid-filter-count">{count}</span>}</button>
        <button type="button" className="secondary-button" disabled={!filtered} onClick={reset}><FilterX size={17}/>Очистити фільтри</button>
        <button type="button" className="primary-button" onClick={onCreate}><Plus size={17}/>Додати документ</button>
      </div>
      <div id={panelId} className="aid-filter-panel" hidden={!open}><div className="aid-filter-grid">
        {([{key:'kind',label:'Вид документа',options:documentKindOptions},{key:'year',label:'Календарний рік',options:years.map(value=>({value,label:value}))},
          {key:'series',label:'Серія реєстрації',options:(current?.series??[]).map(s=>({value:s.id,label:s.name+(s.active?'':' (архівна)')}))},
          {key:'employee',label:'Пов’язаний працівник',options:people.map(person=>({value:person.id,label:fullName(person)}))}] as const).map(field=><div className="employee-field" key={field.key}><span>{field.label}</span><Select label={field.label} value={filters[field.key]} options={[{value:'',label:'Усі'},...field.options]} searchable={field.key==='employee'} advanceOnSelect={false} onChange={value=>setFilters(current=>({...current,[field.key]:value}))}/></div>)}
      </div></div>
    </section>
    {missingLinks&&<Alert variant="warning" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Оновити відомості</button>}>Відомості про окремих пов’язаних працівників недоступні. Зв’язки не видалено.</Alert>}
    {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>
      :!rows?<DataState kind="loading" message="Завантаження кадрових документів…"/>
      :<section className="dashboard-panel employee-register-panel"><header className="employee-group-heading"><h2>Реєстр кадрових документів</h2><span>Знайдено: {visible.length}</span></header>
        <DictionaryTable label="Кадрові документи" className="personnel-documents-table" filtered={filtered} columns={[sortable('issuedOn','Дата'),sortable('number','Номер'),sortable('kind','Вид документа'),sortable('title','Назва документа'),{label:'Працівник'},{label:'Дії'}]} empty={!visible.length?(rows.length?'Документів за обраними фільтрами не знайдено.':'Кадрових документів ще немає.'):undefined}>
          {visible.map(row=><tr key={row.id}><td className="employee-date">{formatDate(row.issuedOn)}</td><td>{row.number}{row.seriesId&&<small className="document-series-caption">{current?.series?.find(s=>s.id===row.seriesId)?.name??'Серія недоступна'}</small>}</td><td>{kindLabel(row)}</td><td>{row.title}</td><td>{row.employeeIds.length>1?'Кілька наявних зв’язків — перевірте картку':row.employeeIds.length?(names.get(row.employeeIds[0])??'Працівник недоступний'):'Не зазначено'}</td><td><button type="button" className="icon-button" aria-label={'Переглянути документ № '+row.number} title="Переглянути" onClick={()=>onOpen(row.id)}><Eye size={17}/></button></td></tr>)}
        </DictionaryTable>
        {!visible.length&&<div className="document-empty-actions"><button type="button" className="secondary-button" onClick={rows.length?reset:onCreate}>{rows.length?'Очистити фільтри':'Додати перший документ'}</button></div>}
      </section>}
  </section>
}
