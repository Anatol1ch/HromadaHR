import { useCallback, useRef, useState, type RefObject } from 'react'
import type { Allowance, CurrentRank, SeniorityOverview } from '../../../shared/seniority-ranks'
import Modal from '../Modal'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import IndicatorEditor from './IndicatorEditor'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { employeeTypeLabels, fullName } from '../../employees/model'
import type { Kind } from './model'
export default function IndicatorsCard({ row, navigationGuard, onClose, onSaved }: { row: SeniorityOverview; navigationGuard: RefObject<NavigationGuard>; onClose:()=>void; onSaved:(kind:Kind,value:Allowance|CurrentRank|null)=>void }) {
 const owner=useRef<HTMLDivElement>(null),inFlight=useRef(false)
 const [busy,setBusy]=useState(false)
 const [dirty,setDirty]=useState({allowance:false,rank:false})
 const changeDirty=useCallback((kind:Kind,value:boolean)=>setDirty(current=>current[kind]===value?current:{...current,[kind]:value}),[])
 const requestClose=useUnsavedChanges(dirty.allowance||dirty.rank,inFlight,navigationGuard,owner)
 const employee=row.employee
 return <Modal title="Кадрові показники" description={fullName(employee)} size="large" busy={busy} onClose={()=>requestClose(onClose)} className="seniority-modal" footer={<button className="secondary-button" disabled={busy} onClick={()=>requestClose(onClose)}>Закрити</button>}>
  <div ref={owner} className="seniority-card">
   <InfoSection title="Працівник"><dl className="info-grid"><InfoItem label="ПІБ" value={fullName(employee)}/><InfoItem label="Посада" value={employee.position.name}/><InfoItem label="Підрозділ" value={employee.department.name}/><InfoItem label="Тип працівника" value={employeeTypeLabels[employee.employeeType]}/></dl></InfoSection>
   <IndicatorEditor kind="allowance" employeeId={employee.id} value={row.allowance} busy={busy} inFlight={inFlight} onBusy={setBusy} onDirty={changeDirty} onSaved={onSaved}/>
   {employee.employeeType==='official'?<IndicatorEditor kind="rank" employeeId={employee.id} value={row.rank} busy={busy} inFlight={inFlight} onBusy={setBusy} onDirty={changeDirty} onSaved={onSaved}/>:<InfoSection title="Поточний ранг"><p>Облік рангів застосовується до посадових осіб місцевого самоврядування.</p></InfoSection>}
  </div>
 </Modal>
}
