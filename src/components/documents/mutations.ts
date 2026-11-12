import type { DocumentsApi, PersonnelDocument, PersonnelDocumentCreateInput, PersonnelDocumentUpdateInput } from '../../../shared/documents.ts'
import type { IpcResult } from '../../../shared/ipc.ts'
export type SavePayload = {kind:'create';input:PersonnelDocumentCreateInput}|{kind:'edit';input:PersonnelDocumentUpdateInput}
export type DocumentAttempt = {pending:boolean; unresolved:SavePayload|null}
export const uncertainDocumentResult = (code:string) => code==='UNAVAILABLE'||code==='INTERNAL_ERROR'
/** One local draft only. Uncertain attempts retain the exact immutable payload. */
export async function submitDocument(api:DocumentsApi, attempt:DocumentAttempt, payload:SavePayload):Promise<IpcResult<PersonnelDocument>|null> {
  if(attempt.pending)return null
  if(attempt.unresolved?.kind==='edit')return {ok:false,error:{code:'UNAVAILABLE'}}
  attempt.pending=true
  const current=attempt.unresolved??payload
  const stable=JSON.parse(JSON.stringify(current)) as SavePayload
  try {
    const result=stable.kind==='create'?await api.createDocument(stable.input):await api.updateDocument(stable.input)
    attempt.unresolved=result.ok?null:(attempt.unresolved||uncertainDocumentResult(result.error.code)?stable:null)
    return result
  }catch{attempt.unresolved=stable;return {ok:false,error:{code:'UNAVAILABLE'}}}
  finally{attempt.pending=false}
}
export function updateOutcome(actual:PersonnelDocument, payload:PersonnelDocumentUpdateInput):'saved'|'unchanged'|'stale' {
  const {id,expectedRevision,...expected}=payload
  const {revision,createdAt,updatedAt,...value}=actual
  const comparable = (input:typeof expected) => JSON.stringify([input.kind,input.customKind,input.number,input.issuedOn,input.title,input.note,[...input.employeeIds].sort()])
  const {id:actualId,...fields}=value
  if(actualId===id&&revision===expectedRevision+1&&comparable(fields)===comparable(expected))return 'saved'
  return actualId===id&&revision===expectedRevision?'unchanged':'stale'
}
