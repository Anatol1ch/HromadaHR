import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Eye, FilterX, SlidersHorizontal } from 'lucide-react'
import type { Allowance, CurrentRank, SeniorityOverview } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import GroupedEmployeeTable from '../employees/GroupedEmployeeTable'
import Alert from '../Alert'
import type { RegistryDirectories } from '../../employees/registry'
import SearchField from '../SearchField'
import Select from '../Select'
import IndicatorsCard from './IndicatorsCard'
import { allowanceLabel, filterOverview, overviewStructure, nextReview, updateIndicator, rankLabel, type Filters, type Kind } from './model'
import { fullName, personnelMessage } from '../../employees/model'
import { formatDate } from '../../lib/dates'
export default function SeniorityRanksWorkspace({ navigationGuard }: {navigationGuard:RefObject<NavigationGuard>}) {
 const [rows,setRows]=useState<SeniorityOverview[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [filters,setFilters]=useState<Filters>({query:'',type:'',allowance:'',rank:''})
 const [selected,setSelected]=useState<SeniorityOverview|null>(null)
 const generation=useRef(0), panelId=useId()
 const heading=useRef<HTMLHeadingElement>(null), opener=useRef<HTMLElement|null>(null)
 const [filtersOpen,setFiltersOpen]=useState(false)
 const [directories,setDirectories]=useState<RegistryDirectories>()
 useEffect(()=>{
  const current=++generation.current;setLoading(true);setError('')
  const api=window.hromadaHR.personnel
  Promise.all([window.hromadaHR.seniorityRanks.listOverview(),api.getDictionary('department'),api.getDictionary('position')]).then(([result,department,position])=>{
   if(current!==generation.current)return
   if(!result.ok){setError(personnelMessage(result.error.code));return}
   if(!department.ok||!position.ok){setError('Не вдалося завантажити порядок довідників.');return}
   setRows(result.data);setDirectories({department:department.data.entries,position:position.data.entries})
  }).catch(()=>{if(current===generation.current)setError('Не вдалося завантажити реєстр.')}).finally(()=>{if(current===generation.current)setLoading(false)})
  return()=>{generation.current++}
 },[revision])
 const visible=filterOverview(rows,filters)
 const groups=directories?overviewStructure(visible,directories):null
 const tableError=error||(!loading&&directories&&!groups?'Довідники й кадрові дані не збігаються. Оновіть реєстр.':'')
 const byId=new Map(visible.map(row=>[row.employee.id,row]))
 const activeFilters=Number(!!filters.type)+Number(!!filters.allowance)+Number(!!filters.rank)
 const filtered=!!filters.query.trim()||activeFilters>0
 function change(key:keyof Filters,value:string){setFilters(f=>({...f,[key]:value}))}
 function saved(kind:Kind,value:Allowance|CurrentRank|null) {
  if(!selected)return
  const update=(row:SeniorityOverview)=>updateIndicator(row,kind,value)
  setRows(current=>current.map(row=>row.employee.id===selected.employee.id?update(row):row))
  setSelected(current=>current?update(current):null)
 }
 return <section className="page-transition employee-registry seniority-workspace" aria-labelledby="seniority-title">
  <div className="page-heading employee-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="seniority-title" ref={heading} tabIndex={-1}>Стаж і ранги</h1><p className="subtitle">Облік підтверджених надбавок за вислугу років і присвоєних рангів працівників.</p></div></div>
  <section className="dashboard-panel aid-registry-panel employee-registry-tools" aria-label="Пошук і фільтри стажу та рангів">
   <div className="aid-toolbar">
    <SearchField label="Пошук працівника" placeholder="ПІБ, посада або підрозділ" value={filters.query} onChange={v=>change('query',v)}/>
    <button type="button" className={`secondary-button aid-filter-toggle${filtersOpen?' expanded':''}`} aria-expanded={filtersOpen} aria-controls={panelId} onClick={()=>setFiltersOpen(v=>!v)}><SlidersHorizontal size={18} aria-hidden="true"/>Фільтри{activeFilters>0&&<span className="aid-filter-count" aria-label={`Застосовано фільтрів: ${activeFilters}`}>{activeFilters}</span>}</button>
    <button type="button" className="secondary-button aid-filter-reset" disabled={!filtered} onClick={()=>setFilters({query:'',type:'',allowance:'',rank:''})}><FilterX size={17} aria-hidden="true"/>Очистити фільтри</button>
   </div>
   <div id={panelId} className="aid-filter-panel" hidden={!filtersOpen}><div className="aid-filter-grid">
   <div className="employee-field"><span>Тип працівника</span><Select label="Тип працівника" value={filters.type} options={[{value:'',label:'Усі працівники'},{value:'official',label:'Посадові особи'},{value:'staff',label:'Інший персонал'}]} onChange={v=>change('type',v)} advanceOnSelect={false}/></div>
   <div className="employee-field"><span>Стан надбавки</span><Select label="Стан надбавки" value={filters.allowance} options={[{value:'',label:'Усі стани'},{value:'confirmed',label:'Підтверджено'},{value:'not_applicable',label:'Не застосовується'},{value:'missing',label:'Не внесено'}]} onChange={v=>change('allowance',v)} advanceOnSelect={false}/></div>
   <div className="employee-field"><span>Стан рангу</span><Select label="Стан рангу" value={filters.rank} options={[{value:'',label:'Усі стани'},{value:'assigned',label:'Присвоєно'},{value:'missing',label:'Не внесено'}]} onChange={v=>change('rank',v)} advanceOnSelect={false}/></div>
   </div></div>
  </section>
  {tableError&&<Alert variant="error" action={<button type="button" onClick={()=>setRevision(v=>v+1)}>Повторити завантаження</button>}>{tableError}</Alert>}
  <GroupedEmployeeTable groups={tableError?[]:groups??[]} loading={loading} error={tableError} filtered={filtered} count={visible.length}
   columns={[{label:'ПІБ'},{label:'Посада',width:'24%'},{label:'Надбавка'},{label:'Ранг'},{label:'Наступна перевірка',width:'130px'},{label:'Дії',width:'60px',className:'employee-actions-heading'}]}
   renderRow={employee=>{
    const row=byId.get(employee.id)!, review=nextReview(row)
    return <tr key={employee.id}>
     <td><strong className="employee-name">{fullName(employee)}</strong></td><td>{employee.position.name}</td>
     <td>{allowanceLabel(row.allowance)}</td><td>{rankLabel(row)}</td><td className="employee-date">{review?formatDate(review):'Не встановлено'}</td>
     <td className="dictionary-actions-cell"><div className="registry-row-actions"><button type="button" className="table-action" title="Переглянути" aria-label={`Відкрити відомості: ${fullName(employee)}`} onClick={event=>{opener.current=event.currentTarget;setSelected({...row,employee})}}><Eye size={17} aria-hidden="true"/></button></div></td>
    </tr>
   }}/>
  {selected&&<IndicatorsCard key={selected.employee.id} row={selected} navigationGuard={navigationGuard} onClose={()=>{setSelected(null);requestAnimationFrame(()=>{if(!opener.current?.isConnected)heading.current?.focus()})}} onSaved={saved}/>}
 </section>
}
