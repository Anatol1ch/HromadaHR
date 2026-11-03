import Modal from '../Modal'
import { Check, X, BriefcaseBusiness } from 'lucide-react'
import type { NavigationGuard } from './useUnsavedChanges'
import DateField from '../DateField'
import ValidatedInput from '../ValidatedInput'
import { formatDateInput } from '../../lib/dates'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import { useEffect, useRef, useState } from 'react'
import type { RefObject, FormEvent } from 'react'
import type { Assignment, EmployeeCard } from '../../../shared/personnel'
import { assignmentInput, fullName, localToday, personnelMessage, validateAssignment } from '../../employees/model'
import type { AssignmentValues, FormErrors } from '../../employees/model'
import DirectoryFields, { initialDirectoryState } from './DirectoryFields'
import useUnsavedChanges from './useUnsavedChanges'
import Alert from '../Alert'

export default function AssignmentForm({ employee, assignment, navigationGuard, onCancel, onSaved }: {
  employee: EmployeeCard; assignment?: Assignment; navigationGuard: RefObject<NavigationGuard>
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
  const [dateDraftDirty, setDateDraftDirty] = useState(false)
  const requestClose = useUnsavedChanges(dateDraftDirty || JSON.stringify(values) !== JSON.stringify(initial), inFlight, navigationGuard, form)
  const close = () => requestClose(onCancel)
  function change(key: keyof AssignmentValues, value: string) {
    setValues(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || directory.loading || directory.error || directory.draft) return
    const errors = validateAssignment(values, employee.birthDate, localToday())
    if (Object.keys(errors).length) {
      setErrors(errors); setError('Перевірте позначені поля.')
      requestAnimationFrame(() => { if (form.current) focusFirstInvalid(form.current) })
      return
    }
    if (!form.current?.checkValidity()) { form.current?.reportValidity(); if (form.current) focusFirstInvalid(form.current); return }
    inFlight.current = true; setSaving(true); setError('')
    try {
      const input = assignmentInput(values)
      const result = assignment ? await window.hromadaHR.personnel.updateAssignment(assignment.id, input) :
        await window.hromadaHR.personnel.createAssignment(employee.id, input)
      if (!alive.current) return
      if (!result.ok) { setError(personnelMessage(result.error.code)); return }
      onSaved(result.data)
    } catch { if (alive.current) setError('Не вдалося підтвердити збереження. Дані форми збережено; перевірте історію перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setSaving(false) }
  }
  return <Modal title={assignment ? 'Виправити призначення' : 'Додати кадрову зміну'} description={fullName(employee)} headerIcon={<BriefcaseBusiness size={21} aria-hidden="true"/>} size="wide" className="employee-form-modal" busy={saving || directory.pending} onClose={close}>
    {assignment && assignment.startDate > localToday() && <Alert variant="warning">У записі є майбутня дата. Її не змінено автоматично: перед збереженням потрібно явно вказати коректну дату не пізніше сьогодні.</Alert>}
    {error && <Alert variant="error">{error}</Alert>}
    <form ref={form} noValidate onSubmit={event => { void submit(event) }} aria-busy={saving || directory.pending}>
      <fieldset className="recipient-fieldset" disabled={saving || directory.pending}>
        <legend>{assignment ? 'Відомості призначення' : 'Кадрова зміна'}</legend>
        <div className="recipient-form-grid">
          <div className="recipient-field employee-field"><label htmlFor="assignment-date">Дата початку *</label>
            <DateField id="assignment-date" required min="0001-01-01" max={localToday()} value={values.startDate} disabled={saving || directory.pending}
              onChange={value => change('startDate', value)} onDraftChange={display => setDateDraftDirty(display !== formatDateInput(initial.startDate))} error={errors.startDate} /></div>
          <div className="recipient-field employee-field"><label htmlFor="assignment-category">Категорія посади</label>
            <ValidatedInput id="assignment-category" maxLength={200} value={values.category} onChange={event => change('category', event.target.value)}
              aria-invalid={!!errors.category} aria-describedby={errors.category ? 'assignment-category-error' : undefined} />
            {errors.category && <span className="field-error" id="assignment-category-error">{errors.category}</span>}</div>
          <DirectoryFields departmentId={values.departmentId} positionId={values.positionId} errors={errors} disabled={saving || directory.pending} inFlight={inFlight} navigationGuard={navigationGuard} onState={setDirectory}
            onDepartment={id => change('departmentId', id)} onPosition={id => change('positionId', id)} />
        </div>
        <p className="employee-hint">Можна внести минулу дату або виправити перше призначення. Дата прийняття й поточна посада будуть визначені з оновленої історії.</p>
      </fieldset>
      <div className="recipient-form-actions"><span>Дата прийняття та посада визначаються з історії.</span><div>
        <button className="secondary-button" type="button" disabled={saving || directory.pending} onClick={close}><X size={17} aria-hidden="true"/>Скасувати</button>
        <button className="primary-button" type="submit" disabled={saving || directory.pending || directory.loading || !!directory.error || directory.draft} aria-busy={saving}><Check size={17} aria-hidden="true"/>{saving ? 'Збереження…' : 'Зберегти призначення'}</button>
      </div></div>
    </form>
  </Modal>
}
