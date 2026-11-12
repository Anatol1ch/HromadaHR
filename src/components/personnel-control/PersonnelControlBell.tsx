import { useState } from 'react'
import { Bell } from 'lucide-react'
import Modal from '../Modal'
import Alert from '../Alert'
import DataState from '../DataState'
import type { PersonnelIssue } from '../../../shared/personnel-control'
import type { PersonnelControlModel } from './usePersonnelControl'
import { IssueSummary } from './PersonnelControlOverview'
export default function PersonnelControlBell({model,onOpen,onOverview}:{model:PersonnelControlModel;onOpen:(issue:PersonnelIssue,done:()=>void)=>void;onOverview:(done:()=>void)=>void}) {
 const [open,setOpen]=useState(false)
 const items=model.data?.issues.filter(i=>i.state==='active'&&i.category!=='data_incomplete')??[]
 return <><button type="button" className="secondary-button control-bell" aria-label={model.error?'Кадрові нагадування: дані недоступні':`Кадрові нагадування: ${model.data?model.data.activeCount:'завантаження'}`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);void model.refresh()}}>
  <Bell size={19} aria-hidden="true"/><span>{model.error?'!':model.data?.activeCount??'…'}</span>
 </button>
 {open&&<Modal title="Кадрові нагадування" size="compact" onClose={()=>setOpen(false)} footer={<button type="button" className="primary-button" onClick={()=>onOverview(()=>setOpen(false))}>Усі нагадування</button>}>
  {model.error?<Alert variant="error" action={<button type="button" onClick={()=>void model.refresh()}>Повторити</button>}>{model.error}</Alert>:!model.data?<DataState kind="loading" compact message="Оновлення нагадувань…"/>:items.length?<ul className="control-list">{items.slice(0,5).map(issue=><li key={issue.id} className="control-issue"><IssueSummary issue={issue} onOpen={i=>onOpen(i,()=>setOpen(false))}/></li>)}</ul>:<DataState kind="empty" compact message="Актуальних кадрових питань немає."/>}
 </Modal>}
 </>
}
