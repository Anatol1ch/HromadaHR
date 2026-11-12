import type { DocumentNavigationIntent } from './navigation'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import PersonnelDocumentsRegistry from './PersonnelDocumentsRegistry'
import PersonnelDocumentDetails from './PersonnelDocumentDetails'
import PersonnelDocumentEditor from './PersonnelDocumentEditor'

export default function PersonnelDocumentsPanel({active,navigationGuard,initialIntent}:{active:boolean;navigationGuard:RefObject<NavigationGuard>;initialIntent?:DocumentNavigationIntent}) {
  const [selected,setSelected]=useState<string|null>(null),[editor,setEditor]=useState<{id?:string}|null>(null),[revision,setRevision]=useState(0)
  const opener=useRef<HTMLElement|null>(null),recordOpener=useRef<HTMLElement|null>(null),root=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(initialIntent){setSelected(initialIntent.documentId);setEditor(null);setRevision(v=>v+1)}},[initialIntent])
  useLayoutEffect(()=>{if(!active)setEditor(null)},[active])
  const remember=()=>document.activeElement instanceof HTMLElement?document.activeElement:null
  function restore(target:HTMLElement|null){requestAnimationFrame(()=>{if(target?.isConnected&&!target.closest('[hidden]'))target.focus();else Array.from(root.current?.querySelectorAll<HTMLElement>('h2[tabindex],button.primary-button')??[]).find(element=>!element.closest('[hidden],[inert]'))?.focus()})}
  function back(){setSelected(null);setRevision(v=>v+1);restore(recordOpener.current)}
  function closeEditor(){setEditor(null);setRevision(v=>v+1);restore(opener.current)}
  return <div ref={root} className="personnel-documents-panel">
    <div hidden={selected!==null} inert={selected!==null}>
      <PersonnelDocumentsRegistry active={active&&selected===null} revision={revision} onOpen={id=>navigationGuard.current(()=>{recordOpener.current=remember();setSelected(id)})}
        onCreate={()=>navigationGuard.current(()=>{opener.current=remember();setEditor({})})}/>
    </div>
    {selected&&<PersonnelDocumentDetails key={selected} id={selected} active={active} revision={revision} navigationGuard={navigationGuard} onBack={back}
      onEdit={()=>{opener.current=remember();setEditor({id:selected})}} onDeleted={back} onChanged={()=>setRevision(v=>v+1)}/>}
    {active&&editor&&<PersonnelDocumentEditor key={editor.id??'new'} id={editor.id} navigationGuard={navigationGuard} returnFocus={opener.current} onClose={closeEditor}
      onSaved={value=>{setEditor(null);setSelected(value.id);setRevision(v=>v+1);restore(opener.current)}}/>}
  </div>
}
