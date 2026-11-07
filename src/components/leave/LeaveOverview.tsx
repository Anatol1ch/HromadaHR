import { useEffect, useState } from 'react'
import type { LeaveRecord, PeriodBalance, ProposedLeavePeriod } from '../../../shared/leave'
import { balanceSummary } from './summary'
import { leaveLabels, periodLeaveOptions } from './presentation'
import { todayIsoDate, formatDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'

/** Employee card overview: no mutation components or callbacks are mounted here. */
export default function LeaveOverview({ employeeId, revision }: { employeeId: string; revision: number }) {
  const [data, setData] = useState<{ balances: PeriodBalance[]; proposals: ProposedLeavePeriod[]; records: LeaveRecord[] }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setData(undefined); setError('')
    const through = todayIsoDate() > '2027-01-01' ? todayIsoDate() : '2027-01-01'
    async function load() {
      try {
        const api = window.hromadaHR.leave
        const [balances, records, ...proposals] = await Promise.all([api.getBalances(employeeId), api.listRecords(employeeId),
          ...periodLeaveOptions.map(option => api.proposePeriods(employeeId, through, option.value))] as const)
        if (!active) return
        if (!balances.ok) { setError(personnelMessage(balances.error.code)); return }
        if (!records.ok) { setError(personnelMessage(records.error.code)); return }
        const failed = proposals.find(result => !result.ok)
        if (failed && !failed.ok) { setError(personnelMessage(failed.error.code)); return }
        setData({ balances: balances.data, records: records.data, proposals: proposals.flatMap(result => result.ok ? result.data : []) })
      } catch { if (active) setError('Не вдалося завантажити відпустки.') }
    }
    void load()
    return () => { active = false }
  }, [employeeId, revision, retry])
  if (error) return <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{error}</Alert>
  if (!data) return <DataState kind="loading" message="Завантаження відпусток…" />
  return <section className="leave-layout leave-overview" aria-label="Огляд відпусток">
    <h3>Залишки відпусток</h3><div className="leave-balance-grid">{periodLeaveOptions.map(option => {
      const summary = balanceSummary(option.value, data.balances, data.proposals)
      return <div key={option.value} className="leave-balance-choice"><span>{option.label}</span>
        <strong>{summary.count ? (summary.incomplete || option.value === 'oms_service_additional' ? 'Відомий залишок — ' : 'Залишилося ') + summary.remaining.toLocaleString('uk-UA') + ' днів' : 'Не внесено'}</strong>
        {summary.incomplete && <small>Залишки внесено не за всі періоди</small>}</div>
    })}</div>
    <h3>Останні зареєстровані відпустки</h3><DictionaryTable label="Останні відпустки" className="leave-table" columns={[{label:'Вид'},{label:'Дати'},{label:'Днів'},{label:'Статус'},{label:'Розпорядження'}]} empty={data.records.length ? undefined : 'Відпусток ще не зареєстровано.'}>
      {data.records.slice(0,5).map(record => <tr key={record.id}><td>{leaveLabels[record.leaveType]}{record.allocationWarning && <small role="status">Розподіл потребує перевірки у розділі «Відпустки».</small>}</td><td>{formatDate(record.startDate)}–{formatDate(record.endDate)}</td><td>{record.usedDays}</td><td>{record.status === 'active' ? 'Зареєстровано' : 'Скасовано'}</td><td>{record.orderNumber ?? '—'}</td></tr>)}
    </DictionaryTable><p className="leave-muted">Усі операції доступні у розділі «Відпустки». Майбутні зареєстровані відпустки вже враховано в залишках.</p>
  </section>
}
