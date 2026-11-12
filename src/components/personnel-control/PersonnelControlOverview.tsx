import { useRef,useState } from 'react'
import type { RefObject } from 'react'
import type { PersonnelIssue,ControlDirection } from '../../../shared/personnel-control'
import type { PersonnelControlModel } from './usePersonnelControl'
import Select from '../Select'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import { formatDate } from '../../lib/dates'
import useUnsavedChanges,{type NavigationGuard} from '../employees/useUnsavedChanges'
export const directionLabels:Record<ControlDirection,string>={allowance:'Надбавки',rank:'Ранги',service_leave:'Додаткові відпустки'}
const categories={upcoming:'Наближається перевірка',due:'Настав строк перевірки',review_needed:'Потребує звірки',data_incomplete:'Неповні дані'}
export function IssueSummary({issue,onOpen}:{issue:PersonnelIssue;onOpen:(issue:PersonnelIssue)=>void}) {
 return <><div className="control-issue-heading"><strong>{issue.title}</strong><span>{categories[issue.category]}</span></div>
  <p>{issue.employeeName} · {directionLabels[issue.direction]}</p><p className="employee-hint">{issue.explanation}</p>
  {issue.dates.length>0&&<ul className="control-dates">{issue.dates.map(d=><li key={d.source+d.date}>{d.source==='manual'?'Ручний контроль':'Орієнтовний прогноз'}: {formatDate(d.date)}</li>)}</ul>}
  {issue.state==='snoozed'&&issue.snoozedUntil&&<p className="employee-hint">Відкладено до {formatDate(issue.snoozedUntil)}</p>}
  {issue.state==='reviewed'&&<p className="employee-hint">Переглянуто. Це не підтверджує оформлення кадрового рішення.</p>}
  <button type="button" className="secondary-button" onClick={()=>onOpen(issue)}>Відкрити картку</button>
 </>
}
export default function PersonnelControlOverview({model,onOpen,navigationGuard}:{model:PersonnelControlModel;onOpen:(issue:PersonnelIssue)=>void;navigationGuard:RefObject<NavigationGuard>}) {
 const [direction,setDirection]=useState(''),[state,setState]=useState('active')
 const owner=useRef<HTMLDivElement>(null)
 useUnsavedChanges(false,model.pending,navigationGuard,owner)
 const matches=(i:PersonnelIssue)=>(!direction||i.direction===direction)&&(state==='all'||i.state===state)
 const items=model.data?.issues.filter(i=>i.category!=='data_incomplete'&&matches(i))??[]
 const incomplete=model.data?.issues.filter(i=>i.category==='data_incomplete'&&matches(i))??[]
 function render(issue:PersonnelIssue) {return <li key={issue.id} className="control-issue"><IssueSummary issue={issue} onOpen={onOpen}/>
  <div className="control-actions">
   {issue.state!=='active'?<button type="button" className="secondary-button" disabled={model.busy} onClick={()=>void model.mutate({id:issue.id,fingerprint:issue.fingerprint,state:'active'})}>Повернути до актуальних</button>:<>
    <button type="button" className="secondary-button" disabled={model.busy} onClick={()=>void model.mutate({id:issue.id,fingerprint:issue.fingerprint,state:'reviewed'})}>Позначити переглянутим</button>
    <Select label={`Відкласти питання: ${issue.title}, ${issue.employeeName}`} value="" placeholder="Відкласти…" advanceOnSelect={false} disabled={model.busy} options={[1,7,30].map(days=>({value:String(days),label:`На ${days} дн.`}))} onChange={value=>void model.mutate({id:issue.id,fingerprint:issue.fingerprint,state:'snoozed',days:Number(value) as 1|7|30})}/>
   </>}
  </div></li>}
 return <div ref={owner} className="employees-workspace page-transition">
  <header className="page-heading"><div><div className="eyebrow">РОБОЧИЙ ПРОСТІР</div><h1>Огляд</h1><p className="subtitle">Кадрові питання, що потребують уваги</p></div></header>
  {model.error&&<Alert variant="error" action={<button type="button" onClick={()=>void model.refresh()}>Повторити</button>}>{model.error}</Alert>}
  {!model.data?!model.error&&<DataState kind="loading" message="Формування кадрового огляду…"/>:<>
   <p className="employee-hint">Актуальні питання: {model.data.activeCount}. Горизонт: {model.data.settings.horizonDays} днів. Перегляд не означає прийняття кадрового рішення.</p>
   <p className="employee-hint">{(['due','review_needed','upcoming'] as const).map(category=>`${categories[category]}: ${model.data!.issues.filter(i=>i.state==='active'&&i.category===category).length}`).join(' · ')}</p>
   <div className="aid-toolbar control-filters">
    <Select label="Напрям" value={direction} onChange={setDirection} options={[{value:'',label:'Усі напрями'},...Object.entries(directionLabels).map(([value,label])=>({value,label}))]}/>
    <Select label="Стан нагадування" value={state} onChange={setState} options={[{value:'active',label:'Актуальні'},{value:'snoozed',label:'Відкладені'},{value:'reviewed',label:'Переглянуті'},{value:'all',label:'Усі стани'}]}/>
    <button className="secondary-button" type="button" disabled={model.busy} onClick={()=>void model.refresh()}>Оновити</button>
   </div>
   <InfoSection title="Кадрові питання">{items.length?<ul className="control-list">{items.map(render)}</ul>:<DataState kind="empty" compact message="У цій вибірці немає кадрових питань."/>}</InfoSection>
   <details className="employee-card-section"><summary>Неповні кадрові відомості ({incomplete.length})</summary><p className="employee-hint">Ці питання не включаються до лічильника дзвіночка.</p>{incomplete.length?<ul className="control-list">{incomplete.map(render)}</ul>:<DataState kind="empty" compact message="У цій вибірці немає питань щодо даних."/>}</details>
  </>}
 </div>
}
