import LeaveTypeIcon from './LeaveTypeIcon'
import LeaveStatus from './LeaveStatus'
import { ArrowRight, History, Wallet } from 'lucide-react'
import InfoSection from '../InfoSection'
import useAccountingDate from './useAccountingDate'
import { isPeriodLeave } from '../../../shared/leave'
import { useEffect, useState } from 'react'
import type { LeaveRecord, PeriodBalance, ProposedLeavePeriod, EmployeeLeaveRight } from '../../../shared/leave'
import { balanceSummary, formatLeaveDays } from './summary'
import { leaveLabels, leaveOptions, periodLeaveOptions, rightLabels } from './presentation'
import { formatDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'

/** Employee card overview: no mutation components or callbacks are mounted here. */
export default function LeaveOverview({ employeeId, revision, onOpen }: { employeeId: string; revision: number; onOpen: () => void }) {
  const {throughDate}=useAccountingDate()
  const [data, setData] = useState<{ balances: PeriodBalance[]; proposals: ProposedLeavePeriod[]; records: LeaveRecord[]; rights: EmployeeLeaveRight[] }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setData(undefined); setError('')
    const through = throughDate
    async function load() {
      try {
        const api = window.hromadaHR.leave
        const [balances, records, rights, ...proposals] = await Promise.all([api.getBalances(employeeId), api.listRecords(employeeId), api.listRights(employeeId),
          ...periodLeaveOptions.map(option => api.proposePeriods(employeeId, through, option.value))] as const)
        if (!active) return
        if (!balances.ok) { setError(personnelMessage(balances.error.code)); return }
        if (!records.ok) { setError(personnelMessage(records.error.code)); return }
        if (!rights.ok) { setError(personnelMessage(rights.error.code)); return }
        const failed = proposals.find(result => !result.ok)
        if (failed && !failed.ok) { setError(personnelMessage(failed.error.code)); return }
        setData({ rights: rights.data, balances: balances.data, records: records.data, proposals: proposals.flatMap(result => result.ok ? result.data : []) })
      } catch { if (active) setError('Не вдалося завантажити відпустки.') }
    }
    void load()
    return () => { active = false }
  }, [employeeId, revision, retry, throughDate])
  if (error) return <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{error}</Alert>
  if (!data) return <DataState kind="loading" message="Завантаження відпусток…" />
  return <section className="leave-layout leave-overview" aria-label="Огляд відпусток">
    <InfoSection title="Права та залишки відпусток" icon={<Wallet size={17}/>}>
    <div className="info-grid info-grid-two">{leaveOptions.map(option => {
      const right = data.rights.find(item => item.leaveType === option.value)
      const summary = isPeriodLeave(option.value) ? balanceSummary(option.value, data.balances, data.proposals.filter(p=>p.periodStart<=throughDate)) : null
      return <article className="info-item leave-overview-item" key={option.value}>
        <div className={summary ? 'leave-overview-content has-balance' : 'leave-overview-content'}>
          <div className="leave-overview-details">
            <LeaveTypeIcon type={option.value}/>
            <div>
              <h4>{option.label}</h4>
              <span className={'leave-right-status is-'+(right?.status??'unknown')}>{rightLabels[right?.status ?? 'unknown']}</span>
            </div>
          </div>
          {summary && (summary.count > 0 || right?.status !== 'no_right') && <div className="leave-overview-balance">
            {summary.count > 0 ? <>
              <strong className="leave-overview-number">{formatLeaveDays(summary.remaining)}</strong>
              {right?.status === 'no_right' ? <small>Історичний залишок</small>
                : summary.incomplete && <small>Лише за внесеними періодами</small>}
            </> : <small className="leave-muted">Залишки ще не внесено</small>}
          </div>}
        </div>
      </article>
    })}</div>
    </InfoSection>
    <InfoSection title="Останні зареєстровані відпустки" icon={<History size={17}/>}>
      {data.records.length ? <DictionaryTable label="Останні відпустки" className="leave-table leave-recent-table" columns={[
        {label:'Вид',width:'37%'},{label:'Дати',width:'24%'},{label:'Днів',width:'7%',className:'leave-days-column'},{label:'Статус',width:'16%'},{label:'Розпорядження',width:'16%'},
      ]}>
        {data.records.slice(0,5).map(record => <tr key={record.id}>
          <td>{leaveLabels[record.leaveType]}{record.allocationWarning && <small role="status">Розподіл потребує перевірки у розділі «Відпустки».</small>}</td>
          <td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td>
          <td className="leave-days-column">{record.usedDays}</td>
          <td><LeaveStatus status={record.status}/></td>
          <td>{record.orderNumber ?? '–'}</td>
        </tr>)}
      </DictionaryTable> : <div className="info-item"><DataState kind="empty" compact message="Відпусток ще не зареєстровано."/></div>}
    </InfoSection>
    <div className="leave-dialog-actions"><button type="button" className="primary-button" onClick={onOpen}><ArrowRight size={16} aria-hidden="true"/>Перейти до відпусток</button></div>
  </section>
}
