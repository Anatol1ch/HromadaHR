import { personnelDocumentKindLabels, personnelDocumentKinds, documentNumberKey, type PersonnelDocument, type PersonnelDocumentInput, type PersonnelDocumentKind, type PersonnelDocumentSummary } from '../../../shared/documents.ts'
import type { EmployeeCard } from '../../../shared/personnel.ts'
import type { IpcErrorCode } from '../../../shared/ipc.ts'
import { fullName } from '../../employees/model.ts'
import { formatDateInput, parseDateInput } from '../../lib/dates.ts'

export const documentKindOptions = personnelDocumentKinds.map(value => ({value,label:personnelDocumentKindLabels[value]}))
export const kindLabel = (value: Pick<PersonnelDocumentInput,'kind'|'customKind'>) => value.kind === 'other' ? value.customKind || personnelDocumentKindLabels.other : personnelDocumentKindLabels[value.kind]
const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase('uk-UA').replace(/\s+/gu,' ').trim()
export const emptyDocumentFilters = {query:'',kind:'',year:'',employee:''}
export type DocumentFilters = typeof emptyDocumentFilters
export type DocumentSort = {key:'issuedOn'|'number'|'kind'|'title'; direction:'asc'|'desc'}
export function documentRows(rows: PersonnelDocumentSummary[], people: EmployeeCard[], filters: DocumentFilters, sort: DocumentSort) {
  const names = new Map(people.map(person=>[person.id,fullName(person)]))
  const words = normalize(filters.query).split(' ').filter(Boolean)
  const collator = new Intl.Collator('uk',{numeric:true,sensitivity:'base'})
  return rows.filter(row => {
    const text = normalize([row.number,row.title,personnelDocumentKindLabels[row.kind],row.customKind,...row.employeeIds.map(id=>names.get(id)??'')].join(' '))
    return words.every(word=>text.includes(word)) && (!filters.kind || row.kind===filters.kind) && (!filters.year || row.issuedOn.slice(0,4)===filters.year) && (!filters.employee || row.employeeIds.includes(filters.employee))
  }).sort((a,b)=> {
    const value = (row: PersonnelDocumentSummary) => sort.key==='kind'?kindLabel(row):row[sort.key]
    return (sort.direction==='asc'?1:-1)*collator.compare(value(a),value(b)) || b.issuedOn.localeCompare(a.issuedOn) || a.id.localeCompare(b.id)
  })
}
export type DocumentDraft = Omit<PersonnelDocumentInput,'customKind'|'note'|'issuedOn'> & {customKind:string; note:string; issuedOn:string}
export function documentDraft(value?: PersonnelDocument): DocumentDraft {
  return {kind:value?.kind??'head_order',customKind:value?.customKind??'',number:value?.number??'',issuedOn:formatDateInput(value?.issuedOn??''),title:value?.title??'',note:value?.note??'',employeeIds:[...value?.employeeIds??[]]}
}
export const changeDocumentKind = (draft: DocumentDraft, kind: PersonnelDocumentKind): DocumentDraft => ({...draft,kind,customKind:kind==='other'?draft.customKind:''})
/** Multiple legacy links may only be cleared by an explicitly confirmed reconciliation. */
export function selectDocumentEmployee(draft: DocumentDraft, id:string): DocumentDraft {
  if(draft.employeeIds.length>1)throw Error('MULTIPLE_EMPLOYEES_REVIEW')
  return {...draft,employeeIds:id?[id]:[]}
}
export const reconcileDocumentEmployees = (draft:DocumentDraft):DocumentDraft => ({...draft,employeeIds:[]})
export function documentDraftErrors(draft: DocumentDraft) {
  const errors: Partial<Record<keyof DocumentDraft,string>> = {}
  if (!draft.number.trim() || draft.number.trim().length>80 || !documentNumberKey(draft.number) || documentNumberKey(draft.number).length>80) errors.number='Вкажіть номер до 80 символів.'
  if (!parseDateInput(draft.issuedOn)) errors.issuedOn='Вкажіть коректну дату ДД.ММ.РРРР.'
  if (!draft.title.trim() || draft.title.trim().length>500) errors.title='Вкажіть заголовок до 500 символів.'
  if (draft.kind==='other' && (!draft.customKind.trim() || draft.customKind.trim().length>120)) errors.customKind='Уточніть вид документа (до 120 символів).'
  if(draft.employeeIds.length>1)errors.employeeIds='Наявні кілька зв’язків. Потрібне явне узгодження перед збереженням.'
  if (draft.note.trim().length>2000) errors.note='Примітка — до 2000 символів.'
  return errors
}
export function documentInput(draft: DocumentDraft): PersonnelDocumentInput {
  if (Object.keys(documentDraftErrors(draft)).length) throw Error('INVALID_DRAFT')
  return {...draft,customKind:draft.kind==='other'?draft.customKind.trim():null,number:draft.number.trim().replace(/\s+/gu,' '),issuedOn:parseDateInput(draft.issuedOn)!,title:draft.title.trim(),note:draft.note.trim()||null,employeeIds:[...draft.employeeIds]}
}
export function documentMessage(code: IpcErrorCode) {
  switch(code) {
    case 'DOCUMENT_NUMBER_CONFLICT': return 'Такий номер уже внесено для цього виду й року. Перевірте номер і дату.'
    case 'DOCUMENT_REQUEST_CONFLICT': return 'Повторний запит відрізняється від попереднього. Перевірте реєстр перед новим створенням.'
    case 'DOCUMENT_EMPLOYEE_NOT_FOUND': return 'Один із працівників недоступний. Оновіть перелік і перевірте зв’язки.'
    case 'STALE_REVISION': return 'Документ уже змінено. Чернетку збережено. Перечитайте актуальний запис перед редагуванням.'
    case 'NOT_FOUND': return 'Документ більше не існує або недоступний.'
    case 'BUSY': return 'Сховище зайняте. Повторіть спробу пізніше.'
    case 'INVALID_ARGUMENTS': return 'Перевірте заповнення реквізитів документа.'
    default: return 'Не вдалося отримати підтверджений результат. Повторіть запит.'
  }
}
