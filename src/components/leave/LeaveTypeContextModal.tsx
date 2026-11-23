import { CalendarDays, History } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import { isPeriodLeave, type LeaveType, type PeriodBalance, type ProposedLeavePeriod } from '../../../shared/leave'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import Modal from '../Modal'
import { formatDate } from '../../lib/dates'
import { fullName } from '../../employees/model'
import { balanceSummary, formatLeaveDays } from './summary'
import { leaveWorkspaceLabels } from './presentation'
import LeaveRights from './LeaveRights'
import LeaveEventAccounting, { type AccountingYear } from './LeaveEventAccounting'
import LeaveTypeIcon from './LeaveTypeIcon'
import OmsServiceLeaveProjection from './OmsServiceLeaveProjection'
import type { LeaveOverviewData } from './LeaveOverview'
import type { RegistrationHistory } from './registry'

export default function LeaveTypeContextModal({ employee, type, data, loading, error, throughDate, year, years, history, navigationGuard, revision, onYear, onClose, onOpenHistory, onOpenBalances, onChanged }: {
  employee: EmployeeCard; type: LeaveType; data?: LeaveOverviewData; loading: boolean; error?: string; throughDate: string
  year: string; years: string[]; history: RegistrationHistory; navigationGuard: RefObject<NavigationGuard>; revision:number
  onYear: (year:string)=>void
  onClose: () => void; onOpenHistory: () => void; onOpenBalances: () => void; onChanged: () => void
}) {
  const [rightsDirty, setRightsDirty] = useState(false)
  const right = data?.rights.find(item => item.leaveType === type)
  const noRight = right?.status === 'no_right'
  const calendar: AccountingYear = { year, years, onYear }

  function content() {
    if (error) return <Alert variant="error">{error}</Alert>
    if (loading || !data) return <DataState kind="loading" message="Завантаження відомостей…"/>
    if (!isPeriodLeave(type)) return <LeaveEventAccounting type={type} employeeId={employee.id} calendar={calendar} history={history}
      right={null} noRight={noRight} showLimit={!!right && !noRight} actions={null}/>

    const saved = data.balances.filter(period => period.leaveType === type)
    const proposals = type === 'children_social_additional' ? [] : data.proposals.filter(period => period.leaveType === type && period.periodStart <= throughDate)
    const summary = balanceSummary(type, data.balances, proposals)
    const periods = new Map<string, ProposedLeavePeriod | PeriodBalance>(data.proposals.filter(period => period.leaveType === type).map(period => [period.periodStart, period]))
    for (const period of saved) periods.set(period.periodStart, period)
    const rows = [...periods.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    return <div className="leave-context-period-content">
      <InfoSection title="Підтверджені дні та залишок" icon={<CalendarDays size={17} aria-hidden="true"/>}>
        {summary.count ? <>
          <dl className="leave-context-metrics">
            <InfoItem label={summary.incomplete && !noRight ? 'Доступно за внесеними періодами' : noRight ? 'Історичний залишок' : 'Доступно'} value={formatLeaveDays(summary.remaining)} emphasis/>
            <InfoItem label="Підтверджено" value={formatLeaveDays(summary.entered)}/>
            <InfoItem label="Використано" value={formatLeaveDays(summary.accounted)}/>
          </dl>
          {summary.incomplete && !noRight && <Alert variant="warning">Облік внесено лише за частиною періодів. Показаний залишок охоплює лише підтверджені дані.</Alert>}
        </> : <DataState kind="empty" compact message="Підтверджені залишки ще не внесено. Перевірте право та облікові періоди перед реєстрацією."/>}
        {rows.length ? <DictionaryTable label="Відомості за обліковими періодами" className="leave-table leave-context-period-table" columns={[
          { label: 'Обліковий період' }, { label: 'Підтверджено', className: 'leave-days-column' },
          { label: 'Використано', className: 'leave-days-column' }, { label: 'Залишок', className: 'leave-days-column' },
        ]}>
          {rows.map(period => {
            const balance = saved.find(item => item.periodStart === period.periodStart)
            return <tr key={period.periodStart}>
              <td>{formatDate(period.periodStart)}–{formatDate(period.periodEnd)}</td>
              <td className="leave-days-column">{balance ? formatLeaveDays(balance.confirmedDays) : 'Не внесено'}</td>
              <td className="leave-days-column">{balance ? formatLeaveDays(balance.usedDays) : '–'}</td>
              <td className="leave-days-column">{balance ? formatLeaveDays(balance.availableDays) : '–'}</td>
            </tr>
          })}
        </DictionaryTable> : <DataState kind="empty" compact message="Облікові періоди ще не визначено."/>}
      </InfoSection>
      {type === 'oms_service_additional' && <OmsServiceLeaveProjection employeeId={employee.id} revision={revision}/>}
    </div>
  }

  return <Modal title={leaveWorkspaceLabels[type]} description={fullName(employee)} size="large"
    className="leave-context-modal leave-editor-modal" headerIcon={<LeaveTypeIcon type={type}/>} dirty={rightsDirty} onClose={onClose}
    footer={<div className="leave-context-footer">
      {isPeriodLeave(type)
        ? <button type="button" className="secondary-button" onClick={onOpenBalances}>Перейти до обліку періодів</button>
        : <button type="button" className="secondary-button" onClick={onOpenHistory}><History size={16} aria-hidden="true"/>Історія надань</button>}
    </div>}>
    <div className="leave-context-content">
      <LeaveRights key={type} employeeId={employee.id} navigationGuard={navigationGuard} type={type} onSaved={onChanged} onDirtyChange={setRightsDirty}/>
      {content()}
    </div>
  </Modal>
}
