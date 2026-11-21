import type { ReactNode } from 'react'
import type { ServiceProjection } from '../../../shared/service-calculations'
import { CalendarClock, CalendarDays, type LucideIcon } from 'lucide-react'
import DataState from '../DataState'
import Alert from '../Alert'
import { serviceDurationLabel } from './service-accounting-model'
import { formatDate } from '../../lib/dates'

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
   <div className="service-current-date"><CalendarDays size={15} aria-hidden="true"/>{calc?.current?`Розраховано станом на ${formatDate(calc.calculatedOn)}`:'Поточний розрахунок'}</div>
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
 return <section className="service-forecast-panel" aria-labelledby="service-forecast-heading">
   <div className="service-forecast-heading"><CalendarClock size={18} aria-hidden="true"/><h3 id="service-forecast-heading">Наступна кадрова перевірка</h3></div>
   <div className="service-forecast-body">
     <div className="service-forecast-date">{error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>Не вдалося отримати прогноз.</Alert>:<span className={date?'':'service-metric-neutral'}>{date?formatDate(date):emptyDate}</span>}</div>
     <div className="service-forecast-threshold">{detail}</div>
   </div>
   {value?.comparison==='different'&&<Alert variant="warning">Розрахункова надбавка відрізняється від підтвердженої. Потрібна кадрова перевірка.</Alert>}
  </section>
}
