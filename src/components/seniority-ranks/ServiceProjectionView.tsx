import type { ReactNode } from 'react'
import type { ServiceProjection } from '../../../shared/service-calculations'
import { BadgePercent, CalendarClock, Clock, type LucideIcon } from 'lucide-react'
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
  return <section className={`service-metric-card ${className}`}>
    <header className="service-metric-heading"><Icon size={18} aria-hidden="true"/><h3>{title}</h3></header>
    <div className="service-metric-separator"/>
    <div className="service-metric-body">
      <div className="service-metric-value">{value}</div>
      {detail != null && <div className="service-metric-detail">{detail}</div>}
    </div>
    {warning != null && <div className="service-metric-warning">{warning}</div>}
  </section>
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
 const allowance=value?.confirmedAllowance
 const currentValue=error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>
  :!value?<DataState kind="loading" compact message="Отримання розрахунку…"/>
  :calc?.current?<>{serviceDurationLabel(calc.current)}{calc.mode==='periods'&&<small className="service-metric-estimate">Розрахункова оцінка за періодами</small>}</>
  :value.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :calc?.status==='missing_service_data'?<span className="service-metric-neutral">Стаж не внесено</span>
  :<span className="service-metric-neutral">Потрібна перевірка вихідних відомостей</span>
 const currentDetail=calc?.current?<>
   <span>Розраховано станом на {formatDate(calc.calculatedOn)}</span>
   {calc.accrues&&<small>{calc.mode==='periods'?'Стаж продовжує накопичуватися за поточним періодом.':'Подальша служба враховується автоматично.'}</small>}
  </>:value?.status==='not_applicable'?'Розрахунок стажу для прогнозу не застосовується':undefined

 const allowanceValue=error?<span className="service-metric-neutral">Недоступна</span>
  :!value?<span className="service-metric-neutral">Завантаження…</span>
  :!allowance?<span className="service-metric-neutral">Не внесено</span>
  :allowance.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :`${allowance.percentage}%`
 const allowanceDetail=allowance?.status==='confirmed'?<>
   <span>Підтверджено</span>
   {allowance.effectiveOn&&<span>Діє з {formatDate(allowance.effectiveOn)}</span>}
  </>:allowance?.status==='not_applicable'?<span>Нормативна надбавка не застосовується</span>:undefined

 const nextValue=error?<span className="service-metric-neutral">Недоступна</span>
  :!value?<span className="service-metric-neutral">Завантаження…</span>
  :value.status==='not_applicable'?<span className="service-metric-neutral">Не застосовується</span>
  :value.reviewOn?formatDate(value.reviewOn):<span className="service-metric-neutral">Не визначена</span>
 const threshold=value?.nextThreshold
 const nextDetail=error?'Не вдалося отримати прогноз.':!value?'Очікуємо результат розрахунку.'
  :value.reviewOn&&threshold?<>Прогнозний поріг: понад {threshold.years} років · {threshold.percentage}%</>
  :value.status==='not_applicable'?'Нормативний прогноз не застосовується'
  :calc?.status==='missing_service_data'?'Внесіть підтверджені відомості стажу'
  :calc?.status==='requires_review'?'Перевірте вихідні відомості стажу'
  :calc?.status==='calculated'&&!calc.accrues?'Без поточного періоду дата не прогнозується'
  :'Майбутнього нормативного порогу не визначено'
 return <>
  <ServiceMetricCard icon={Clock} title="Поточний стаж служби" value={currentValue} detail={currentDetail} className="service-metric-current"/>
  <ServiceMetricCard icon={BadgePercent} title="Підтверджена надбавка за вислугу" value={allowanceValue} detail={allowanceDetail}
   warning={value?.comparison==='different'&&<Alert variant="warning">Розрахункова надбавка відрізняється від підтвердженої. Потрібна кадрова перевірка.</Alert>}
   className="service-metric-allowance"/>
  <ServiceMetricCard icon={CalendarClock} title="Наступна кадрова перевірка" value={nextValue} detail={nextDetail} className="service-metric-review"/>
 </>
}
