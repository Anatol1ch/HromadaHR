import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import Alert from '../Alert'
import DataState from '../DataState'
import useOmsServiceLeaveProjection from './useOmsServiceLeaveProjection'
import { baselineLabel } from '../seniority-ranks/baseline-model'
import { formatDate } from '../../lib/dates'
import { rightLabels } from './presentation'

/** Shared read-only component; never opens editors or saves eligibility/days. */
export default function OmsServiceLeaveProjection({employeeId,revision=0}:{employeeId:string;revision?:number|string}) {
 const {value,error,onRetry}=useOmsServiceLeaveProjection(employeeId,revision)
 return <InfoSection title="Розрахунок додаткової відпустки за стаж ОМС">
  {error?<Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити</button>}>{error}</Alert>:!value?<DataState kind="loading" compact message="Розрахунок тривалості відпустки…"/>:<>
   {value.status==='not_applicable'?<p className="leave-muted">Спеціальна шкала відпустки посадових осіб ОМС не застосовується до іншого персоналу.</p>:<>
    {value.calculation.current&&<p><strong>{baselineLabel(value.calculation.current)}</strong><span className="leave-period-note">{value.status==='baseline_only'?'Підтверджений зріз на опорну дату; подальше зарахування не дозволено':`Розрахунок станом на ${formatDate(value.calculation.calculatedOn)}`}</span></p>}
    <dl className="info-grid">
     {value.recommendedDays!==null&&<InfoItem label={value.status==='baseline_only'?'Шкала за опорними даними':'Рекомендована тривалість'} value={`${value.recommendedDays} к. дн.`}/>}
     <InfoItem label="Підтверджений статус права" value={rightLabels[value.rightStatus]}/>
     {value.acquiredOn&&<InfoItem label="Внесена дата набуття права" value={formatDate(value.acquiredOn)}/>}
     {value.nextThreshold&&<InfoItem label="Наступний поріг" value={`Понад ${value.nextThreshold.years} років — ${value.nextThreshold.days} к. дн.`}/>}
     {value.reviewOn&&<InfoItem label="Орієнтовна перевірка" value={formatDate(value.reviewOn)}/>}
    </dl>
    {value.status==='missing_baseline'&&<p className="leave-muted">Для розрахунку внесіть підтверджений опорний стаж в особовій картці.</p>}
    {value.status==='requires_review'&&<Alert variant="warning">Розрахунок потребує перевірки опорних відомостей і календарних дат.</Alert>}
    {value.status==='baseline_only'&&<p className="leave-muted">Історичний стаж не встановлює актуального права на сьогодні. Дата наступного порогу не прогнозується.</p>}
    {value.status==='calculated'&&value.nextThreshold&&!value.reviewOn&&<p className="leave-muted">Дату наступного порогу в підтримуваному календарному діапазоні визначити неможливо.</p>}
    {value.status==='calculated'&&(value.recommendedDays??0)>0&&value.rightStatus!=='has_right'&&<Alert variant="info">{value.rightStatus==='unknown'?'Стажевий поріг досягнуто за розрахунком, але право ще не перевірено.':'Розрахунок досягнув стажевого порогу, а підтверджений статус — «Немає права». Перевірте кадрові обставини.'} Статус права не змінено.</Alert>}
    {value.currentPeriods.filter(p=>p.comparison==='different').map(p=><p key={p.id} className="leave-muted">За поточний період {formatDate(p.periodStart)}–{formatDate(p.periodEnd)} підтверджено {p.confirmedDays} днів; розрахункова тривалість — {value.recommendedDays}. Це привід перевірити підстави, а не висновок про помилку.</p>)}
    {value.historicalBalancePresent&&<p className="leave-muted">Історичний залишок не порівнюється з нормативною тривалістю: він може враховувати попередні використання.</p>}
    <p className="leave-muted">Рекомендація потребує кадрової перевірки права й особливих обставин, зокрема періодів догляду за дитиною. Прогнозована дата орієнтовна; підтверджені дні, залишки та дата набуття права не змінюються.</p>
   </>}
  </>}
 </InfoSection>
}
