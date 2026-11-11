import { employeeStructure, withDirectoryNames, type DirectoryOrder } from '../../employees/registry.ts'
import { allowancePercentages, type AllowanceInput, type RankInput, type Allowance, type CurrentRank, type SeniorityOverview } from '../../../shared/seniority-ranks.ts'
import { formatDate, formatDateInput, parseDateInput, todayIsoDate } from '../../lib/dates.ts'
import { fullName, normalizeText } from '../../employees/model.ts'
export type Kind = 'allowance' | 'rank'
export interface Draft { status: string; percentage: string; rank: string; assignedOn: string; effectiveOn: string; documentType: string; documentNumber: string; documentDate: string; reviewOn: string }
export function draftFor(value: Allowance | CurrentRank | null): Draft {
 return { status: value && 'status' in value ? value.status : 'confirmed', percentage: value && 'percentage' in value ? String(value.percentage ?? '') : '', rank: value && 'rank' in value ? String(value.rank) : '', assignedOn: value && 'assignedOn' in value ? formatDateInput(value.assignedOn) : '', effectiveOn: formatDateInput(value?.effectiveOn ?? ''), documentType: value?.documentType ?? '', documentNumber: value?.documentNumber ?? '', documentDate: formatDateInput(value?.documentDate ?? ''), reviewOn: formatDateInput(value?.reviewOn ?? '') }
}
export function validateDraft(kind: Kind, v: Draft, today = todayIsoDate()) {
 const errors: Partial<Record<keyof Draft,string>> = {}
 if (kind === 'allowance' && !['confirmed','not_applicable'].includes(v.status)) errors.status = 'Оберіть статус.'
 if (kind === 'allowance' && v.status === 'confirmed' && (!v.percentage || !allowancePercentages.some(n => String(n) === v.percentage))) errors.percentage = 'Оберіть відсоток надбавки.'
 if (kind === 'rank' && (!/^([1-9]|1[0-5])$/.test(v.rank))) errors.rank = 'Оберіть номер рангу від 1 до 15.'
 for (const key of ['assignedOn','effectiveOn','documentDate','reviewOn'] as const) {
  if (key === 'assignedOn' && kind !== 'rank') continue
  if (key === 'effectiveOn' && kind === 'allowance' && v.status === 'not_applicable') continue
  const required = key === 'assignedOn' || (key === 'effectiveOn' && kind === 'allowance')
  if (!v[key]) { if (required) errors[key] = 'Заповніть обов’язкову дату.'; continue }
  const iso = parseDateInput(v[key])
  if (!iso) errors[key] = 'Введіть коректну дату ДД.ММ.РРРР.'
  else if ((key === 'assignedOn' || key === 'effectiveOn') && iso > today) errors[key] = 'Дата не може бути пізнішою за сьогодні.'
 }
 for (const [key,max] of [['documentType',200],['documentNumber',100]] as const) if (v[key].trim().length>max) errors[key] = `Не більше ${max} символів.`
 return errors
}
function basis(v: Draft) { return { documentType: v.documentType.trim() || null, documentNumber: v.documentNumber.trim() || null, documentDate: parseDateInput(v.documentDate), reviewOn: parseDateInput(v.reviewOn) } }
export function allowanceInput(v: Draft): AllowanceInput {
 if (Object.keys(validateDraft('allowance',v)).length) throw new Error('INVALID_DRAFT')
 return v.status === 'not_applicable' ? { ...basis(v), status:'not_applicable',percentage:null,effectiveOn:null } : { ...basis(v),status:'confirmed',percentage:Number(v.percentage) as AllowanceInput['percentage'] & number,effectiveOn:parseDateInput(v.effectiveOn)! }
}
export function rankInput(v: Draft): RankInput {
 if (Object.keys(validateDraft('rank',v)).length) throw new Error('INVALID_DRAFT')
 return { ...basis(v),rank:Number(v.rank),assignedOn:parseDateInput(v.assignedOn)!,effectiveOn:parseDateInput(v.effectiveOn) === parseDateInput(v.assignedOn) ? null : parseDateInput(v.effectiveOn) }
}
export const allowanceLabel = (value: Allowance | null) => value === null ? 'Не внесено' : value.status === 'not_applicable' ? 'Не застосовується' : `${value.percentage}%`
export const rankLabel = (row: SeniorityOverview) => row.employee.employeeType === 'staff' ? 'Не застосовується' : row.rank ? `${row.rank.rank} ранг` : 'Не внесено'
export interface Filters { query: string; type: string; allowance: string; rank: string }
const collator = new Intl.Collator('uk',{sensitivity:'base',numeric:true})
export function filterOverview(rows: SeniorityOverview[], f: Filters) {
 const words = normalizeText(f.query).split(' ').filter(Boolean)
 return rows.filter(row => {
  const e=row.employee, text=normalizeText(`${fullName(e)} ${e.position.name} ${e.department.name}`)
  return words.every(word=>text.includes(word)) && (!f.type || e.employeeType===f.type) && (!f.allowance || (row.allowance?.status ?? 'missing')===f.allowance) && (!f.rank || e.employeeType==='official' && (f.rank==='assigned' ? !!row.rank : !row.rank))
 }).sort((a,b)=>collator.compare(fullName(a.employee),fullName(b.employee)) || a.employee.id.localeCompare(b.employee.id))
}

export function overviewStructure(rows: SeniorityOverview[], directories: DirectoryOrder) {
  return employeeStructure(withDirectoryNames(rows.map(row => row.employee), directories), directories)
}
export function nextReview(row: SeniorityOverview): string | null {
  return [row.allowance?.reviewOn, row.rank?.reviewOn].filter((date): date is string => !!date).sort()[0] ?? null
}

export function updateIndicator(row: SeniorityOverview, kind: Kind, value: Allowance | CurrentRank | null): SeniorityOverview {
  return kind === 'allowance' ? { ...row, allowance: value as Allowance | null } : { ...row, rank: value as CurrentRank | null }
}

export function directionsFor(type: 'official' | 'staff'): Kind[] {
  return type === 'official' ? ['rank', 'allowance'] : ['allowance']
}
export const documentTypes = ['Розпорядження голови', 'Рішення виконавчого комітету', 'Рішення ради'] as const
export function documentTypeOptions(selected: string) {
  const options = [{ value: '', label: 'Не зазначено' }, ...documentTypes.map(value => ({ value, label: value }))]
  if (selected && !options.some(option => option.value === selected)) options.push({ value: selected, label: `${selected} (збережене значення)` })
  return options
}
export function documentLabel(value: Pick<Allowance, 'documentType' | 'documentNumber' | 'documentDate'> | null) {
  if (!value) return ''
  return [value.documentType, value.documentNumber ? `№ ${value.documentNumber}` : '', value.documentDate ? `від ${formatDate(value.documentDate)}` : ''].filter(Boolean).join(' ')
}
export function toggleSeparateDate(v: Draft, enabled: boolean): Draft {
  return { ...v, effectiveOn: enabled ? v.effectiveOn || (parseDateInput(v.assignedOn) ? v.assignedOn : '') : '' }
}
export function canCopyDocumentDate(v: Draft, today = todayIsoDate()) {
  const date = parseDateInput(v.documentDate)
  return date !== null && date <= today
}
export function copyDocumentDate(v: Draft, today = todayIsoDate()): Draft {
  return canCopyDocumentDate(v, today) ? { ...v, effectiveOn: v.documentDate } : v
}
