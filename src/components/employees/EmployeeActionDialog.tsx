import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EmployeeCard as EmployeeData } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import EmployeeForm from './EmployeeForm'
import useUnsavedChanges from './useUnsavedChanges'
import type { NavigationGuard } from './useUnsavedChanges'

export default function EmployeeActionDialog({ id, kind, navigationGuard, onClose, onSaved, onDeleted }: {
  id: string; kind: 'edit' | 'delete'; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onSaved: (employee: EmployeeData) => void; onDeleted: (id: string) => void
}) {
  const [data, setData] = useState<EmployeeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const owner = useRef<HTMLDivElement>(null)
  const requestClose = useUnsavedChanges(false, inFlight, navigationGuard, owner)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    const api = window.hromadaHR.personnel
    void api.getEmployee(id).then(employee => {
      if (!alive) return
      if (!employee.ok) setError(personnelMessage(employee.error.code))
      else setData(employee.data)
    }).catch(() => { if (alive) setError('Не вдалося завантажити актуальні відомості. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, retry])
  const close = () => requestClose(onClose)
  if (kind === 'edit' && data && !loading && !error) return <EmployeeForm employee={data} navigationGuard={navigationGuard} onCancel={onClose} onSaved={onSaved}/>
  const content = <div ref={owner}>
    {loading ? <DataState kind="loading" compact message="Завантаження актуальних відомостей…"/> : data && <>
      <p><strong>{fullName(data)}</strong></p>
      <p>Особову картку та підтверджені періоди відпусток буде видалено незворотно. Посади й підрозділи залишаться у довідниках.</p>
    </>}
    {error && <Alert variant="error" action={!data ? <button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button> : undefined}>{error}</Alert>}
  </div>
  if (kind === 'edit') return <Modal title="Редагувати працівника" size="large" onClose={close}>{content}</Modal>
  return <ConfirmDialog title="Видалити працівника назавжди?" message={content} confirmLabel="Видалити назавжди" busyLabel="Видалення…"
    confirmDisabled={loading || !data || pending} onCancel={close} onConfirm={async () => {
      if (!data || loading || inFlight.current) return
      inFlight.current = true; setPending(true); setError('')
      try {
        const result = await window.hromadaHR.personnel.deleteEmployee(id)
        if (!result.ok) { setError(personnelMessage(result.error.code)); return }
        onDeleted(id)
      } catch { setError('Результат видалення не підтверджено. Оновіть реєстр перед повторною спробою.') }
      finally { inFlight.current = false; setPending(false) }
    }}/>
}
