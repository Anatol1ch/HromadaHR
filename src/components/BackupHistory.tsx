import { useEffect, useState } from 'react'
import type { BackupHistory as History } from '../../shared/backupHistory'
import { formatDateTime } from '../lib/dates'
import Alert from './Alert'
import DictionaryTable from './DictionaryTable'
import Select from './Select'

const operations = { auto: 'Автоматична копія', manual: 'Ручна копія', config: 'Зміна тек', restore: 'Відновлення' }
export default function BackupHistory() {
  const [history, setHistory] = useState<History | null>(null)
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
  const rows = history?.events.filter(event => filter === 'all' || event.result === filter) ?? []
  const visible = expanded ? rows : rows.slice(0, 5)
  return <section className="dashboard-panel backup-history" aria-labelledby="backup-history-title">
    <div className="backup-history-heading"><h3 id="backup-history-title">Історія операцій</h3>
      <Select label="Фільтр історії резервування" value={filter} onChange={setFilter} advanceOnSelect={false}
        options={[{ value: 'all', label: 'Усі' }, { value: 'success', label: 'Успішні' }, { value: 'error', label: 'Помилки' }]}/>
    </div>
    {history && !history.available && <Alert variant="warning">Історія недоступна або не збережена повністю. Це не змінює результат резервування.</Alert>}
    <DictionaryTable label="Історія операцій резервування" className="backup-history-table"
      columns={[{ label: 'Дата й час' }, { label: 'Операція' }, { label: 'Місце' }, { label: 'Результат' }]}
      empty={!history ? 'Завантаження…' : !visible.length ? !history.available ? 'Історія недоступна' : history.events.length ? 'Немає записів за цим фільтром' : 'Історія операцій почне накопичуватися після оновлення' : undefined}>
      {visible.map((event, index) => <tr key={`${event.time}-${event.operation}-${event.slot}-${index}`}>
        <td><time dateTime={event.time}>{formatDateTime(event.time)}</time></td><td>{operations[event.operation]}</td>
        <td>{event.slot ? `Тека ${event.slot}` : '—'}</td>
        <td><span className={`backup-event-result ${event.result}`}>{event.result === 'success' ? 'Успішно' : event.result === 'cancelled' ? 'Скасовано' : 'Помилка'}</span>{event.code && <small className="backup-event-code">{event.code}</small>}</td>
      </tr>)}
    </DictionaryTable>
    {rows.length > 5 && <button type="button" className="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Згорнути' : `Показати всі (${rows.length})`}</button>}
  </section>
}
