import { isPeriodLeave } from '../../../shared/leave'
import { useEffect, useState } from 'react'
import type { LeaveRecord, PeriodBalance, ProposedLeavePeriod, EmployeeLeaveRight } from '../../../shared/leave'
import { balanceSummary } from './summary'
import { leaveLabels, leaveOptions, periodLeaveOptions } from './presentation'
import { todayIsoDate, formatDate, formatDateTime } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'

/** Employee card overview: no mutation components or callbacks are mounted here. */
export default function LeaveOverview({ employeeId, revision, onOpen }: { employeeId: string; revision: number; onOpen: () => void }) {
  const [data, setData] = useState<{ balances: PeriodBalance[]; proposals: ProposedLeavePeriod[]; records: LeaveRecord[]; rights: EmployeeLeaveRight[] }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setData(undefined); setError('')
    const through = todayIsoDate() > '2027-01-01' ? todayIsoDate() : '2027-01-01'
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
  }, [employeeId, revision, retry])
  if (error) return <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{error}</Alert>
  if (!data) return <DataState kind="loading" message="Завантаження відпусток…" />
  return <section className="leave-layout leave-overview" aria-label="Огляд відпусток">
    <section className="employee-card-section"><h4>Права та залишки відпусток</h4><div className="leave-rights-overview">{leaveOptions.map(option => {
      const right = data.rights.find(item => item.leaveType === option.value)
      const periodic = isPeriodLeave(option.value)
      const summary = isPeriodLeave(option.value) ? balanceSummary(option.value, data.balances, data.proposals) : null
      return <article key={option.value}><h5>{option.label}</h5><span>{right?.status === 'has_right' ? 'Право підтверджено' : right?.status === 'no_right' ? 'Права немає' : 'Не перевірено'}</span>
        {right && <small>Перевірено {formatDateTime(right.checkedAt)}</small>}
        {periodic ? <><strong>{right?.status === 'no_right' ? 'Права немає' : summary?.count ? summary.remaining.toLocaleString('uk-UA') + ' днів' : 'Залишки не внесено'}</strong>
          {summary && summary.count > 0 && <small>{summary.remaining.toLocaleString('uk-UA')} із {summary.entered.toLocaleString('uk-UA')} внесених днів</small>}
          {summary?.incomplete && <small>Дані внесено не за всі періоди</small>}</> : <small>Залишок за цим видом не ведеться</small>}
        {right?.status === 'no_right' && ((summary?.remaining ?? 0n) > 0n || data.records.some(record => record.leaveType === option.value)) && <small role="status">Є внесені дні або попередні реєстрації – перевірте поточний статус.</small>}
      </article>
    })}</div></section>
    <h3>Останні зареєстровані відпустки</h3><DictionaryTable label="Останні відпустки" className="leave-table" columns={[{label:'Вид'},{label:'Дати'},{label:'Днів'},{label:'Статус'},{label:'Розпорядження'}]} empty={data.records.length ? undefined : 'Відпусток ще не зареєстровано.'}>
      {data.records.slice(0,5).map(record => <tr key={record.id}><td>{leaveLabels[record.leaveType]}{record.allocationWarning && <small role="status">Розподіл потребує перевірки у розділі «Відпустки».</small>}</td><td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td><td>{record.usedDays}</td><td>{record.status === 'active' ? 'Зареєстровано' : 'Скасовано'}</td><td>{record.orderNumber ?? '–'}</td></tr>)}
    </DictionaryTable><button type="button" className="primary-button leave-open-workspace" onClick={onOpen}>Перейти до відпусток</button><p className="leave-muted">Усі операції доступні у розділі «Відпустки». Майбутні зареєстровані відпустки вже враховано в залишках.</p>
  </section>
}
