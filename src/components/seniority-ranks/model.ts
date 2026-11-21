import { rankOrigins, type RankOrigin, allowancePercentages, type AllowanceInput, type RankInput, type Allowance, type CurrentRank } from '../../../shared/seniority-ranks.ts'
import { formatDate, formatDateInput, isIsoCalendarDate, parseDateInput, todayIsoDate } from '../../lib/dates.ts'
export type Kind = 'allowance' | 'rank'
export interface Draft { status: string; percentage: string; rank: string; assignedOn: string; effectiveOn: string; origin: string; reviewAnchorOn: string; documentType: string; documentNumber: string; documentDate: string }
export function draftFor(value: Allowance | CurrentRank | null): Draft {
 return { origin:value&&'origin' in value?value.origin:'', reviewAnchorOn:value&&'reviewAnchorOn' in value?formatDateInput(value.reviewAnchorOn??''):'', status: value && 'status' in value ? value.status : 'confirmed', percentage: value && 'percentage' in value ? String(value.percentage ?? '') : '', rank: value && 'rank' in value ? String(value.rank) : '', assignedOn: value && 'assignedOn' in value ? formatDateInput(value.assignedOn) : '', effectiveOn: value&&'status' in value?formatDateInput(value.effectiveOn??''):'', documentType: value?.documentType ?? '', documentNumber: value?.documentNumber ?? '', documentDate: formatDateInput(value?.documentDate ?? '') }
}
export function validateDraft(kind: Kind, v: Draft, today = todayIsoDate()) {
 const errors: Partial<Record<keyof Draft,string>> = {}
 if (kind === 'allowance' && !['confirmed','not_applicable'].includes(v.status)) errors.status = 'Оберіть статус.'
 if (kind === 'allowance' && v.status === 'confirmed' && (!v.percentage || !allowancePercentages.some(n => String(n) === v.percentage))) errors.percentage = 'Оберіть відсоток надбавки.'
 if (kind === 'rank' && (!/^([1-9]|1[0-5])$/.test(v.rank))) errors.rank = 'Оберіть номер рангу від 1 до 15.'
 if(kind==='rank'){
  if(!rankOrigins.some(origin=>origin===v.origin))errors.origin='Оберіть один із чинних варіантів походження рангу.'
  if(v.reviewAnchorOn&&!parseDateInput(v.reviewAnchorOn))errors.reviewAnchorOn='Введіть коректну дату ДД.ММ.РРРР.'
  else if(v.reviewAnchorOn&&parseDateInput(v.reviewAnchorOn)!>today)errors.reviewAnchorOn='Опорна дата не може бути пізнішою за сьогодні.'
 }
 const dateKeys: (keyof Draft)[] = kind==='rank'?['assignedOn','documentDate']:['effectiveOn','documentDate']
 for (const key of dateKeys) {
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
export function canSaveAllowanceDraft(v: Draft, dirty: boolean, busy: boolean) {
 return !busy && dirty && Object.keys(validateDraft('allowance',v)).length===0
}
export function allowanceHireDateDraft(hireDate: string, today = todayIsoDate()) {
 if (!isIsoCalendarDate(hireDate)) return null
 const date = formatDateInput(hireDate)
 return validateDraft('allowance', { ...draftFor(null), effectiveOn: date }, today).effectiveOn ? null : date
}
function basis(v: Draft) { return { documentType: v.documentType.trim() || null, documentNumber: v.documentNumber.trim() || null, documentDate: parseDateInput(v.documentDate) } }
export function allowanceInput(v: Draft): AllowanceInput {
 if (Object.keys(validateDraft('allowance',v)).length) throw new Error('INVALID_DRAFT')
 return v.status === 'not_applicable' ? { ...basis(v), status:'not_applicable',percentage:null,effectiveOn:null } : { ...basis(v),status:'confirmed',percentage:Number(v.percentage) as AllowanceInput['percentage'] & number,effectiveOn:parseDateInput(v.effectiveOn)! }
}
export function canSaveRankDraft(v: Draft, dirty: boolean, busy: boolean) {
 return !busy && dirty && Object.keys(validateDraft('rank',v)).length===0
}
export function rankInput(v: Draft): RankInput {
 if (Object.keys(validateDraft('rank',v)).length) throw new Error('INVALID_DRAFT')
 return { ...basis(v),origin:v.origin as RankOrigin,reviewAnchorOn:v.origin==='oms_assigned'?null:parseDateInput(v.reviewAnchorOn),rank:Number(v.rank),assignedOn:parseDateInput(v.assignedOn)! }
}
export const allowanceLabel = (value: Allowance | null) => value === null ? 'Не внесено' : value.status === 'not_applicable' ? 'Не застосовується' : `${value.percentage}%`
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
export const rankOriginLabels:Record<RankOrigin,string>={
 oms_assigned:'Звичайне (перше) присвоєння',oms_retained:'Раніше присвоєний ранг ОМС',civil_service_equivalence:'Ранг з урахуванням державної служби',
}
export const legacyRankOriginLabels:Record<string,string>={unknown:'Походження не зазначено',oms_early:'Дострокове присвоєння',pension_exception:'Вихід на пенсію',other:'Інша підстава'}
export function rankOriginLabel(origin:string) { return rankOriginLabels[origin as RankOrigin]??legacyRankOriginLabels[origin]??origin }
