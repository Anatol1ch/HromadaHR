// Table/action pattern adapted from HromadaAID Server Manager BackupManagement (33eca107).
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, RefreshCw, RotateCcw } from 'lucide-react'
import type { IpcResult } from '../../shared/ipc'
import type { AvailableBackups } from '../../shared/backup'
import { formatDateTime } from '../lib/dates'
import Alert from './Alert'
import DictionaryTable from './DictionaryTable'
import BackupHistory from './BackupHistory'

export default function BackupCopies({ busy, revision, onSelect, onChoose }: {
  busy: boolean; revision: number; onSelect: (id: string) => void; onChoose: () => void
}) {
  const [tab, setTab] = useState<'copies' | 'operations'>('copies')
  const [data, setData] = useState<AvailableBackups | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const request = useRef(0)
  const pending = useRef<{ revision: number; refresh: number; result: Promise<IpcResult<AvailableBackups>> } | null>(null)
  useEffect(() => {
    const generation = ++request.current
    setLoading(true)
    // Reuse the same read during StrictMode's effect replay; the service mutex
    // must not turn that replay into a false BUSY error.
    if (!pending.current || pending.current.revision !== revision || pending.current.refresh !== refresh) {
      pending.current = { revision, refresh, result: window.hromadaHR.backup.listCopies() }
    }
    void pending.current.result.then(result => {
      if (generation !== request.current) return
      if (result.ok) { setData(result.data); setError('') }
      else setError(result.error.code === 'BUSY' ? 'Інша операція виконується. Оновіть перелік після її завершення.' : 'Не вдалося отримати перелік копій. Спробуйте оновити його.')
    }).catch(() => {
      if (generation === request.current) setError('Перелік копій недоступний. Спробуйте оновити його.')
    }).finally(() => { if (generation === request.current) setLoading(false) })
    return () => { request.current++ }
  }, [revision, refresh])
  return <section className="backup-copies-panel">
    <nav className="settings-section-nav" aria-label="Резервні копії та операції">
      <button type="button" className={`settings-section-current ${tab === 'copies' ? 'is-selected' : ''}`} aria-pressed={tab === 'copies'} onClick={() => setTab('copies')}>Наявні копії</button>
      <button type="button" className={`settings-section-current ${tab === 'operations' ? 'is-selected' : ''}`} aria-pressed={tab === 'operations'} onClick={() => setTab('operations')}>Операції</button>
    </nav>
    <div hidden={tab !== 'copies'}>
      <section className="dashboard-panel backup-history" aria-labelledby="backup-copies-title" aria-busy={loading}>
        <div className="backup-history-heading"><h3 id="backup-copies-title">Наявні копії</h3><div className="backup-toolbar">
          <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/>Оновити</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onChoose}><FolderOpen size={16} aria-hidden="true"/>Вибрати файл…</button>
        </div></div>
        <p className="backup-history-empty">Копії з активних тек. Повна перевірка виконується перед відновленням.</p>
        {error && <Alert variant="error">{error}</Alert>}
        {loading && <p className="backup-history-empty" role="status">Завантаження копій…</p>}
        {data?.targets.some(target => !target.available) && <Alert variant="warning">Не всі теки налаштовані або доступні. Перелік може бути неповним.</Alert>}
        {data?.limited && <Alert variant="info">Перелік обмежено: до 100 копій із кожної теки. Іншу копію можна вибрати через «Вибрати файл…».</Alert>}
        {data && !data.copies.length && !loading && !error && <p className="backup-history-empty">Наявних копій у доступних активних теках немає.</p>}
        {!!data?.copies.length && <DictionaryTable label="Наявні резервні копії" className="backup-history-table"
          columns={[{ label: 'Дата й час', width: '26%' }, { label: 'Тип', width: '19%' }, { label: 'Місце', width: '15%' }, { label: 'Стан', width: '18%' }, { label: 'Дії', width: '22%' }]}>
          {data.copies.map(copy => <tr key={copy.id}><td><time dateTime={copy.time}>{formatDateTime(copy.time)}</time></td><td>{copy.kind === 'auto' ? 'Автоматична' : 'Ручна'}</td><td>Тека {copy.slot}</td>
            <td>{copy.available ? 'Доступна' : 'Недоступна'}</td><td><button type="button" className="secondary-button" disabled={busy || loading || !copy.available} onClick={() => onSelect(copy.id)}><RotateCcw size={16} aria-hidden="true"/>Відновити</button></td></tr>)}
        </DictionaryTable>}
      </section>
    </div>
    <div hidden={tab !== 'operations'}><BackupHistory /></div>
  </section>
}
