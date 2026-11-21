import type { ReactNode } from 'react'
import type { ServiceProjection } from '../../../shared/service-calculations'
import { ArrowRight, CalendarClock, CalendarDays, Info, Milestone, TrendingUp, type LucideIcon } from 'lucide-react'
import DataState from '../DataState'
import Alert from '../Alert'
import { serviceDurationLabel } from './service-accounting-model'
import { formatDate } from '../../lib/dates'
import InfoSection from '../InfoSection'

export function ServiceDetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return <div className="service-detail-row">
    <Icon size={16} aria-hidden="true"/>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
}

export default function ServiceProjectionView({value,error,onRetry}:{value:ServiceProjection|null;error:string;onRetry:()=>void}) {
 const calc=value?.calculation
 const result=error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  :!value?<DataState kind="loading" compact message="Отримання розрахунку…"/>
  :calc?.current?<strong>{serviceDurationLabel(calc.current)}</strong>
  :value.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :calc?.status==='missing_service_data'?<span className="service-metric-neutral">Стаж не внесено</span>
  :<span className="service-metric-neutral">Потрібна перевірка вихідних відомостей</span>
 return <div className="service-current-summary">
   <div className="service-current-value">{result}{calc?.mode==='periods'&&calc.current&&<small className="service-metric-estimate">Розрахункова оцінка за періодами</small>}</div>
   {calc?.accrues&&<p>{calc.mode==='periods'?'Стаж продовжує накопичуватися за поточним періодом.':'Подальша служба враховується автоматично.'}</p>}
   {value?.status==='not_applicable'&&!calc?.current&&<p>Розрахунок стажу для прогнозу не застосовується.</p>}
  </div>
}

export function ServiceForecastView({value,error,onRetry}:{value:ServiceProjection|null;error:string;onRetry:()=>void}) {
 const calc=value?.calculation
 const date=error?null:value?.reviewOn??null
 const threshold=value?.nextThreshold
 const emptyDate=!value?'Завантаження…':value.status==='not_applicable'?'Не застосовується':'Не визначена'
 const detail=error?'':!value?'Прогноз ще розраховується.'
  :value.reviewOn&&threshold?<>Прогнозний поріг: понад {threshold.years} років · {threshold.percentage}%</>
  :value.status==='not_applicable'?'Нормативний прогноз не застосовується'
  :calc?.status==='missing_service_data'?'Внесіть підтверджені відомості стажу'
  :calc?.status==='requires_review'?'Перевірте вихідні відомості стажу'
  :calc?.status==='calculated'&&!calc.accrues?'Без поточного періоду дата не прогнозується'
  :'Майбутнього нормативного порогу не визначено'
 const canProject=Boolean(date&&threshold&&value?.percentage!==null&&value?.percentage!==undefined&&value.status!=='not_applicable')
 return <InfoSection className="service-info-panel service-tab-section service-tab-review" title="Наступна кадрова перевірка" icon={<CalendarClock size={17}/>}>
   <div className="service-forecast-container">
     <div className="service-forecast-cards">
       <div className="service-forecast-card">
         <CalendarDays size={18} aria-hidden="true"/>
         <strong>Орієнтовна дата</strong>
         {error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>Не вдалося отримати прогноз.</Alert>:<span className={`service-forecast-card-value${date ? '' : ' service-metric-neutral'}`}>{date?formatDate(date):emptyDate}</span>}
       </div>
       <div className="service-forecast-card">
         <Milestone size={18} aria-hidden="true"/>
         <strong>Наступний поріг</strong>
         <span className={`service-forecast-card-value${canProject ? '' : ' service-metric-neutral'}`}>{canProject?`Понад ${threshold!.years} років`:detail||'Не визначено'}</span>
       </div>
       <div className="service-forecast-card service-forecast-transition">
         <TrendingUp size={18} aria-hidden="true"/>
         <strong>Розрахункова зміна надбавки</strong>
         {canProject?<div className="service-forecast-values">
            <span className="service-forecast-value-current"><small>Поточна</small><b>{value!.percentage}%</b></span>
           <ArrowRight size={17} aria-hidden="true"/>
            <span className="service-forecast-value-projected"><small>Прогнозна</small><b>{threshold!.percentage}%</b></span>
         </div>:<span className="service-forecast-card-value service-metric-neutral">Немає доступного переходу</span>}
       </div>
     </div>
   </div>
    <p className="service-forecast-note"><Info size={15} aria-hidden="true"/><span>Прогноз є орієнтовним і не змінює підтверджену надбавку автоматично.</span></p>
  </InfoSection>
}
