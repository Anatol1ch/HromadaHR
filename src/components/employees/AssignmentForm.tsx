import { useEffect, useRef, useState } from 'react'
import type { RefObject, FormEvent } from 'react'
import type { Assignment, EmployeeCard } from '../../../shared/personnel'
import { fullName, localToday, personnelMessage, validateAssignment } from '../../employees/model'
import type { AssignmentValues, FormErrors } from '../../employees/model'
import DirectoryFields, { initialDirectoryState } from './DirectoryFields'
import useUnsavedChanges from './useUnsavedChanges'
import Alert from '../Alert'

export default function AssignmentForm({ employee, assignment, navigationGuard, onCancel, onSaved }: {
  employee: EmployeeCard; assignment?: Assignment; navigationGuard: RefObject<() => boolean>
  onCancel: () => void; onSaved: (employee: EmployeeCard) => void
}) {
  const [initial] = useState<AssignmentValues>(() => ({
    startDate: assignment?.startDate ?? localToday(), departmentId: assignment?.departmentId ?? employee.currentAssignment.departmentId,
    positionId: assignment?.positionId ?? employee.currentAssignment.positionId, category: (assignment ?? employee.currentAssignment).category ?? '',
  }))
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [directory, setDirectory] = useState(initialDirectoryState)
  const inFlight = useRef(false), alive = useRef(true)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useUnsavedChanges(JSON.stringify(values) !== JSON.stringify(initial) || directory.dirty, inFlight, navigationGuard)
  function change(key: keyof AssignmentValues, value: string) {
    setValues(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || directory.loading || directory.error || directory.draft) return
    const errors = validateAssignment(values, employee.birthDate, localToday())
    if (Object.keys(errors).length) {
      setErrors(errors); setError('Перевірте позначені поля.')
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    inFlight.current = true; setSaving(true); setError('')
    try {
      const input = { ...values, category: values.category.trim() || null }
      const result = assignment ? await window.hromadaHR.personnel.updateAssignment(assignment.id, input) :
        await window.hromadaHR.personnel.createAssignment(employee.id, input)
      if (!alive.current) return
      if (!result.ok) { setError(personnelMessage(result.error.code)); return }
      onSaved(result.data)
    } catch { if (alive.current) setError('Не вдалося підтвердити збереження. Дані форми збережено; перевірте історію перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setSaving(false) }
  }
  return <div>
    <div className="page-heading employee-heading"><div><div className="eyebrow">ІСТОРІЯ ПОСАД</div>
      <h1 tabIndex={-1} data-page-title>{assignment ? 'Виправлення призначення' : 'Нова кадрова зміна'}</h1>
      <p className="subtitle">{fullName(employee)}</p></div></div>
    {assignment && assignment.startDate > localToday() && <Alert variant="warning">У записі є майбутня дата. Її не змінено автоматично: перед збереженням потрібно явно вказати коректну дату не пізніше сьогодні.</Alert>}
    {error && <Alert variant="error">{error}</Alert>}
    <form ref={form} noValidate onSubmit={event => { void submit(event) }} aria-busy={saving || directory.pending}>
      <fieldset className="dashboard-panel employee-form-panel" disabled={saving || directory.pending}>
        <legend>{assignment ? 'Відомості призначення' : 'Кадрова зміна'}</legend>
        <div className="employee-form-grid">
          <div className="employee-field"><label htmlFor="assignment-date">Дата початку *</label>
            <input id="assignment-date" type="date" required min="0001-01-01" max={localToday()} value={values.startDate}
              onChange={event => change('startDate', event.target.value)} aria-invalid={!!errors.startDate} aria-describedby={errors.startDate ? 'assignment-date-error' : undefined} />
            {errors.startDate && <span className="field-error" id="assignment-date-error">{errors.startDate}</span>}</div>
          <div className="employee-field"><label htmlFor="assignment-category">Категорія посади</label>
            <input id="assignment-category" maxLength={200} value={values.category} onChange={event => change('category', event.target.value)}
              aria-invalid={!!errors.category} aria-describedby={errors.category ? 'assignment-category-error' : undefined} />
            {errors.category && <span className="field-error" id="assignment-category-error">{errors.category}</span>}</div>
          <DirectoryFields departmentId={values.departmentId} positionId={values.positionId} errors={errors} inFlight={inFlight} onState={setDirectory}
            onDepartment={id => change('departmentId', id)} onPosition={id => change('positionId', id)} />
        </div>
        <p className="employee-hint">Можна внести минулу дату або виправити перше призначення. Дата прийняття й поточна посада будуть визначені з оновленої історії.</p>
      </fieldset>
      <div className="employee-actions employee-form-footer">
        <button className="primary-button" type="submit" disabled={saving || directory.pending || directory.loading || !!directory.error || directory.draft} aria-busy={saving}>{saving ? 'Збереження…' : 'Зберегти призначення'}</button>
        <button className="secondary-button" type="button" disabled={saving || directory.pending} onClick={onCancel}>Скасувати</button>
      </div>
    </form>
  </div>
}
