import { personnelDocumentKindLabels, personnelDocumentKinds, documentNumberKey, type PersonnelDocument, type PersonnelDocumentInput, type PersonnelDocumentKind, type PersonnelDocumentSummary, type DocumentNumberingSeries } from '../../../shared/documents.ts'
import type { EmployeeCard } from '../../../shared/personnel.ts'
import type { IpcErrorCode } from '../../../shared/ipc.ts'
import { fullName } from '../../employees/model.ts'
import { formatDateInput, parseDateInput } from '../../lib/dates.ts'

export const documentKindOptions = personnelDocumentKinds.map(value => ({value,label:personnelDocumentKindLabels[value]}))
export const kindLabel = (value: Pick<PersonnelDocumentInput,'kind'|'customKind'>) => value.kind === 'other' ? value.customKind || personnelDocumentKindLabels.other : personnelDocumentKindLabels[value.kind]
const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase('uk-UA').replace(/\s+/gu,' ').trim()
export const emptyDocumentFilters = {query:'',kind:'',year:'',employee:'',series:''}
export type DocumentFilters = typeof emptyDocumentFilters
export type DocumentSort = {key:'issuedOn'|'number'|'kind'|'title'; direction:'asc'|'desc'}
export function documentRows(rows: PersonnelDocumentSummary[], people: EmployeeCard[], filters: DocumentFilters, sort: DocumentSort, series:DocumentNumberingSeries[] = []) {
  const names = new Map(people.map(person=>[person.id,fullName(person)]))
  const words = normalize(filters.query).split(' ').filter(Boolean)
  const collator = new Intl.Collator('uk',{numeric:true,sensitivity:'base'})
  return rows.filter(row => {
    const text = normalize([row.number,series.find(s=>s.id===row.seriesId)?.name,row.title,personnelDocumentKindLabels[row.kind],row.customKind,...row.employeeIds.map(id=>names.get(id)??'')].join(' '))
    return words.every(word=>text.includes(word)) && (!filters.series || row.seriesId===filters.series) && (!filters.kind || row.kind===filters.kind) && (!filters.year || row.issuedOn.slice(0,4)===filters.year) && (!filters.employee || row.employeeIds.includes(filters.employee))
  }).sort((a,b)=> {
    const value = (row: PersonnelDocumentSummary) => sort.key==='kind'?kindLabel(row):row[sort.key]
    return (sort.direction==='asc'?1:-1)*collator.compare(value(a),value(b)) || b.issuedOn.localeCompare(a.issuedOn) || a.id.localeCompare(b.id)
  })
}
export type DocumentDraft = Omit<PersonnelDocumentInput,'customKind'|'note'|'issuedOn'> & {customKind:string; note:string; issuedOn:string}
export function documentDraft(value?: PersonnelDocument): DocumentDraft {
  return {seriesId:value?.seriesId??null,kind:value?.kind??'head_order',customKind:value?.customKind??'',number:value?.number??'',issuedOn:formatDateInput(value?.issuedOn??''),title:value?.title??'',note:value?.note??'',employeeIds:[...value?.employeeIds??[]]}
}
export const changeDocumentKind = (draft: DocumentDraft, kind: PersonnelDocumentKind): DocumentDraft => ({...draft,kind,seriesId:null,customKind:kind==='other'?draft.customKind:''})
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
    case 'SERIES_NOT_FOUND': return 'Серію не знайдено. Оновіть перелік серій.'
    case 'SERIES_INACTIVE': return 'Серія архівна й недоступна для нового присвоєння номера.'
    case 'SERIES_KIND_MISMATCH': return 'Серія не відповідає виду документа.'
    case 'SERIES_PATTERN_MISMATCH': return 'Повний номер не відповідає шаблону серії або року документа.'
    case 'SERIES_NUMBER_TAKEN': return 'Цей номер або порядкову позицію вже присвоєно в серії та році. Видалення документа не звільняє номер.'
    case 'SERIES_CODE_CONFLICT': return 'Такий код серії вже існує для цього виду документа.'
    case 'SERIES_USED': return 'Серію вже використано. Можна змінити лише назву або стан.'
    case 'SERIES_EXHAUSTED': return 'Діапазон порядкових номерів серії вичерпано.'
    case 'DOCUMENT_LEAVE_CONFLICT': return 'Відпустку вже пов’язано з іншим документом.'
    case 'DOCUMENT_EMPLOYEE_REQUIRED': return 'Для зв’язування документ повинен мати рівно одного працівника. Перевірте його в редакторі.'
    case 'DOCUMENT_EMPLOYEE_MISMATCH': return 'Документ і відпустка належать різним працівникам.'
    case 'DOCUMENT_REQUISITES_MISSING': return 'Спочатку внесіть номер і дату розпорядження в редакторі відпустки.'
    case 'DOCUMENT_REQUISITES_MISMATCH': return 'Номер або дата розпорядження у відпустці не відповідають документу.'
    case 'DOCUMENT_HAS_LEAVE_LINKS': return 'Документ пов’язаний із зареєстрованими відпустками. Спочатку розірвіть відповідні зв’язки.'
    case 'LEAVE_CANCELLED': return 'Реєстрацію відпустки скасовано. Новий зв’язок не створюється.'
    case 'DOCUMENT_NUMBER_CONFLICT': return 'Такий номер уже зареєстровано в обраній серії та році. Для документа без серії перевіряється вид і рік. Перевірте номер, дату та серію.'
    case 'DOCUMENT_REQUEST_CONFLICT': return 'Повторний запит відрізняється від попереднього. Перевірте реєстр перед новим створенням.'
    case 'DOCUMENT_EMPLOYEE_NOT_FOUND': return 'Один із працівників недоступний. Оновіть перелік і перевірте зв’язки.'
    case 'STALE_REVISION': return 'Документ уже змінено. Чернетку збережено. Перечитайте актуальний запис перед редагуванням.'
    case 'NOT_FOUND': return 'Документ більше не існує або недоступний.'
    case 'BUSY': return 'Сховище зайняте. Повторіть спробу пізніше.'
    case 'INVALID_ARGUMENTS': return 'Перевірте заповнення реквізитів документа.'
    default: return 'Не вдалося отримати підтверджений результат. Повторіть запит.'
  }
}

/** Number namespaces are identified by series, never by the displayed number. */
export const documentSeriesLabel = (series:Pick<DocumentNumberingSeries,'name'|'code'>|undefined) => series ? series.name+' · '+series.code : 'Серія недоступна'
