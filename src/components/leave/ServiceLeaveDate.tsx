import { useRef, useState, type FormEvent, type RefObject } from 'react'
import Alert from '../Alert'
import DateField from '../DateField'
import { formatDateInput, parseDateInput } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'

export default function ServiceLeaveDate({ employeeId, saved, navigationGuard, onSaved }: {
  employeeId: string; saved: string | null; navigationGuard: RefObject<NavigationGuard>; onSaved: () => void
}) {
  const initial = formatDateInput(saved ?? '')
  const [draft, setDraft] = useState(initial)
  const [value, setValue] = useState(saved ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const owner = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  useUnsavedChanges(draft !== initial, pending, navigationGuard, owner)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending.current || draft === initial) return
    const date = draft ? parseDateInput(draft) : null
    if (draft && !date) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await window.hromadaHR.leave.saveServiceLeaveStart(employeeId, date)
      if (result.ok) onSaved()
      else setError(personnelMessage(result.error.code))
    } catch { setError('Не вдалося зберегти дату. Повторіть спробу.') }
    finally { pending.current = false; setBusy(false) }
  }

  return <form ref={owner} className="leave-service-date" onSubmit={event => void save(event)}>
    <label className="recipient-field">Дата набуття права на додаткову відпустку за стаж
      <DateField value={value} onChange={setValue} onDraftChange={setDraft} disabled={busy}/>
    </label>
    <button type="submit" className="secondary-button" disabled={busy || draft === initial}>{busy ? 'Збереження…' : 'Зберегти дату'}</button>
    <p className="leave-muted">Дату визначає кадровик. На її основі програма пропонує межі періодів, а дні вносяться окремо.</p>
    {error && <Alert variant="error">{error}</Alert>}
  </form>
}
