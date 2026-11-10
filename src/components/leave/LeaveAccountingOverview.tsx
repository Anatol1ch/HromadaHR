import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, LayoutGrid } from 'lucide-react'
import { isPeriodLeave, type LeaveType, type PeriodBalance, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import LeaveTypeIcon from './LeaveTypeIcon'
import { AccountingHistoryState, AccountingYearPicker, annualScope, type AccountingHistory, type AccountingYear } from './LeaveEventAccounting'
import { leaveOptions } from './presentation'
import { balanceSummary, formatLeaveDays } from './summary'
import { annualUsage } from './usage'
import useAccountingDate from './useAccountingDate'

type Read<T> = { data: T; error?: never } | { error: string; data?: never }

export default function LeaveAccountingOverview({ employeeId, calendar, history, rightFor, isHistorical, onDetails }: {
  employeeId: string; calendar: AccountingYear; history: AccountingHistory
  rightFor: (type: LeaveType) => ReactNode; isHistorical: (type: LeaveType) => boolean
  onDetails: (type: LeaveType) => void
}) {
  const { throughDate } = useAccountingDate()
  const [balances, setBalances] = useState<Read<PeriodBalance[]>>()
  const [proposals, setProposals] = useState<{ throughDate: string; annual?: Read<ProposedLeavePeriod[]>; service?: Read<ProposedLeavePeriod[]> }>()
  const [balanceAttempt, setBalanceAttempt] = useState(0)
  const [proposalAttempt, setProposalAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void window.hromadaHR.leave.getBalances(employeeId).then(result => {
      if (active) setBalances(result.ok ? { data: result.data } : { error: personnelMessage(result.error.code) })
    }).catch(() => { if (active) setBalances({ error: 'Не вдалося завантажити залишки.' }) })
    return () => { active = false }
  }, [employeeId, balanceAttempt])

  useEffect(() => {
    let active = true
    async function load(field: 'annual' | 'service') {
      let read: Read<ProposedLeavePeriod[]>
      try {
        const result = await window.hromadaHR.leave.proposePeriods(employeeId, throughDate, field === 'annual' ? 'annual_main' : 'oms_service_additional')
        read = result.ok ? { data: result.data } : { error: personnelMessage(result.error.code) }
      } catch { read = { error: 'Не вдалося завантажити пропозиції періодів.' } }
      if (active) setProposals(previous => ({ ...(previous?.throughDate === throughDate ? previous : { throughDate }), [field]: read }))
    }
    void load('annual')
    void load('service')
    return () => { active = false }
  }, [employeeId, throughDate, proposalAttempt])

  const currentProposals = proposals?.throughDate === throughDate ? proposals : undefined
  return <InfoSection title="Усі види відпусток" icon={<LayoutGrid size={18}/>} action={<AccountingYearPicker {...calendar}/>}>
    <p className="leave-muted leave-accounting-note">{annualScope}</p>
    {balances?.error && <Alert variant="error" action={<button type="button" onClick={() => {
      setBalances(undefined)
      setBalanceAttempt(value => value + 1)
    }}>Повторити</button>}>{balances.error}</Alert>}
    {(currentProposals?.annual?.error || currentProposals?.service?.error) && <Alert variant="error"
      action={<button type="button" onClick={() => { setProposals(undefined); setProposalAttempt(value => value + 1) }}>Повторити</button>}>
      Не вдалося перевірити повноту обліку за всіма періодами.
    </Alert>}
    <AccountingHistoryState history={history}/>
    <div className="info-grid info-grid-two leave-accounting-grid">
      {leaveOptions.map(({ value: type, label }) => {
        const proposal = type === 'annual_main' ? currentProposals?.annual : type === 'oms_service_additional' ? currentProposals?.service : undefined
        const summary = isPeriodLeave(type) && balances?.data
          ? balanceSummary(type, balances.data, proposal?.data?.filter(period => period.periodStart <= throughDate) ?? []) : undefined
        const usage = !isPeriodLeave(type) && !history.loading && !history.error
          ? annualUsage(history.records, employeeId, type, calendar.year) : undefined
        const historical = isHistorical(type)
        return <article className="info-item leave-accounting-card" key={type}>
          <div className="leave-overview-details"><LeaveTypeIcon type={type}/><div><h4>{label}</h4>{rightFor(type)}</div></div>
          {summary && (summary.count > 0 ? <>
            <dl className="leave-accounting-values">
              <InfoItem label={historical ? 'Історичний залишок' : 'Доступний залишок'} value={formatLeaveDays(summary.remaining)} emphasis/>
              <InfoItem label="Внесено до обліку" value={formatLeaveDays(summary.entered)}/>
              <InfoItem label="Використано за періодами" value={formatLeaveDays(summary.accounted)}/>
            </dl>
            {summary.incomplete && !historical && <small>Облік внесено лише за частиною періодів.</small>}
          </> : !historical && <DataState kind="empty" compact message="Залишки ще не внесено."/>)}
          {isPeriodLeave(type) && !balances && <DataState kind="loading" compact message="Завантаження залишків…"/>}
          {usage && <dl className="leave-accounting-values">
            <InfoItem label="Активні надання" value={usage.activeCount}/>
            <InfoItem label="Зареєстровано днів" value={formatLeaveDays(usage.days)} emphasis/>
          </dl>}
          <button type="button" className="secondary-button leave-accounting-more" aria-label={'Детальніше: ' + label}
            onClick={() => onDetails(type)}>Детальніше<ArrowRight size={15} aria-hidden="true"/></button>
        </article>
      })}
    </div>
  </InfoSection>
}
