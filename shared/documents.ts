import type { LeaveType } from './leave.js'
import type { IpcResult } from './ipc.js'

export const personnelDocumentKinds = ['head_order', 'employer_order', 'executive_decision', 'council_decision', 'other'] as const
export type PersonnelDocumentKind = typeof personnelDocumentKinds[number]
export const personnelDocumentKindLabels: Record<PersonnelDocumentKind, string> = {
  head_order: 'Розпорядження селищного голови', employer_order: 'Наказ керівника',
  executive_decision: 'Рішення виконавчого комітету', council_decision: 'Рішення селищної ради', other: 'Інший кадровий документ',
}
export interface PersonnelDocumentInput {
  seriesId?: string | null // Omitted input means no series; outputs always include null or UUID.
  kind: PersonnelDocumentKind
  customKind: string | null // Required only for other; otherwise null.
  number: string
  issuedOn: string
  title: string
  note: string | null // Empty/whitespace-only input is normalized to null.
  employeeIds: string[]
}
export interface PersonnelDocumentCreateInput extends PersonnelDocumentInput { requestId: string }
export interface PersonnelDocumentUpdateInput extends PersonnelDocumentInput { id: string; expectedRevision: number }
export interface PersonnelDocument extends PersonnelDocumentInput {
  seriesId: string | null
  id: string; revision: number; createdAt: string; updatedAt: string
}
export type PersonnelDocumentSummary = Omit<PersonnelDocument, 'note'>
export type DocumentsErrorCode = 'SERIES_NOT_FOUND' | 'SERIES_INACTIVE' | 'SERIES_KIND_MISMATCH' | 'SERIES_PATTERN_MISMATCH' | 'SERIES_NUMBER_TAKEN' | 'SERIES_CODE_CONFLICT' | 'SERIES_USED' | 'SERIES_EXHAUSTED' | 'DOCUMENT_LEAVE_CONFLICT' | 'DOCUMENT_EMPLOYEE_REQUIRED' | 'DOCUMENT_EMPLOYEE_MISMATCH' | 'DOCUMENT_REQUISITES_MISSING' | 'DOCUMENT_REQUISITES_MISMATCH' | 'DOCUMENT_HAS_LEAVE_LINKS' | 'LEAVE_CANCELLED' | 'DOCUMENT_NUMBER_CONFLICT' | 'DOCUMENT_REQUEST_CONFLICT' | 'DOCUMENT_EMPLOYEE_NOT_FOUND' |
  'STALE_REVISION' | 'NOT_FOUND' | 'INVALID_ARGUMENTS' | 'BUSY' | 'STORAGE_UNAVAILABLE' | 'CONFLICT' | 'INTERNAL_ERROR'
export interface DocumentLeaveLinkInput {
  documentId:string; leaveRecordId:string; expectedDocumentRevision:number; expectedLeaveRevision:number
}
export interface DocumentLeaveLink {
  documentId:string; leaveRecordId:string; linkedAt:string; employeeId:string; leaveRevision:number;
  leaveType:LeaveType; startDate:string; endDate:string; usedDays:number; status:'active'|'cancelled';
  orderNumber:string|null; orderDate:string|null
}
export interface DocumentLeaveLinks { document:PersonnelDocument; links:DocumentLeaveLink[] }
export interface LeaveDocumentLink { document:PersonnelDocument; leaveRecordId:string; linkedAt:string }
export interface DocumentsApi {
  listSeries:()=>Promise<IpcResult<DocumentNumberingSeries[]>>
  createSeries:(input:DocumentSeriesInput)=>Promise<IpcResult<DocumentNumberingSeries>>
  updateSeries:(input:DocumentSeriesUpdateInput)=>Promise<IpcResult<DocumentNumberingSeries>>
  setSeriesActive:(id:string,expectedRevision:number,active:boolean)=>Promise<IpcResult<DocumentNumberingSeries>>
  createAutoNumberedDocument:(input:AutoNumberedDocumentInput)=>Promise<IpcResult<PersonnelDocument>>
  listLeaveLinks:(documentId:string)=>Promise<IpcResult<DocumentLeaveLinks>>
  getLeaveDocument:(leaveRecordId:string)=>Promise<IpcResult<LeaveDocumentLink|null>>
  linkLeaveRecord:(input:DocumentLeaveLinkInput)=>Promise<IpcResult<DocumentLeaveLinks>>
  unlinkLeaveRecord:(input:DocumentLeaveLinkInput)=>Promise<IpcResult<DocumentLeaveLinks>>
  listDocuments: () => Promise<IpcResult<PersonnelDocumentSummary[]>>
  getDocument: (id: string) => Promise<IpcResult<PersonnelDocument>>
  createDocument: (input: PersonnelDocumentCreateInput) => Promise<IpcResult<PersonnelDocument>>
  updateDocument: (input: PersonnelDocumentUpdateInput) => Promise<IpcResult<PersonnelDocument>>
  deleteDocument: (id: string, expectedRevision: number) => Promise<IpcResult<null>>
}
/** Comparison only: preserve the displayed number, leading zeros and suffixes. */
export function documentNumberKey(number: string) {
  return number.normalize('NFC').replace(/\s+/gu, ' ').trim().replace(/^№\s*/u, '').toLocaleLowerCase('uk-UA')
}
export interface DocumentSeriesInput {
  kind:PersonnelDocumentKind; code:string; name:string; pattern:string; minDigits:number; startAt:number
}
export interface DocumentNumberingSeries extends DocumentSeriesInput {
  id:string; active:boolean; used:boolean; revision:number; createdAt:string; updatedAt:string
}
export interface DocumentSeriesUpdateInput extends DocumentSeriesInput {id:string;expectedRevision:number}
export type AutoNumberedDocumentInput = Omit<PersonnelDocumentCreateInput,'number'|'seriesId'> & {seriesId:string}
