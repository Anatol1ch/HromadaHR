import { documentNumberKey, type DocumentSeriesInput } from './documents.js'

// A bounded literal format, never executable user code or a user-supplied regex.
export const MAX_DOCUMENT_ORDINAL = 999999999
export function validNumberPattern(pattern:string) {
  return pattern.length<=60 && pattern.trim()===pattern && !/[\p{Cc}\p{Cf}]/u.test(pattern) &&
    (pattern.match(/\{N\}/g)??[]).length===1 && (pattern.match(/\{YYYY\}/g)??[]).length<=1 &&
    !/[{}]/u.test(pattern.replace('{N}','').replace('{YYYY}',''))
}
export function formatDocumentNumber(series:Pick<DocumentSeriesInput,'pattern'|'minDigits'>,ordinal:number,year:number) {
  if(!validNumberPattern(series.pattern)||!Number.isInteger(series.minDigits)||series.minDigits<1||series.minDigits>9||!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>MAX_DOCUMENT_ORDINAL||!Number.isInteger(year)||year<1||year>9999)throw Error('INVALID_NUMBER_FORMAT')
  return series.pattern.replace('{N}',String(ordinal).padStart(series.minDigits,'0')).replace('{YYYY}',String(year).padStart(4,'0'))
}
export function parseDocumentOrdinal(series:Pick<DocumentSeriesInput,'pattern'>,number:string,year:number):number|null {
  if(!validNumberPattern(series.pattern))return null
  const pattern=documentNumberKey(series.pattern.replace('{YYYY}',String(year).padStart(4,'0')))
  const [before,after]=pattern.split('{n}')
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const match=new RegExp('^'+escape(before)+'([0-9]{1,80})'+escape(after)+'$','u').exec(documentNumberKey(number))
  if(!match)return null
  const ordinal=Number(match[1])
  return Number.isSafeInteger(ordinal)&&ordinal>0&&ordinal<=MAX_DOCUMENT_ORDINAL?ordinal:null
}
