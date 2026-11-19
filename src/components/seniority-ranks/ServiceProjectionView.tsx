import type { ServiceProjection } from '../../../shared/service-calculations'
import { Calculator } from 'lucide-react'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import DataState from '../DataState'
import Alert from '../Alert'
import { serviceDurationLabel } from './service-accounting-model'
import { allowanceLabel } from './model'
import { formatDate } from '../../lib/dates'
export default function ServiceProjectionView({value,error,onRetry,showConfirmedAllowance=true}:{value:ServiceProjection|null;error:string;onRetry:()=>void;showConfirmedAllowance?:boolean}) {
 const calc=value?.calculation
 return <InfoSection title="Розрахункові показники">
  {error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>:!value?<DataState kind="loading" compact message="Отримання прогнозу…"/>:value.status==='not_applicable'?<p className="employee-hint">Нормативний прогноз надбавки посадової особи ОМС не застосовується до іншого персоналу. Підтверджені кадрові відомості зберігаються окремо.</p>:calc?.current?<>
   <strong>{serviceDurationLabel(calc.current)}</strong>
   <span className="employee-hint">{`Розрахунок станом на ${formatDate(calc.calculatedOn)}${calc.mode?` · спосіб: ${calc.mode}`:''}`}</span>
   <dl className="info-grid">
    {showConfirmedAllowance&&<InfoItem label="Підтверджена надбавка" value={allowanceLabel(value.confirmedAllowance)}/>}
    <InfoItem label={!calc.accrues?'Шкала за підтвердженими даними':'Розрахункова надбавка'} value={`${value.percentage}%`}/>
    {calc.mode==='periods'&&calc.creditedDays!==null&&<InfoItem label="Зараховано календарних днів" value={String(calc.creditedDays)}/>}
    {value.nextThreshold&&<InfoItem label="Наступний поріг" value={`Понад ${value.nextThreshold.years} років — ${value.nextThreshold.percentage}%`}/>}
    {value.reviewOn&&<InfoItem label="Орієнтовна перевірка" value={formatDate(value.reviewOn)}/>}
   </dl>
   <p className="employee-hint">{calc.accrues?'Розрахунок і контрольні дати є орієнтовними та потребують кадрової перевірки.':'Відомості містять лише завершені періоди: стаж не продовжується й майбутня дата порогу не визначається.'} Підтверджені рішення не змінюються.</p>
   {calc.status==='calculated'&&value.nextThreshold&&!value.reviewOn&&<p className="employee-hint">Контрольну дату в підтримуваному діапазоні визначити неможливо.</p>}
   {value.comparison==='different'&&<Alert variant="warning">Розрахунковий показник відрізняється від підтвердженого. Перевірте право на зміну надбавки.</Alert>}
  </>:<>{value.status==='missing_service_data'?<DataState kind="empty" className="service-empty-state" icon={<Calculator size={22} aria-hidden="true"/>} message="Для перегляду розрахункових показників внесіть підтверджені відомості стажу."/>:<DataState kind="empty" compact message="Розрахунок потребує перевірки вихідних відомостей або допустимого діапазону."/>}{showConfirmedAllowance&&<p className="employee-hint">Підтверджена надбавка: {allowanceLabel(value.confirmedAllowance)}</p>}</>}
 </InfoSection>
}
