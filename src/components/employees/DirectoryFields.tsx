import { Plus } from 'lucide-react'
import { notifySystemToast } from '../SystemToastHost'
import Select from '../Select'
import DirectoryForm from './DirectoryForm'
import type { NavigationGuard } from './useUnsavedChanges'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Department, Position } from '../../../shared/personnel'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'

export interface DirectoryState { loading: boolean; error: string; draft: boolean; pending: boolean }
export const initialDirectoryState: DirectoryState = { loading: true, error: '', draft: false, pending: false }
export default function DirectoryFields({ departmentId, positionId, onDepartment, onPosition, errors, disabled = false, inFlight, navigationGuard, onState }: {
  departmentId: string; positionId: string; onDepartment: (id: string) => void; onPosition: (id: string) => void
  disabled?: boolean; errors: { departmentId?: string; positionId?: string }; inFlight: RefObject<boolean>; navigationGuard: RefObject<NavigationGuard>; onState: (state: DirectoryState) => void
}) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState<'department' | 'position' | null>(null)
  const [pending, setPending] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<'department' | 'position' | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const hasDraft = !!draft
  useEffect(() => { onState({ loading, error, draft: hasDraft, pending }) }, [loading, error, hasDraft, pending, onState])
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
  useEffect(() => {
    if (disabled || draft || pending || !returnFocus.current) return
    const trigger = root.current?.querySelector<HTMLButtonElement>(`[data-directory="${returnFocus.current}"] [role="combobox"]`)
    if (!trigger || trigger.disabled) return
    returnFocus.current = null
    trigger.focus()
  }, [disabled, draft, pending])
  async function refreshConflict() {
    const api = window.hromadaHR.personnel
    const result = draft === 'department' ? await api.listDepartments() : await api.listPositions()
    if (alive.current && result.ok) {
      if (draft === 'department') setDepartments(result.data)
      else setPositions(result.data)
    }
  }
  function created(entry: Department | Position) {
    if (!draft) return
    if (draft === 'department') { setDepartments(current => [...current, entry].sort((a,b) => a.name.localeCompare(b.name, 'uk'))); onDepartment(entry.id) }
    else { setPositions(current => [...current, entry].sort((a,b) => a.name.localeCompare(b.name, 'uk'))); onPosition(entry.id) }
    returnFocus.current = draft
    setDraft(null)
    notifySystemToast('success', 'Запис створено', 'Новий запис створено та вибрано.')
  }
  return <div className="recipient-field employee-directory-fields" ref={root}>
    {loading && <DataState kind="loading" compact message="Завантаження довідників…" />}
    {error && <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження</button>}>{error}</Alert>}
    <div className="employee-directory-grid">
      {(['department', 'position'] as const).map(kind => {
        const key = kind === 'department' ? 'departmentId' : 'positionId'
        return <div className="recipient-field employee-field" key={kind} data-directory={kind}>
          <span>{kind === 'department' ? 'Підрозділ' : 'Посада'} *</span>
          <div className="employee-select-action">
            <Select label={kind === 'department' ? 'Підрозділ' : 'Посада'} required searchable value={kind === 'department' ? departmentId : positionId}
              disabled={disabled || loading || !!error || pending} error={errors[key]}
              options={(kind === 'department' ? departments : positions).map(entry => ({ value: entry.id, label: entry.name }))}
              onChange={id => { if (kind === 'department') onDepartment(id); else onPosition(id) }} />
            <button className="secondary-button employee-directory-add" type="button" disabled={disabled || loading || !!error || hasDraft || pending}
              title={`Додати ${kind === 'department' ? 'підрозділ' : 'посаду'}`} aria-label={`Додати ${kind === 'department' ? 'підрозділ' : 'посаду'}`} onClick={() => { setDraft(kind) }}><Plus size={18} aria-hidden="true"/></button>
          </div>
        </div>
      })}
    </div>
    {draft && <DirectoryForm kind={draft} inFlight={inFlight} navigationGuard={navigationGuard} onPending={setPending} onConflict={refreshConflict} onCreated={created}
      onClose={() => { returnFocus.current = draft; setDraft(null) }} />}
  </div>
}
