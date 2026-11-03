import Modal from '../Modal'
import { Check, UserRound, X } from 'lucide-react'
import type { NavigationGuard } from './useUnsavedChanges'
import DateField from '../DateField'
import ValidatedInput, { ValidatedTextarea } from '../ValidatedInput'
import Select from '../Select'
import { formatDateInput } from '../../lib/dates'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import Alert from '../Alert'
import DirectoryFields, { initialDirectoryState } from './DirectoryFields'
import useUnsavedChanges from './useUnsavedChanges'
import { creationInput, displayDate, employeeTypeLabels, emptyValues, personalDetails,
  personnelMessage, validateEmployee, valuesForEmployee } from '../../employees/model'
import type { FormErrors, FormValues } from '../../employees/model'

type Props = {
  employee?: EmployeeCard
  navigationGuard: RefObject<NavigationGuard>
  onCancel: () => void
  onSaved: (employee: EmployeeCard) => void
}
export default function EmployeeForm({ employee, navigationGuard, onCancel, onSaved }: Props) {
  const [initial] = useState(() => employee ? valuesForEmployee(employee) : { ...emptyValues })
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [directory, setDirectory] = useState(initialDirectoryState)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const form = useRef<HTMLFormElement>(null)
  const [dateDrafts, setDateDrafts] = useState<Record<string, boolean>>({})
  const dirty = Object.values(dateDrafts).some(Boolean) || JSON.stringify(values) !== JSON.stringify(initial)
  const busy = saving || (!employee && directory.pending)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const requestClose = useUnsavedChanges(dirty, inFlight, navigationGuard, form)
  const close = () => requestClose(onCancel)

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || (!employee && (directory.loading || directory.error))) return
    if (!employee && directory.draft) { setError('Завершіть або скасуйте додавання запису довідника.'); return }
    const nextErrors = validateEmployee(values, !!employee)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors); setError('Перевірте позначені поля.')
      requestAnimationFrame(() => { if (form.current) focusFirstInvalid(form.current) })
      return
    }
    if (!form.current?.checkValidity()) { form.current?.reportValidity(); if (form.current) focusFirstInvalid(form.current); return }
    inFlight.current = true; setSaving(true); setError('')
    try {
      const result = employee ? await window.hromadaHR.personnel.updateEmployee(employee.id, personalDetails(values)) :
        await window.hromadaHR.personnel.createEmployee(creationInput(values))
      if (!alive.current) return
      if (!result.ok) {
        setError(result.error.code === 'UNAVAILABLE' ? 'Результат збереження не підтверджено. Перед повторною спробою перевірте запис у реєстрі.' : personnelMessage(result.error.code))
        return
      }
      // The saved response is authoritative. Leave directly without the discard guard.
      onSaved(result.data)
    } catch { if (alive.current) setError('Не вдалося підтвердити збереження. Введені дані залишилися у формі; перевірте реєстр перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setSaving(false) }
  }
  function textField(key: 'lastName' | 'firstName' | 'middleName' | 'birthDate' | 'startDate' | 'category', label: string, required = false) {
    const isDate = key === 'birthDate' || key === 'startDate'
    return <div className="recipient-field employee-field">
      <label htmlFor={`employee-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {isDate ? <DateField id={`employee-${key}`} required={required} disabled={busy} value={values[key]} error={errors[key]}
        onChange={value => change(key, value)} onDraftChange={display => setDateDrafts(current => ({ ...current, [key]: display !== formatDateInput(initial[key]) }))} /> :
        <ValidatedInput id={`employee-${key}`} name={key} required={required} maxLength={200} value={values[key]} onChange={event => change(key, event.target.value)}
          aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} />}
      {!isDate && errors[key] && <span className="field-error" id={`error-${key}`}>{errors[key]}</span>}
    </div>
  }
  return <Modal title={employee ? 'Редагувати персональні відомості' : 'Додати працівника'} description="Поля зі знаком * обов’язкові. Решту можна заповнити пізніше." size="large" className="employee-form-modal" headerIcon={<UserRound size={21} aria-hidden="true"/>} busy={busy} onClose={close}>
    {error && <Alert variant="error">{error}</Alert>}
    <form ref={form} noValidate onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <fieldset className="recipient-fieldset" disabled={busy}>
        <legend>Персональні відомості</legend>
        <div className="recipient-form-grid">
          {textField('lastName', 'Прізвище', true)}{textField('firstName', 'Ім’я', true)}{textField('middleName', 'По батькові')}
          {textField('birthDate', 'Дата народження')}
          <div className="recipient-field employee-field employee-field-wide"><span>Тип працівника *</span>
            <Select label="Тип працівника" required disabled={busy} value={values.employeeType} error={errors.employeeType}
              options={Object.entries(employeeTypeLabels).map(([value, label]) => ({ value, label }))} onChange={value => change('employeeType', value as FormValues['employeeType'])} />
          </div>
          <div className="recipient-field employee-field employee-field-full"><label htmlFor="employee-note">Примітка <span className="employee-hint">до 4000 символів</span></label>
            <ValidatedTextarea id="employee-note" rows={4} maxLength={4000} value={values.note} onChange={event => change('note', event.target.value)}
              aria-invalid={!!errors.note} aria-describedby={errors.note ? 'error-note' : undefined} />
            {errors.note && <span className="field-error" id="error-note">{errors.note}</span>}
          </div>
        </div>
      </fieldset>
      {employee ? <fieldset className="recipient-fieldset">
        <legend>Кадрові відомості</legend>
        <p className="employee-muted">Ця форма змінює лише персональні відомості. Для зміни призначення скористайтеся історією посад у картці.</p>
        <dl className="employee-facts"><div><dt>Дата прийняття</dt><dd>{displayDate(employee.hireDate)}</dd></div>
          <div><dt>Посада</dt><dd>{employee.currentAssignment.position.name}</dd></div>
          <div><dt>Підрозділ</dt><dd>{employee.currentAssignment.department.name}</dd></div>
          <div><dt>Категорія</dt><dd>{employee.currentAssignment.category ?? 'Не зазначено'}</dd></div></dl>
      </fieldset> : <fieldset className="recipient-fieldset" disabled={busy}>
        <legend>Початкове призначення</legend>
        <div className="recipient-form-grid">
          {textField('startDate', 'Дата прийняття', true)}{textField('category', 'Категорія посади')}
          <DirectoryFields departmentId={values.departmentId} positionId={values.positionId} errors={errors} disabled={busy} inFlight={inFlight} navigationGuard={navigationGuard} onState={setDirectory}
            onDepartment={id => change('departmentId', id)} onPosition={id => change('positionId', id)} />
        </div>
      </fieldset>}
      <div className="recipient-form-actions"><span>Зміни зберігаються лише після підтвердження.</span><div>
        <button type="button" className="secondary-button" disabled={busy} onClick={close}><X size={17} aria-hidden="true"/>Скасувати</button>
        <button type="submit" className="primary-button" disabled={busy || (!employee && (directory.loading || !!directory.error || directory.draft))} aria-busy={saving}><Check size={17} aria-hidden="true"/>{saving ? 'Збереження…' : employee ? 'Зберегти зміни' : 'Створити працівника'}</button>
      </div></div>
    </form>
  </Modal>
}
