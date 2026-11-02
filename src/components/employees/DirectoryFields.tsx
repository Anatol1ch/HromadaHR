import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Department, Position } from '../../../shared/personnel'
import { dictionaryName, personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

export interface DirectoryState { loading: boolean; error: string; draft: boolean; dirty: boolean; pending: boolean }
export const initialDirectoryState: DirectoryState = { loading: true, error: '', draft: false, dirty: false, pending: false }
export default function DirectoryFields({ departmentId, positionId, onDepartment, onPosition, errors, inFlight, onState }: {
  departmentId: string; positionId: string; onDepartment: (id: string) => void; onPosition: (id: string) => void
  errors: { departmentId?: string; positionId?: string }; inFlight: RefObject<boolean>; onState: (state: DirectoryState) => void
}) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState<{ kind: 'department' | 'position'; name: string } | null>(null)
  const [draftError, setDraftError] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const hasDraft = !!draft, dirty = !!draft?.name
  useEffect(() => { onState({ loading, error, draft: hasDraft, dirty, pending }) }, [loading, error, hasDraft, dirty, pending, onState])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void Promise.all([window.hromadaHR.personnel.listDepartments(), window.hromadaHR.personnel.listPositions()]).then(([departments, positions]) => {
      if (!active) return
      if (!departments.ok) setError(personnelMessage(departments.error.code))
      else if (!positions.ok) setError(personnelMessage(positions.error.code))
      else { setDepartments(departments.data); setPositions(positions.data) }
    }).catch(() => { if (active) setError('Не вдалося завантажити довідники. Повторіть спробу.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  function focusSelect(kind: 'department' | 'position') {
    requestAnimationFrame(() => root.current?.querySelector<HTMLSelectElement>(`#directory-${kind}`)?.focus())
  }
  async function add() {
    if (!draft || inFlight.current) return
    const name = dictionaryName(draft.name)
    if (!name || name.length > 200) { setDraftError('Введіть назву від 1 до 200 символів.'); return }
    const kind = draft.kind
    inFlight.current = true; setPending(true); setDraftError('')
    try {
      const api = window.hromadaHR.personnel
      const result = kind === 'department' ? await api.createDepartment({ name }) : await api.createPosition({ name })
      if (!alive.current) return
      if (!result.ok) {
        setDraftError(result.error.code === 'CONFLICT' ? 'Така назва вже існує. Скасуйте додавання й виберіть наявний запис або введіть іншу назву.' : personnelMessage(result.error.code))
        if (result.error.code === 'CONFLICT') {
          const refreshed = kind === 'department' ? await api.listDepartments() : await api.listPositions()
          if (alive.current && refreshed.ok) {
            if (kind === 'department') setDepartments(refreshed.data)
            else setPositions(refreshed.data)
          }
        }
        return
      }
      if (kind === 'department') {
        setDepartments(current => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name, 'uk'))); onDepartment(result.data.id)
      } else {
        setPositions(current => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name, 'uk'))); onPosition(result.data.id)
      }
      setDraft(null); focusSelect(kind)
      setNotice(`Запис «${result.data.name}» створено та вибрано. Він залишиться у довіднику після скасування форми.`)
    } catch { if (alive.current) setDraftError('Не вдалося підтвердити створення. Перевірте перелік перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setPending(false) }
  }
  return <div className="employee-field-full employee-directory-fields" ref={root}>
    {loading && <DataState kind="loading" compact message="Завантаження довідників…" />}
    {error && <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>{error}</Alert>}
    <div className="employee-form-grid">
      {(['department', 'position'] as const).map(kind => {
        const key = kind === 'department' ? 'departmentId' : 'positionId'
        return <div className="employee-field" key={kind}>
          <label htmlFor={`directory-${kind}`}>{kind === 'department' ? 'Підрозділ' : 'Посада'} *</label>
          <div className="employee-select-action">
            <select id={`directory-${kind}`} required value={kind === 'department' ? departmentId : positionId} disabled={loading || !!error || pending}
              aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `directory-error-${kind}` : undefined}
              onChange={event => { if (kind === 'department') onDepartment(event.target.value); else onPosition(event.target.value) }}>
              <option value="">Виберіть {kind === 'department' ? 'підрозділ' : 'посаду'}</option>
              {(kind === 'department' ? departments : positions).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
            <button className="secondary-button" type="button" disabled={loading || !!error || hasDraft || pending}
              aria-label={`Додати ${kind === 'department' ? 'підрозділ' : 'посаду'}`} onClick={() => { setDraft({ kind, name: '' }); setDraftError('') }}>Додати</button>
          </div>
          {errors[key] && <span className="field-error" id={`directory-error-${kind}`}>{errors[key]}</span>}
        </div>
      })}
    </div>
    <p className="employee-hint">Нові посади й підрозділи зберігаються одразу та залишаються у довіднику після скасування форми.</p>
    {notice && <Alert variant="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
    {draft && <div className="employee-quick-add" role="group" aria-label="Новий запис довідника">
      <label htmlFor="dictionary-name">{draft.kind === 'department' ? 'Назва нового підрозділу' : 'Назва нової посади'}</label>
      <input id="dictionary-name" autoFocus value={draft.name} disabled={pending} aria-invalid={!!draftError} aria-describedby={draftError ? 'dictionary-error' : undefined}
        onChange={event => { setDraft({ ...draft, name: event.target.value }); setDraftError('') }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add() } }} />
      {draftError && <span className="field-error" role="alert" id="dictionary-error">{draftError}</span>}
      <div className="employee-actions"><button className="primary-button" type="button" disabled={pending} onClick={() => { void add() }}>{pending ? 'Створення…' : 'Створити та вибрати'}</button>
        <button className="secondary-button" type="button" disabled={pending} onClick={() => { setDraft(null); focusSelect(draft.kind) }}>Скасувати додавання</button></div>
    </div>}
  </div>
}
