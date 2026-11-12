import type { ServiceProjection } from '../../../shared/service-calculations'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import DataState from '../DataState'
import Alert from '../Alert'
import { baselineLabel } from './baseline-model'
import { allowanceLabel } from './model'
import { formatDate } from '../../lib/dates'
export default function ServiceProjectionView({value,error,onRetry,showConfirmedAllowance=true}:{value:ServiceProjection|null;error:string;onRetry:()=>void;showConfirmedAllowance?:boolean}) {
 const calc=value?.calculation
 return <InfoSection title="Розрахункові показники">
  {error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>:!value?<DataState kind="loading" compact message="Отримання прогнозу…"/>:value.status==='not_applicable'?<p className="employee-hint">Нормативний прогноз надбавки посадової особи ОМС не застосовується до іншого персоналу. Підтверджені кадрові відомості зберігаються окремо.</p>:calc?.current?<>
   <strong>{baselineLabel(calc.current)}</strong>
   <span className="employee-hint">{calc.status==='baseline_only'?'Підтверджений зріз без подальшого зарахування':`Розрахунок станом на ${formatDate(calc.calculatedOn)}`}</span>
   <dl className="info-grid">
    {showConfirmedAllowance&&<InfoItem label="Підтверджена надбавка" value={allowanceLabel(value.confirmedAllowance)}/>}
    <InfoItem label={calc.status==='baseline_only'?'Шкала за опорними даними':'Розрахункова надбавка'} value={`${value.percentage}%`}/>
    {value.nextThreshold&&<InfoItem label="Наступний поріг" value={`Понад ${value.nextThreshold.years} років — ${value.nextThreshold.percentage}%`}/>}
    {value.reviewOn&&<InfoItem label="Орієнтовна перевірка" value={formatDate(value.reviewOn)}/>}
   </dl>
   <p className="employee-hint">{calc.status==='baseline_only'?'Автоматичне зарахування не дозволено. Поточний стаж і майбутня дата переходу не визначаються.':'Прогноз залежить від безперервного зарахування часу та календарної конвенції. Контрольна дата орієнтовна й потребує кадрової перевірки.'} Підтверджені рішення не змінюються.</p>
   {calc.status==='calculated'&&value.nextThreshold&&!value.reviewOn&&<p className="employee-hint">Контрольну дату в підтримуваному діапазоні визначити неможливо.</p>}
   {value.comparison==='different'&&<Alert variant="warning">Розрахунковий показник відрізняється від підтвердженого. Перевірте право на зміну надбавки.</Alert>}
  </>:<><DataState kind="empty" compact message={value.status==='missing_baseline'?'Для прогнозу внесіть підтверджений стаж.':'Розрахунок потребує перевірки опорної дати, компонентів або допустимого діапазону.'}/>{showConfirmedAllowance&&<p className="employee-hint">Підтверджена надбавка: {allowanceLabel(value.confirmedAllowance)}</p>}</>}
 </InfoSection>
}
