import { useEffect, useRef, useState, type RefObject } from 'react'
import { Eye } from 'lucide-react'
import type { Allowance, CurrentRank, SeniorityOverview } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import DictionaryTable from '../DictionaryTable'
import SearchField from '../SearchField'
import Select from '../Select'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import IndicatorsCard from './IndicatorsCard'
import { allowanceLabel, filterOverview, rankLabel, type Filters, type Kind } from './model'
import { fullName, personnelMessage } from '../../employees/model'
import { formatDate } from '../../lib/dates'
export default function SeniorityRanksWorkspace({ navigationGuard }: {navigationGuard:RefObject<NavigationGuard>}) {
 const [rows,setRows]=useState<SeniorityOverview[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [filters,setFilters]=useState<Filters>({query:'',type:'',allowance:'',rank:''})
 const [selected,setSelected]=useState<SeniorityOverview|null>(null)
 const generation=useRef(0)
 useEffect(()=>{
  const current=++generation.current;setLoading(true);setError('')
  window.hromadaHR.seniorityRanks.listOverview().then(result=>{
   if(current!==generation.current)return
   if(result.ok)setRows(result.data);else setError(personnelMessage(result.error.code))
  }).catch(()=>{if(current===generation.current)setError('Не вдалося завантажити реєстр.')}).finally(()=>{if(current===generation.current)setLoading(false)})
  return()=>{generation.current++}
 },[revision])
 const visible=filterOverview(rows,filters)
 function change(key:keyof Filters,value:string){setFilters(f=>({...f,[key]:value}))}
 function saved(kind:Kind,value:Allowance|CurrentRank|null) {
  if(!selected)return
  const update=(row:SeniorityOverview):SeniorityOverview=>kind==='allowance'?{...row,allowance:value as Allowance|null}:{...row,rank:value as CurrentRank|null}
  setRows(current=>current.map(row=>row.employee.id===selected.employee.id?update(row):row))
  setSelected(current=>current?update(current):null)
 }
 return <section className="page-transition seniority-workspace" aria-labelledby="seniority-title">
  <div className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="seniority-title">Стаж і ранги</h1><p className="subtitle">Облік підтверджених надбавок за вислугу років і присвоєних рангів працівників.</p></div></div>
  {!loading&&!error&&<InfoSection title="Працівники у вибірці"><dl className="info-grid"><InfoItem label="Усього працівників" value={visible.length}/><InfoItem label="Із підтвердженою надбавкою" value={visible.filter(r=>r.allowance?.status==='confirmed').length}/><InfoItem label="Із присвоєним рангом" value={visible.filter(r=>r.rank!==null).length}/></dl></InfoSection>}
  <div className="seniority-filters">
   <SearchField label="Пошук працівника" placeholder="ПІБ, посада або підрозділ" value={filters.query} onChange={v=>change('query',v)}/>
   <label>Тип працівника<Select label="Тип працівника" value={filters.type} options={[{value:'',label:'Усі працівники'},{value:'official',label:'Посадові особи'},{value:'staff',label:'Інший персонал'}]} onChange={v=>change('type',v)}/></label>
   <label>Стан надбавки<Select label="Стан надбавки" value={filters.allowance} options={[{value:'',label:'Усі стани'},{value:'confirmed',label:'Підтверджено'},{value:'not_applicable',label:'Не застосовується'},{value:'missing',label:'Не внесено'}]} onChange={v=>change('allowance',v)}/></label>
   <label>Стан рангу<Select label="Стан рангу" value={filters.rank} options={[{value:'',label:'Усі стани'},{value:'assigned',label:'Присвоєно'},{value:'missing',label:'Не внесено'}]} onChange={v=>change('rank',v)}/></label>
  </div>
  <DictionaryTable label="Надбавки та ранги працівників" className="seniority-table" columns={[{label:'Працівник'},{label:'Надбавка за вислугу'},{label:'Ранг'},{label:'Наступна перевірка'},{label:'Дії'}]} loading={loading} error={error} onRetry={()=>setRevision(v=>v+1)} empty={loading?'Завантаження…':visible.length?undefined:rows.length?'За вибраними умовами працівників не знайдено.':'Працівників ще не внесено.'} filtered={Object.values(filters).some(Boolean)}>
   {visible.map(row=><tr key={row.employee.id}>
    <td><button className="seniority-person" onClick={()=>setSelected(row)}>{fullName(row.employee)}</button><small>{row.employee.position.name}</small><small>{row.employee.department.name}</small></td>
    <td>{allowanceLabel(row.allowance)}</td><td>{rankLabel(row)}</td>
    <td>{row.allowance?.reviewOn&&<div>Надбавка: {formatDate(row.allowance.reviewOn)}</div>}{row.rank?.reviewOn&&<div>Ранг: {formatDate(row.rank.reviewOn)}</div>}{!row.allowance?.reviewOn&&!row.rank?.reviewOn&&'Не встановлено'}</td>
    <td><button className="table-action" aria-label={`Відкрити відомості: ${fullName(row.employee)}`} onClick={()=>setSelected(row)}><Eye size={17} aria-hidden="true"/></button></td>
   </tr>)}
  </DictionaryTable>
  {selected&&<IndicatorsCard key={selected.employee.id} row={selected} navigationGuard={navigationGuard} onClose={()=>setSelected(null)} onSaved={saved}/>}
 </section>
}
