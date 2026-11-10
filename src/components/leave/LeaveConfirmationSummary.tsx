import { specialLeaveLimit, type LeaveRegistration } from '../../../shared/leave'
import { formatDate } from '../../lib/dates'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import type { ConfirmationPeriod } from './confirmation'
import { leaveLabels } from './presentation'
import { formatLeaveDays } from './summary'

export default function LeaveConfirmationSummary({ input, employeeName, periods, changes }: {
  input: LeaveRegistration; employeeName: string; periods: ConfirmationPeriod[]; changes: string[]
}) {
  const limit = specialLeaveLimit(input.leaveType)
  const order = [input.orderNumber && '№ ' + input.orderNumber, input.orderDate && formatDate(input.orderDate)]
    .filter(Boolean).join(input.orderNumber ? ' від ' : '')
  return <div className="leave-confirmation-summary">
    <InfoSection title="Основні відомості">
      <dl className="info-grid info-grid-two">
        <InfoItem label="Працівник" value={employeeName}/>
        <InfoItem label="Вид відпустки" value={leaveLabels[input.leaveType]}/>
        <InfoItem label="Початок" value={formatDate(input.startDate)}/>
        <InfoItem label="Завершення" value={formatDate(input.endDate)}/>
        <InfoItem label="Тривалість у календарних днях" value={formatLeaveDays(input.usedDays)} emphasis wide/>
      </dl>
    </InfoSection>
    {periods.length > 0 && <InfoSection title="Розподіл днів">
      <dl className="leave-confirmation-periods">
        {periods.map(period => <div key={period.periodId}>
          <dt>{formatDate(period.start)}–{formatDate(period.end)}</dt>
          <dd>{formatLeaveDays(period.days)}</dd>
        </div>)}
        <div className="leave-confirmation-total"><dt>Разом</dt><dd>{formatLeaveDays(input.usedDays)}</dd></div>
      </dl>
    </InfoSection>}
    {(order || input.grantBasis || input.durationExplanation) && <InfoSection title="Документальні відомості">
      <dl className="info-grid">
        {order && <InfoItem label="Розпорядження" value={order} wide/>}
        {input.grantBasis && <InfoItem label="Підстава надання" value={input.grantBasis} wide/>}
        {input.durationExplanation && <InfoItem label="Пояснення тривалості" value={input.durationExplanation} wide/>}
      </dl>
    </InfoSection>}
    {limit !== null && <small>Обмеження виду – до {formatLeaveDays(limit)}, одне активне надання за рік початку.</small>}
    {changes.length > 0 && <small>Змінено – {changes.join(', ').toLocaleLowerCase('uk-UA')}.</small>}
  </div>
}
