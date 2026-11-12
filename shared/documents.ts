import type { IpcResult } from './ipc.js'

export const personnelDocumentKinds = ['head_order', 'employer_order', 'executive_decision', 'council_decision', 'other'] as const
export type PersonnelDocumentKind = typeof personnelDocumentKinds[number]
export const personnelDocumentKindLabels: Record<PersonnelDocumentKind, string> = {
  head_order: 'Розпорядження селищного голови', employer_order: 'Наказ керівника',
  executive_decision: 'Рішення виконавчого комітету', council_decision: 'Рішення селищної ради', other: 'Інший кадровий документ',
}
export interface PersonnelDocumentInput {
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
  id: string; revision: number; createdAt: string; updatedAt: string
}
export type PersonnelDocumentSummary = Omit<PersonnelDocument, 'note'>
export type DocumentsErrorCode = 'DOCUMENT_NUMBER_CONFLICT' | 'DOCUMENT_REQUEST_CONFLICT' | 'DOCUMENT_EMPLOYEE_NOT_FOUND' |
  'STALE_REVISION' | 'NOT_FOUND' | 'INVALID_ARGUMENTS' | 'BUSY' | 'STORAGE_UNAVAILABLE' | 'CONFLICT' | 'INTERNAL_ERROR'
export interface DocumentsApi {
  listDocuments: () => Promise<IpcResult<PersonnelDocumentSummary[]>>
  getDocument: (id: string) => Promise<IpcResult<PersonnelDocument>>
  createDocument: (input: PersonnelDocumentCreateInput) => Promise<IpcResult<PersonnelDocument>>
  updateDocument: (input: PersonnelDocumentUpdateInput) => Promise<IpcResult<PersonnelDocument>>
  deleteDocument: (id: string, expectedRevision: number) => Promise<IpcResult<null>>
}
/** Comparison only: preserve the displayed number, leading zeros and suffixes. No numbering series yet. */
export function documentNumberKey(number: string) {
  return number.normalize('NFC').replace(/\s+/gu, ' ').trim().replace(/^№\s*/u, '').toLocaleLowerCase('uk-UA')
}
