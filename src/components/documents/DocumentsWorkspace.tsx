import { useId, useState, type RefObject } from 'react'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import { navigateTabs } from '../../lib/tabNavigation'
import LeaveDocumentsJournal from './LeaveDocumentsJournal'
import PersonnelDocumentsPanel from './PersonnelDocumentsPanel'

export default function DocumentsWorkspace({navigationGuard}:{navigationGuard:RefObject<NavigationGuard>}) {
  const [view,setView]=useState<'documents'|'leave'>('documents')
  const [leaveVisited,setLeaveVisited]=useState(false)
  const id=useId()
  return <div className="page-transition documents-workspace">
    <header className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 tabIndex={-1}>Документи</h1></div></header>
    <nav className="settings-section-nav" role="tablist" aria-label="Представлення документів" onKeyDown={navigateTabs}>
      {([{value:'documents',label:'Кадрові документи'},{value:'leave',label:'Журнал відпусток'}] as const).map(tab=><button type="button" key={tab.value} role="tab" id={id+tab.value}
        aria-selected={view===tab.value} tabIndex={view===tab.value?0:-1} aria-controls={id+tab.value+'-panel'} className={'settings-section-current'+(view===tab.value?' is-selected':'')}
        onClick={()=>{if(view!==tab.value)navigationGuard.current(()=>{if(tab.value==='leave')setLeaveVisited(true);setView(tab.value)})}}>{tab.label}</button>)}
    </nav>
    <div role="tabpanel" id={id+'documents-panel'} aria-labelledby={id+'documents'} hidden={view!=='documents'} inert={view!=='documents'}>
      <PersonnelDocumentsPanel active={view==='documents'} navigationGuard={navigationGuard}/>
    </div>
    <div role="tabpanel" id={id+'leave-panel'} aria-labelledby={id+'leave'} hidden={view!=='leave'} inert={view!=='leave'}>
      {leaveVisited&&<LeaveDocumentsJournal active={view==='leave'} navigationGuard={navigationGuard}/>}
    </div>
  </div>
}
