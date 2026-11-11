import type { ServiceBaselineInput } from '../../../shared/seniority-ranks.ts'
import { formatDateInput, parseDateInput, todayIsoDate } from '../../lib/dates.ts'
export interface BaselineDraft { years: string; months: string; days: string; asOfDate: string; basisNote: string }
export function baselineDraft(value: ServiceBaselineInput | null): BaselineDraft {
 return { years: value ? String(value.years) : '', months: value ? String(value.months) : '', days: value ? String(value.days) : '', asOfDate: formatDateInput(value?.asOfDate ?? ''), basisNote: value?.basisNote ?? '' }
}
export function baselineErrors(v: BaselineDraft, today = todayIsoDate()) {
 const errors: Partial<Record<keyof BaselineDraft,string>> = {}
 for(const [key,max] of [['years',Number.MAX_SAFE_INTEGER],['months',11],['days',30]] as const) {
  if(!/^\d+$/.test(v[key]) || !Number.isSafeInteger(Number(v[key])) || Number(v[key])>max) errors[key]=`Введіть ціле число від 0 до ${max}.`
 }
 const date=parseDateInput(v.asOfDate)
 if(!date) errors.asOfDate='Введіть коректну дату ДД.ММ.РРРР.'
 else if(date>today) errors.asOfDate='Дата не може бути пізнішою за сьогодні.'
 if(v.basisNote.trim().length>2000) errors.basisNote='Не більше 2000 символів.'
 return errors
}
export function baselineInput(v: BaselineDraft): ServiceBaselineInput {
 if(Object.keys(baselineErrors(v)).length) throw new Error('INVALID_DRAFT')
 return { years:Number(v.years),months:Number(v.months),days:Number(v.days),asOfDate:parseDateInput(v.asOfDate)!,basisNote:v.basisNote.trim()||null }
}
const plural=new Intl.PluralRules('uk')
function unit(n:number,one:string,few:string,many:string) {const category=plural.select(n);return `${n} ${category==='one'?one:category==='few'?few:many}`}
export function baselineLabel(v: ServiceBaselineInput) { return `${unit(v.years,'рік','роки','років')} ${unit(v.months,'місяць','місяці','місяців')} ${unit(v.days,'день','дні','днів')}` }
