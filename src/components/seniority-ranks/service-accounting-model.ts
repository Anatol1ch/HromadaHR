import type { ServiceAccounting, ServiceAccountingInput } from '../../../shared/seniority-ranks.ts'
import { formatDateInput, parseDateInput, todayIsoDate } from '../../lib/dates.ts'
export interface SnapshotDraft { years:string;months:string;days:string;asOfDate:string }
export function snapshotDraft(value:ServiceAccounting|null):SnapshotDraft {
 const snapshot=value?.mode==='snapshot'?value:null
 return {years:snapshot?String(snapshot.years):'',months:snapshot?String(snapshot.months):'',days:snapshot?String(snapshot.days):'',asOfDate:formatDateInput(snapshot?.asOfDate??'')}
}
export function snapshotErrors(v:SnapshotDraft,today=todayIsoDate()) {
 const errors:Partial<Record<keyof SnapshotDraft,string>>={}
 for(const [key,max] of [['years',Number.MAX_SAFE_INTEGER],['months',11],['days',30]] as const)if(!/^\d+$/.test(v[key])||!Number.isSafeInteger(Number(v[key]))||Number(v[key])>max)errors[key]=`Введіть ціле число від 0 до ${max}.`
 const date=parseDateInput(v.asOfDate)
 if(!date)errors.asOfDate='Введіть коректну дату ДД.ММ.РРРР.';else if(date>today)errors.asOfDate='Дата не може бути пізнішою за сьогодні.'
 return errors
}
export function snapshotInput(v:SnapshotDraft):Extract<ServiceAccountingInput,{mode:'snapshot'}> {
 if(Object.keys(snapshotErrors(v)).length)throw new Error('INVALID_DRAFT')
 return {mode:'snapshot',years:Number(v.years),months:Number(v.months),days:Number(v.days),asOfDate:parseDateInput(v.asOfDate)!}
}
const plural=new Intl.PluralRules('uk')
function unit(n:number,one:string,few:string,many:string){const category=plural.select(n);return `${n} ${category==='one'?one:category==='few'?few:many}`}
export function serviceDurationLabel(v:{years:number;months:number;days:number}){return `${unit(v.years,'рік','роки','років')} ${unit(v.months,'місяць','місяці','місяців')} ${unit(v.days,'день','дні','днів')}`}
