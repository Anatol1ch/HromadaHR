import { useEffect,useState,type RefObject } from 'react'
import type { Allowance,CurrentRank,SeniorityOverview } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import type { Kind } from './model'
import { loadIndicatorContext } from './profile-indicators'
import IndicatorEditor from './IndicatorEditor'
import Modal from '../Modal'
import Alert from '../Alert'
import DataState from '../DataState'
import { personnelMessage } from '../../employees/model'
export default function FocusedIndicatorEditor({employeeId,kind,navigationGuard,onClose,onSaved,returnFocus}:{
 employeeId:string;kind:Kind;navigationGuard:RefObject<NavigationGuard>;onClose:()=>void;returnFocus:HTMLElement|null
 onSaved:(kind:Kind,value:Allowance|CurrentRank|null)=>void
}) {
 const [state,setState]=useState<{key:string;row?:SeniorityOverview;error?:string}>(),[retry,setRetry]=useState(0)
 const key=JSON.stringify([employeeId,kind,retry]),current=state?.key===key?state:undefined
 useEffect(()=>loadIndicatorContext(window.hromadaHR,employeeId,kind,result=>setState(result.ok?{key,row:result.data}:{key,error:personnelMessage(result.error.code)})),[employeeId,kind,key])
 if(current?.row)return <IndicatorEditor key={key} kind={kind} row={current.row} navigationGuard={navigationGuard} onClose={onClose} onSaved={onSaved} returnFocus={returnFocus}/>
 return <Modal title={kind==='allowance'?'Надбавка за вислугу років':'Поточний ранг'} size="large" onClose={onClose} returnFocus={returnFocus}>
  {current?.error?<Alert variant="error" action={<button type="button" onClick={()=>setRetry(v=>v+1)}>Повторити</button>}>{current.error}</Alert>:<DataState kind="loading" message="Читання актуальних відомостей…"/>}
 </Modal>
}
