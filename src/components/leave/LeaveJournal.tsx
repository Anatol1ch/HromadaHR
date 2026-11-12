import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Eye, Pencil, Ban, Plus, SlidersHorizontal, FilterX, ListRestart } from 'lucide-react'
import type { LeaveRecord } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import { formatDate } from '../../lib/dates'
import DictionaryTable from '../DictionaryTable'
import SearchField from '../SearchField'
import Select from '../Select'
import HelpTip from './HelpTip'
import LeaveRecordAction from './LeaveRecordAction'
import { leaveLabels, leaveGroupOptions, specialOptions } from './presentation'
import { leaveRecordBelongsToEmployee, recordCountLabel, journalRows, emptyLeaveFilters, contextualLeaveFilters, personName, type LeaveFilters, type LeaveJournalContext, type LeaveSortKey, type RegistrationHistory } from './registry'
import { sortedLeaveYears } from './usage'
export default function LeaveJournal({records,employeeRows=[], navigationGuard,onChanged,onRegister, history, context, onResume, employeeId}: {
  employeeId?: string; records:LeaveRecord[]; employeeRows?:EmployeeCard[]; navigationGuard:RefObject<NavigationGuard>; onChanged:()=>void; onRegister?:()=>void;
  history: RegistrationHistory; context: LeaveJournalContext | null; onResume: () => void
}) {
  const panelId=useId()
  const [normalFilters,setNormalFilters]=useState(emptyLeaveFilters)
  const [normalOpen,setNormalOpen]=useState(false)
  const [contextView,setContextView]=useState<{ source: LeaveJournalContext; filters: LeaveFilters; open: boolean; previewId?: string }>()
  const view = context && (contextView?.source === context ? contextView : { source: context, filters: contextualLeaveFilters(context), open: true })
  const filters = view ? view.filters : normalFilters
  const open = view ? view.open : normalOpen
  const resumeButton = useRef<HTMLButtonElement>(null)
  function setFilters(update: (current: LeaveFilters) => LeaveFilters) {
    if (view) setContextView({ ...view, filters: update(view.filters) })
    else setNormalFilters(update)
  }
  useEffect(() => { if (context) resumeButton.current?.focus() }, [context])
  const [sort,setSort]=useState<{key:LeaveSortKey;direction:'asc'|'desc'}>({key:'startDate',direction:'desc'})
  const [action,setAction]=useState<{id:string;kind:'view'|'edit'|'cancel'}|null>(null)
  const scopedRecords = records.filter(record => leaveRecordBelongsToEmployee(record, employeeId))
  const visible=journalRows(scopedRecords,employeeRows,filters,sort.key,sort.direction,!!context || !!employeeId)
  const people=new Map(employeeRows.map(person=>[person.id,person]))
  const count=Object.entries(filters).filter(([key,value])=>key!=='query'&&(!employeeId || !['employee','department','position'].includes(key))&&value).length
  const fields: {key:keyof typeof filters;label:string;options:{value:string;label:string}[]}[]=[
    {key:'department',label:'Підрозділ',options:[...new Map(employeeRows.map(p=>[p.department.id,{value:p.department.id,label:p.department.name}])).values()]},
    {key:'position',label:'Посада',options:[...new Map(employeeRows.map(p=>[p.position.id,{value:p.position.id,label:p.position.name}])).values()]},
    {key:'employee',label:'Працівник',options:employeeRows.map(p=>({value:p.id,label:personName(p)}))},
    {key:'type',label:'Вид відпустки',options:context || employeeId ? [...leaveGroupOptions, ...specialOptions] : leaveGroupOptions},
    {key:'year',label:context || employeeId ? 'Рік початку' : 'Календарний рік',options:sortedLeaveYears(context || employeeId
      ? [context?.year ?? '', ...scopedRecords.map(r => r.startDate.slice(0,4))].filter(Boolean)
      : scopedRecords.flatMap(r=>Array.from({length:Number(r.endDate.slice(0,4))-Number(r.startDate.slice(0,4))+1},(_,i)=>String(Number(r.startDate.slice(0,4))+i)))).map(value=>({value,label:value}))},
    {key:'status',label:'Статус',options:[{value:'active',label:'Зареєстровано'},{value:'cancelled',label:'Скасовано'}]},
  ]
  const allColumns:{key:LeaveSortKey;label:string}[]=[{key:'name',label:'Працівник'},{key:'department',label:'Підрозділ'},{key:'position',label:'Посада'},{key:'type',label:'Вид відпустки'},{key:'startDate',label:'Початок'},{key:'endDate',label:'Завершення'},{key:'days',label:'Днів'}]
  const columns = employeeId ? allColumns.filter(column => !['name','department','position'].includes(column.key)) : allColumns
  const visibleFields = employeeId ? fields.filter(field => !['employee','department','position'].includes(field.key)) : fields
  function sortable(key:LeaveSortKey,label:string){return {sort:sort.key===key?(sort.direction==='asc'?'ascending' as const:'descending' as const):undefined,label:<button type="button" className="registry-sort-button" onClick={()=>setSort({key,direction:sort.key===key&&sort.direction==='asc'?'desc':'asc'})}><span>{label}</span><span aria-hidden="true">{sort.key===key?(sort.direction==='asc'?'↑':'↓'):'↕'}</span></button>}}
  return <section className="leave-registry">
    <section className="dashboard-panel aid-registry-panel employee-registry-tools"><div className="aid-toolbar">
      <SearchField label={employeeId ? "Пошук за розпорядженням" : "Пошук за ПІБ або розпорядженням"} placeholder={employeeId ? "Номер розпорядження" : "ПІБ або номер розпорядження"} value={filters.query} onChange={query=>setFilters(current=>({...current,query}))}/>
      <button type="button" className="secondary-button aid-filter-toggle" aria-expanded={open} aria-controls={panelId} onClick={()=>view ? setContextView({ ...view, open: !open }) : setNormalOpen(!open)}><SlidersHorizontal size={18}/>Фільтри{count>0&&<span className="aid-filter-count">{count}</span>}</button>
      <button type="button" className="secondary-button aid-filter-reset" disabled={!count&&!filters.query} onClick={()=>setFilters(() => emptyLeaveFilters)}><FilterX size={17}/>Очистити фільтри</button>
      <button type="button" className="secondary-button aid-sort-reset" disabled={sort.key==='startDate'&&sort.direction==='desc'} onClick={()=>setSort({key:'startDate',direction:'desc'})}><ListRestart size={17}/>Скинути сортування</button>
      {context ? <button ref={resumeButton} type="button" className="primary-button" onClick={onResume}>Повернутися до оформлення</button>
        : onRegister&&<button type="button" className="primary-button" onClick={onRegister}><Plus size={18}/>Зареєструвати відпустку</button>}
    </div><div id={panelId} className="aid-filter-panel" hidden={!open}><div className="aid-filter-grid">{visibleFields.map(field=><div key={field.key} className="employee-field"><span>{field.label}</span><Select label={field.label} searchable={field.key==='employee'} value={filters[field.key]} options={[{value:'',label:'Усі'},...field.options]} advanceOnSelect={false} onChange={value=>setFilters(current=>({...current,[field.key]:value}))}/></div>)}</div></div></section>
    {!history.error && !history.loading && <section className="dashboard-panel employee-register-panel" aria-busy={history.loading || undefined}><header className="employee-group-heading"><h2>{employeeId ? "Історія відпусток" : "Журнал відпусток"}</h2><span>{recordCountLabel(visible.length,scopedRecords.length,!!count||!!filters.query.trim())}</span></header>

    <DictionaryTable label={employeeId ? "Історія відпусток" : "Журнал відпусток"} className="hr-employee-table leave-register-table" filtered={!!count||!!filters.query} columns={[...columns.map(c=>({...sortable(c.key,c.label),className:c.key==='startDate'||c.key==='endDate'?'leave-journal-date':undefined})),{label:'Розпорядження'},{...sortable('status','Статус'),className:'leave-journal-status'},{label:'Дії',className:'employee-actions-heading'}]} empty={visible.length?undefined:'Зареєстрованих відпусток не знайдено.'}>
      {visible.map(record=>{const person=people.get(record.employeeId);return <tr key={record.id} className={record.status==='cancelled'?'leave-cancelled-row':''}>
        {!employeeId && <><td><strong className="employee-name">{person?personName(person):'Не зазначено'}</strong></td><td>{person?.department.name??'Не зазначено'}</td><td>{person?.position.name??'Не зазначено'}</td></>}<td>{leaveLabels[record.leaveType]}{record.allocationWarning&&<small role="status">Розподіл потребує перевірки</small>}</td><td className="leave-journal-date">{formatDate(record.startDate)}</td><td className="leave-journal-date">{formatDate(record.endDate)}</td><td>{record.usedDays}</td><td>{record.orderNumber??'Не зазначено'}{record.orderDate&&<small>{formatDate(record.orderDate)}</small>}</td><td className="leave-journal-status">{record.status==='active'?'Зареєстровано':'Скасовано'}</td>
        <td><div className="registry-row-actions"><HelpTip label="Переглянути відпустку" text="Переглянути" icon={<Eye size={17}/>} onClick={()=>view ? setContextView({ ...view, previewId: record.id }) : setAction({id:record.id,kind:'view'})}/>{!context&&record.status==='active'&&<><HelpTip label="Редагувати відпустку" text="Редагувати" icon={<Pencil size={16}/>} onClick={()=>setAction({id:record.id,kind:'edit'})}/><HelpTip label="Скасувати реєстрацію" text="Скасувати реєстрацію" icon={<Ban size={16}/>} onClick={()=>setAction({id:record.id,kind:'cancel'})}/></>}</div></td>
      </tr>})}
    </DictionaryTable></section>}
    {action&&<LeaveRecordAction key={action.id+action.kind} {...action} expectedEmployeeId={employeeId} navigationGuard={navigationGuard} onClose={()=>setAction(null)} onChanged={onChanged} history={history}/>}
    {view?.previewId && <LeaveRecordAction key={view.previewId + '-context'} id={view.previewId} kind="view" expectedEmployeeId={employeeId} navigationGuard={navigationGuard}
      onClose={() => setContextView({ ...view, previewId: undefined })} onChanged={onChanged} history={history}/>}
  </section>
}
