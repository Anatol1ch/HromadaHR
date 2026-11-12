import { documentNumberKey, type DocumentLeaveLinkInput, type DocumentsApi, type PersonnelDocument } from '../../../shared/documents.ts'
import type { LeaveRecord } from '../../../shared/leave.ts'
import type { IpcResult } from '../../../shared/ipc.ts'
import type { DocumentLeaveLinks } from '../../../shared/documents.ts'
export function leaveLinkReason(document:PersonnelDocument,record:Pick<LeaveRecord,'employeeId'|'status'|'orderNumber'|'orderDate'>,owner:string|null) {
  if(document.employeeIds.length!==1)return 'DOCUMENT_EMPLOYEE_REQUIRED'
  if(record.employeeId!==document.employeeIds[0])return 'DOCUMENT_EMPLOYEE_MISMATCH'
  if(owner)return owner===document.id?'ALREADY_LINKED':'DOCUMENT_LEAVE_CONFLICT'
  if(record.status!=='active')return 'LEAVE_CANCELLED'
  if(!record.orderNumber||!documentNumberKey(record.orderNumber)||!record.orderDate)return 'DOCUMENT_REQUISITES_MISSING'
  if(document.issuedOn!==record.orderDate||documentNumberKey(document.number)!==documentNumberKey(record.orderNumber))return 'DOCUMENT_REQUISITES_MISMATCH'
  return null
}
/** Verification only: never repeat a write after an uncertain transport result. */
export async function verifyLeaveLink(api:DocumentsApi,input:DocumentLeaveLinkInput,unlink:boolean):Promise<IpcResult<{applied:boolean;snapshot:DocumentLeaveLinks}>> {
  try {
    const actual=await api.getLeaveDocument(input.leaveRecordId)
    if(!actual.ok)return actual
    if(actual.data&&actual.data.document.id!==input.documentId)return {ok:false,error:{code:'DOCUMENT_LEAVE_CONFLICT'}}
    const snapshot=await api.listLeaveLinks(input.documentId)
    if(!snapshot.ok)return snapshot
    return {ok:true,data:{applied:unlink?actual.data===null:actual.data?.document.id===input.documentId,snapshot:snapshot.data}}
  }catch{return {ok:false,error:{code:'UNAVAILABLE'}}}
}
