import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import type { BackupHistory as HistoryData } from '../../shared/backupHistory'
import { formatDateTime } from '../lib/dates'
import Alert from './Alert'
import DictionaryTable from './DictionaryTable'
import Select from './Select'

const operations = { auto: 'Автоматичне резервування', manual: 'Ручне резервування', config: 'Зміна тек', restore: 'Відновлення' }
export default function BackupHistory() {
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let active = true, pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const result = await window.hromadaHR.backup.getHistory()
        if (active) setHistory(result.ok ? result.data : { available: false, events: [] })
      } catch { if (active) setHistory({ available: false, events: [] }) }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  const rows = history?.events.filter(event => filter === 'all' || event.result === filter || (filter === 'error' && event.result === 'partial')) ?? []
  const visible = expanded ? rows : rows.slice(0, 5)
  return <section className="dashboard-panel backup-history" aria-labelledby="backup-history-title">
    <div className="backup-history-heading"><h3 id="backup-history-title"><History size={18} aria-hidden="true"/>Історія операцій</h3>
      <Select label="Фільтр історії резервування" value={filter} onChange={setFilter} advanceOnSelect={false}
        options={[{ value: 'all', label: 'Усі' }, { value: 'success', label: 'Успішні' }, { value: 'error', label: 'Помилки' }]}/>
    </div>
    {!history && <p className="backup-history-empty" role="status">Завантаження історії…</p>}
    {history && !history.available && <Alert variant="error">Історія недоступна або не збережена повністю. Це не змінює результат резервування.</Alert>}
    {history?.available && !history.events.length && <p className="backup-history-empty">Історія операцій почне накопичуватися після оновлення</p>}
    {history && history.events.length > 0 && !rows.length && <p className="backup-history-empty">Немає записів за цим фільтром</p>}
    {visible.length > 0 && <DictionaryTable label="Історія операцій резервування" className="backup-history-table"
      columns={[{ label: 'Дата й час', width: '24%' }, { label: 'Операція', width: '34%' }, { label: 'Місце', width: '17%' }, { label: 'Результат', width: '25%' }]}>
      {visible.map((event, index) => <tr key={`${event.time}-${event.operation}-${event.slot}-${index}`}>
        <td><time dateTime={event.time}>{formatDateTime(event.time)}</time></td><td>{event.duplicate ? 'Доповнення дубліката' : operations[event.operation]}</td>
        <td>{event.locations ? `${event.locations.filter(location => location.result === 'success').length} із 2` : event.slot === 1 ? 'Основне місце' : event.slot === 2 ? 'Додаткове місце' : '–'}</td>
        <td><span title={event.code ?? undefined} className={`backup-event-result ${event.result}`}>{event.result === 'success' ? 'Успішно' : event.result === 'partial' ? 'Частково' : event.result === 'cancelled' ? 'Скасовано' : 'Помилка'}</span></td>
      </tr>)}
    </DictionaryTable>}
    {rows.length > 5 && <button type="button" className="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Згорнути' : `Показати всі (${rows.length})`}</button>}
  </section>
}
