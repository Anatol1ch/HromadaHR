import { useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'
import type { Department, DictionaryEntry, DictionarySnapshot, Position } from '../../../shared/personnel'
import { dictionaryName, personnelMessage } from '../../employees/model'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import Modal from '../Modal'
import Alert from '../Alert'
import ValidatedInput from '../ValidatedInput'
import useUnsavedChanges from './useUnsavedChanges'
import type { NavigationGuard } from './useUnsavedChanges'

export default function DirectoryForm({ kind, inFlight, navigationGuard, onPending, onConflict, onCreated, onClose, standalone, edit }: {
  kind: 'department' | 'position'; inFlight: RefObject<boolean>; navigationGuard: RefObject<NavigationGuard>
  onPending: (value: boolean) => void; onConflict: () => Promise<void>
  onCreated: (entry: Department | Position) => void; onClose: () => void
  standalone?: boolean
  edit?: { entry: DictionaryEntry; onSaved: (snapshot: DictionarySnapshot) => void; onReload: () => void }
}) {
  const [name, setName] = useState(edit?.entry.name ?? '')
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const requestClose = useUnsavedChanges(name !== (edit?.entry.name ?? ''), inFlight, navigationGuard, form)
  const close = () => requestClose(onClose)
  async function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation()
    if (inFlight.current || stale) return
    const normalized = dictionaryName(name)
    if (!normalized || normalized.length > 200 || !form.current?.checkValidity()) {
      setError('Введіть назву від 1 до 200 символів.')
      requestAnimationFrame(() => { if (form.current) focusFirstInvalid(form.current, 'input') })
      return
    }
    inFlight.current = true; setPending(true); onPending(true); setError('')
    try {
      const api = window.hromadaHR.personnel
      if (edit) {
        const result = await api.renameDictionaryEntry(kind, edit.entry.id, normalized, edit.entry.revision)
        if (result.ok) { edit.onSaved(result.data); return }
        const changed = result.error.code === 'DICTIONARY_STALE' || result.error.code === 'NOT_FOUND'
        setStale(changed)
        setError(changed ? 'Запис змінився або його вилучено. Перечитайте довідник.' : personnelMessage(result.error.code))
        return
      }
      const result = kind === 'department' ? await api.createDepartment({ name: normalized }) : await api.createPosition({ name: normalized })
      if (!result.ok) {
        setError(result.error.code === 'CONFLICT' ? 'Така назва вже існує. Виберіть наявний запис після скасування або введіть іншу назву.' : personnelMessage(result.error.code))
        if (result.error.code === 'CONFLICT') await onConflict()
        return
      }
      onCreated(result.data)
    } catch { setError('Не вдалося підтвердити збереження. Перевірте довідник перед повторною спробою.') }
    finally { inFlight.current = false; setPending(false); onPending(false) }
  }
  const title = edit ? (kind === 'department' ? 'Перейменувати підрозділ' : 'Перейменувати посаду') :
    (kind === 'department' ? 'Додати підрозділ' : 'Додати посаду')
  return <Modal title={title} size="compact" busy={pending} onClose={close} headerIcon={edit ? <Pencil size={20} aria-hidden="true"/> : <Plus size={20} aria-hidden="true"/>}>
    <form ref={form} noValidate onSubmit={event => { void submit(event) }}>
      {error && <div id="directory-error"><Alert variant="error" action={stale && edit && <button type="button"
        onClick={() => requestClose(edit.onReload)}>Перечитати довідник</button>}>{error}</Alert></div>}
      <div className="recipient-field"><label htmlFor="directory-name">Назва *</label>
        <ValidatedInput id="directory-name" data-modal-autofocus required maxLength={200} disabled={pending || stale} value={name} aria-invalid={!!error} aria-describedby={error ? 'directory-error' : undefined} onChange={event => { setName(event.target.value); setError('') }}/></div>
      {!standalone && <p className="recipient-field-hint">Запис збережеться одразу й залишиться у довіднику після скасування основної форми.</p>}
      <div className="recipient-form-actions"><div>
        <button className="secondary-button" type="button" disabled={pending} onClick={close}><X size={17} aria-hidden="true"/>Скасувати</button>
        <button className="primary-button" type="submit" disabled={pending || stale || (!!edit && dictionaryName(name) === edit.entry.name)}><Check size={17} aria-hidden="true"/>{pending ? 'Збереження…' : edit ? 'Зберегти назву' : standalone ? 'Створити' : 'Створити та вибрати'}</button>
      </div></div>
    </form>
  </Modal>
}
