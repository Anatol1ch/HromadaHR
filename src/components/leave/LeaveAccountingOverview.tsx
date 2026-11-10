import { useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid } from 'lucide-react'
import { isPeriodLeave, type LeaveType, type PeriodBalance, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import InfoSection from '../InfoSection'
import LeaveTypeCard, { LeaveBalanceMetric } from './LeaveTypeCard'
import { AccountingHistoryState, AccountingYearPicker, type AccountingHistory, type AccountingYear } from './LeaveEventAccounting'
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
  return <InfoSection title="Усі види відпусток" icon={<LayoutGrid size={18}/>} action={<AccountingYearPicker {...calendar} compact/>}>
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
      {leaveOptions.map(({ value: type }) => {
        const proposal = type === 'annual_main' ? currentProposals?.annual : type === 'oms_service_additional' ? currentProposals?.service : undefined
        const summary = isPeriodLeave(type) && balances?.data
          ? balanceSummary(type, balances.data, proposal?.data?.filter(period => period.periodStart <= throughDate) ?? []) : undefined
        const usage = !isPeriodLeave(type) && !history.loading && !history.error
          ? annualUsage(history.records, employeeId, type, calendar.year) : undefined
        const metric = summary ? <LeaveBalanceMetric {...summary} historical={isHistorical(type)}/>
          : usage ? <><strong>{formatLeaveDays(usage.days)}</strong><small>Зареєстровано за рік</small></>
          : isPeriodLeave(type) && !balances ? <small>Завантаження…</small> : undefined
        return <LeaveTypeCard key={type} type={type} right={rightFor(type)} metric={metric} onOpen={() => onDetails(type)}/>
      })}
    </div>
  </InfoSection>
}
