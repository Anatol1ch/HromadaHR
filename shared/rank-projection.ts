import { daysInMonth, isIsoCalendarDate } from '../src/lib/dates.js'
import type { EmployeeDetails, PositionCategory } from './personnel.js'
import { rankOrigins, type CurrentRank } from './seniority-ranks.js'
// Закон №2493-III, ст.15. Matrix is ordinary progression only, not an exhaustive legality check.
export const categoryRanks: Record<PositionCategory, readonly number[]> = {
 I:[1,2,3],II:[3,4,5],III:[5,6,7],IV:[7,8,9],V:[9,10,11],VI:[11,12,13],VII:[13,14,15],
}
export const rankProjectionMessages = {
 not_applicable:'Облік рангів посадових осіб ОМС не застосовується до іншого персоналу.',
 missing_rank:'Внесіть підтверджений поточний ранг.',
 missing_category:'У кадровій формі зазначте категорію поточної посади.',
 missing_appointment:'У кадровій формі внесіть дату призначення на поточну посаду.',
 invalid_data:'Перевірте календарні дати та підтверджені реквізити рангу й посади.',
 category_limit:'Досягнуто найвищого рангу поточної категорії. Подальше чергове присвоєння у звичайному порядку в її межах не передбачене. Спеціальні законодавчі підстави залишаються можливими для окремого кадрового розгляду.',
 higher_rank:'Ранг вищий за звичайний діапазон поточної категорії. Спеціальна підстава може дозволяти його присвоєння або збереження; звичайний прогноз не формується.',
 lower_rank:'Перевірте відповідність поточного рангу категорії посади та кадрове рішення. Автоматично пропонувати наступний номер не можна.',
 unknown_origin:'Уточніть походження рангу перед плануванням чергового присвоєння.',
 legacy_origin:'Збережене походження рангу потребує перегляду. Оберіть актуальний варіант у редакторі; автоматичний прогноз не формується.',
 early_assignment:'Ранг присвоєно достроково в межах категорії. Це кадрове рішення не є звичайним дворічним проходженням строку; наступний строк потребує окремої нормативної перевірки.',
 early_out_of_range:'Для дострокового присвоєння перевірте відповідність рангу звичайному діапазону категорії. Черговий прогноз не формується.',
 pension_exception:'Зафіксовано присвоєння у зв’язку з виходом на пенсію. Закон допускає черговий ранг поза межами категорії; звичайний прогноз не формується.',
 missing_anchor:'Для цього походження рангу підтвердьте придатну опорну дату контрольного строку.',
 future_anchor:'Опорна дата контрольного строку ще не настала. Перевірте її придатність для планування.',
 date_range:'Дворічна дата виходить за підтримуваний календарний діапазон 0001–9999.',
 ordinary:'Орієнтовна перевірка за умови успішної роботи та перевірки інших застосовних обставин. Результат не встановлює права на присвоєння.',
 explicit_anchor:'Строк заплановано від підтвердженої опори з урахуванням поточного призначення. Потрібна перевірка результатів роботи та інших застосовних обставин.',
} as const
export type RankProjectionReason = keyof typeof rankProjectionMessages
export interface RankProjection {
 status:'projected'|'category_limit_reached'|'retained_higher_rank'|'requires_review'|'missing_data'|'not_applicable'
 reason:RankProjectionReason; explanation:string; calculatedOn:string
 category:PositionCategory|null; positionStartedOn:string|null; rank:CurrentRank|null; usualRanks:number[]
 nextRank:number|null; anchorOn:string|null; reviewOn:string|null; accuracy:'estimate'|null
 timing:'past'|'today'|'future'|null
}
/** Planning convention: ordinary max(appointment,assigned); an explicit anchor replaces assigned,
 * still bounded below by appointment. No 889-VIII waiting period, equivalence conversion or entitlement decision.
 * Two calendar years, clamp Feb 29 to Feb 28; reject year overflow instead of saturating.
 */
export function projectRank(employee:Pick<EmployeeDetails,'employeeType'|'positionCategory'|'positionStartedOn'>,rank:CurrentRank|null,on:string):RankProjection {
 const category=employee.positionCategory
 const r:RankProjection={status:'requires_review',reason:'invalid_data',explanation:'',calculatedOn:on,category,positionStartedOn:employee.positionStartedOn,rank,usualRanks:[],nextRank:null,anchorOn:null,reviewOn:null,accuracy:null,timing:null}
 const done=(status:RankProjection['status'],reason:RankProjectionReason)=>({...r,status,reason,explanation:rankProjectionMessages[reason]})
 if(employee.employeeType==='staff')return done('not_applicable','not_applicable')
 if(employee.employeeType!=='official'||!isIsoCalendarDate(on))return done('requires_review','invalid_data')
 if(!rank)return done('missing_data','missing_rank')
 if(!isIsoCalendarDate(rank.assignedOn)||rank.assignedOn>on)return done('requires_review','invalid_data')
 if(!category)return done('missing_data','missing_category')
 if(!Object.hasOwn(categoryRanks,category)||!Number.isInteger(rank.rank)||rank.rank<1||rank.rank>15)return done('requires_review','invalid_data')
 if(!rankOrigins.some(origin=>origin===rank.origin))return done('requires_review',rank.origin==='unknown'?'unknown_origin':'legacy_origin')
 r.usualRanks=[...categoryRanks[category]]
 const best=r.usualRanks[0],worst=r.usualRanks.at(-1)!
 if(rank.origin==='pension_exception')return done('requires_review','pension_exception')
 if(rank.origin==='oms_early')return done('requires_review',rank.rank>=best&&rank.rank<=worst?'early_assignment':'early_out_of_range')
 if(rank.rank<best){
  const explanation=rank.origin==='oms_retained'?'Раніше присвоєний ранг ОМС збережено. Перевірте документальну підставу; звичайна пропозиція наступного рангу не формується.':rank.origin==='civil_service_equivalence'?'Ранг ураховано з державної служби. Звірте збережене рішення; звичайна пропозиція наступного рангу не формується.':rankProjectionMessages.higher_rank
  return {...done('retained_higher_rank','higher_rank'),explanation}
 }
 if(rank.rank>worst)return done('requires_review','lower_rank')
 if(rank.rank===best)return done('category_limit_reached','category_limit')
 if(!employee.positionStartedOn)return done('missing_data','missing_appointment')
 if(!isIsoCalendarDate(employee.positionStartedOn)||employee.positionStartedOn>on||!isIsoCalendarDate(rank.assignedOn)||rank.assignedOn>on)return done('requires_review','invalid_data')
 if(rank.origin!=='oms_assigned'&&!rank.reviewAnchorOn)return done('requires_review','missing_anchor')
 if(rank.origin!=='oms_assigned'&&(!isIsoCalendarDate(rank.reviewAnchorOn!)||rank.reviewAnchorOn!>on))return done('requires_review','future_anchor')
 const anchor=[employee.positionStartedOn,rank.origin==='oms_assigned'?rank.assignedOn:rank.reviewAnchorOn!].sort().at(-1)!
 const [y,m,d]=anchor.split('-').map(Number)
 if(y+2>9999)return done('requires_review','date_range')
 r.anchorOn=anchor
 r.reviewOn=`${String(y+2).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(Math.min(d,daysInMonth(y+2,m))).padStart(2,'0')}`
 r.nextRank=rank.rank-1;r.accuracy='estimate';r.timing=r.reviewOn<on?'past':r.reviewOn===on?'today':'future'
 return done('projected',rank.origin==='oms_assigned'?'ordinary':'explicit_anchor')
}
