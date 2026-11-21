import type { ReactNode } from 'react'
import type { ServiceProjection } from '../../../shared/service-calculations'
import { CalendarClock, Clock, type LucideIcon } from 'lucide-react'
import DataState from '../DataState'
import Alert from '../Alert'
import { serviceDurationLabel } from './service-accounting-model'
import { formatDate } from '../../lib/dates'

export function ServiceMetricCard({ icon: Icon, title, value, detail, warning, className = '' }: {
  icon: LucideIcon
  title: string
  value: ReactNode
  detail?: ReactNode
  warning?: ReactNode
  className?: string
}) {
  return <article className={`service-metric-card ${className}`}>
    <div className="service-metric-heading"><Icon size={18} aria-hidden="true"/><h3>{title}</h3></div>
    <div className="service-metric-value">{value}</div>
    {detail != null && <div className="service-metric-detail">{detail}</div>}
    {warning != null && <div className="service-metric-warning">{warning}</div>}
  </article>
}

export function ServiceDetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return <div className="service-detail-row">
    <Icon size={16} aria-hidden="true"/>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
}

export default function ServiceProjectionView({value,error,onRetry}:{value:ServiceProjection|null;error:string;onRetry:()=>void}) {
 const calc=value?.calculation
 const currentValue=error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  :!value?<DataState kind="loading" compact message="Отримання прогнозу…"/>
  :calc?.current?<>{serviceDurationLabel(calc.current)}{calc.mode==='periods'&&<small className="service-metric-estimate">Оцінка за періодами</small>}</>
  :value.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :calc?.status==='missing_service_data'?<span className="service-metric-neutral">Стаж не внесено</span>
  :<span className="service-metric-neutral">Потрібна перевірка даних</span>
 const nextValue=error?<span className="service-metric-neutral">Недоступна</span>
  :!value?<span className="service-metric-neutral">Завантаження…</span>
  :value.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :value.reviewOn?formatDate(value.reviewOn):<span className="service-metric-neutral">Не визначена</span>
 const threshold=value?.nextThreshold
 const nextDetail=value?.reviewOn&&threshold?<>Понад {threshold.years} років · {threshold.percentage}%</>
  :value?.status==='not_applicable'?'Нормативний прогноз не застосовується'
  :value&&calc?.status==='calculated'&&!calc.accrues?'Немає поточного періоду служби'
  :'Майбутнього порогу немає'
 return <>
  <ServiceMetricCard icon={Clock} title="Поточний стаж" value={currentValue}
   detail={calc?.current?<>Розраховано на {formatDate(calc.calculatedOn)}</>:value?.status==='not_applicable'?'Для цього типу працівника прогноз стажу не формується':undefined}
   className="service-metric-current"/>
  <ServiceMetricCard icon={CalendarClock} title="Наступна перевірка" value={nextValue} detail={nextDetail}
   warning={value?.comparison==='different'&&<Alert variant="warning">Розрахунковий і підтверджений відсотки відрізняються. Потрібна кадрова перевірка.</Alert>}
   className="service-metric-review"/>
 </>
}
