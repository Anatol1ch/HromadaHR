import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import type { Department, EmployeeCard, Position } from '../../../shared/personnel'
import Alert from '../Alert'
import DataState from '../DataState'
import { creationInput, dictionaryName, displayDate, employeeTypeLabels, emptyValues, personalDetails,
  personnelMessage, validateEmployee, valuesForEmployee } from '../../employees/model'
import type { FormErrors, FormValues } from '../../employees/model'

type Props = {
  employee?: EmployeeCard
  navigationGuard: RefObject<() => boolean>
  onCancel: () => void
  onSaved: (employee: EmployeeCard) => void
}
export default function EmployeeForm({ employee, navigationGuard, onCancel, onSaved }: Props) {
  const [initial] = useState(() => employee ? valuesForEmployee(employee) : { ...emptyValues })
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(!employee)
  const [directoryError, setDirectoryError] = useState('')
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState<{ kind: 'department' | 'position'; name: string } | null>(null)
  const [draftError, setDraftError] = useState('')
  const [adding, setAdding] = useState(false)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const form = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || !!draft?.name
  const busy = saving || adding

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    const canLeave = () => !inFlight.current && (!dirty || window.confirm('Є незбережені зміни. Вийти з форми без збереження?'))
    navigationGuard.current = canLeave
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!canLeave()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { navigationGuard.current = () => true; window.removeEventListener('beforeunload', beforeUnload) }
  }, [dirty, navigationGuard])

  useEffect(() => {
    if (employee) return
    let alive = true
    setLoading(true); setDirectoryError('')
    void Promise.all([window.hromadaHR.personnel.listDepartments(), window.hromadaHR.personnel.listPositions()])
      .then(([departmentResult, positionResult]) => {
        if (!alive) return
        if (!departmentResult.ok) setDirectoryError(personnelMessage(departmentResult.error.code))
        else if (!positionResult.ok) setDirectoryError(personnelMessage(positionResult.error.code))
        else { setDepartments(departmentResult.data); setPositions(positionResult.data) }
      }).catch(() => { if (alive) setDirectoryError('Не вдалося завантажити довідники. Повторіть спробу.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [employee, retry])

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || (!employee && (loading || directoryError))) return
    if (!employee && draft) { setError('Завершіть або скасуйте додавання запису довідника.'); return }
    const nextErrors = validateEmployee(values, !!employee)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors); setError('Перевірте позначені поля.')
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
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
  async function addDictionary() {
    if (!draft || inFlight.current) return
    const name = dictionaryName(draft.name)
    if (!name || name.length > 200) { setDraftError('Введіть назву від 1 до 200 символів.'); return }
    const kind = draft.kind
    inFlight.current = true; setAdding(true); setDraftError('')
    try {
      const api = window.hromadaHR.personnel
      const result = kind === 'department' ? await api.createDepartment({ name }) : await api.createPosition({ name })
      if (!alive.current) return
      if (!result.ok) {
        setDraftError(result.error.code === 'CONFLICT' ? 'Така назва вже існує. Скасуйте додавання та виберіть наявний запис у переліку або введіть іншу назву.' : personnelMessage(result.error.code))
        // Refresh on conflict as the conflicting entry may have been created since this form opened.
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
        setDepartments(current => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name, 'uk')))
        change('departmentId', result.data.id)
      } else {
        setPositions(current => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name, 'uk')))
        change('positionId', result.data.id)
      }
      setDraft(null)
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(kind === 'department' ? '#employee-departmentId' : '#employee-positionId')?.focus())
      setNotice(`${kind === 'department' ? 'Підрозділ' : 'Посаду'} «${result.data.name}» створено та вибрано. Запис залишиться у довіднику, навіть якщо скасувати створення працівника.`)
    } catch { if (alive.current) setDraftError('Не вдалося створити запис. Перевірте перелік перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setAdding(false) }
  }
  function textField(key: 'lastName' | 'firstName' | 'middleName' | 'birthDate' | 'startDate' | 'category', label: string, required = false) {
    const isDate = key === 'birthDate' || key === 'startDate'
    return <div className="employee-field">
      <label htmlFor={`employee-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={`employee-${key}`} name={key} type={isDate ? 'date' : 'text'} required={required}
        min={isDate ? '0001-01-01' : undefined} max={isDate ? '9999-12-31' : undefined} maxLength={isDate ? undefined : 200}
        value={values[key]} onChange={event => change(key, event.target.value)}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} />
      {errors[key] && <span className="field-error" id={`error-${key}`}>{errors[key]}</span>}
    </div>
  }
  function directoryField(kind: 'department' | 'position', label: string, entries: (Department | Position)[]) {
    const key = kind === 'department' ? 'departmentId' : 'positionId'
    return <div className="employee-field">
      <label htmlFor={`employee-${key}`}>{label} <span aria-hidden="true">*</span></label>
      <div className="employee-select-action">
        <select id={`employee-${key}`} required value={values[key]} onChange={event => change(key, event.target.value)}
          aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined}>
          <option value="">Виберіть {kind === 'department' ? 'підрозділ' : 'посаду'}</option>
          {entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <button type="button" className="secondary-button" aria-label={`Додати ${kind === 'department' ? 'підрозділ' : 'посаду'}`}
          disabled={!!draft} onClick={() => { setDraft({ kind, name: '' }); setDraftError('') }}>Додати</button>
      </div>
      {errors[key] && <span className="field-error" id={`error-${key}`}>{errors[key]}</span>}
    </div>
  }
  return <div className="employee-form-page">
    <div className="page-heading employee-heading"><div><div className="eyebrow">ПРАЦІВНИКИ</div>
      <h1 tabIndex={-1} data-page-title>{employee ? 'Редагування відомостей' : 'Новий працівник'}</h1>
      <p className="subtitle">Поля зі знаком * обов’язкові. Решту можна заповнити пізніше.</p>
    </div></div>
    {error && <Alert variant="error">{error}</Alert>}
    {notice && <Alert variant="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
    <form ref={form} noValidate onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <fieldset className="dashboard-panel employee-form-panel" disabled={busy}>
        <legend>Персональні відомості</legend>
        <div className="employee-form-grid">
          {textField('lastName', 'Прізвище', true)}{textField('firstName', 'Ім’я', true)}{textField('middleName', 'По батькові')}
          {textField('birthDate', 'Дата народження')}
          <div className="employee-field employee-field-wide"><label htmlFor="employee-type">Тип працівника *</label>
            <select id="employee-type" value={values.employeeType} required onChange={event => change('employeeType', event.target.value as FormValues['employeeType'])}
              aria-invalid={!!errors.employeeType} aria-describedby={errors.employeeType ? 'error-employeeType' : undefined}>
              <option value="official">{employeeTypeLabels.official}</option><option value="staff">{employeeTypeLabels.staff}</option>
            </select>{errors.employeeType && <span className="field-error" id="error-employeeType">{errors.employeeType}</span>}
          </div>
          <div className="employee-field employee-field-full"><label htmlFor="employee-note">Примітка <span className="employee-hint">до 4000 символів</span></label>
            <textarea id="employee-note" rows={4} maxLength={4000} value={values.note} onChange={event => change('note', event.target.value)}
              aria-invalid={!!errors.note} aria-describedby={errors.note ? 'error-note' : undefined} />
            {errors.note && <span className="field-error" id="error-note">{errors.note}</span>}
          </div>
        </div>
      </fieldset>
      {employee ? <section className="dashboard-panel employee-form-panel" aria-labelledby="fixed-assignment-title">
        <h2 id="fixed-assignment-title">Кадрові відомості</h2>
        <p className="employee-muted">Ця форма змінює лише персональні відомості. Зміни призначення будуть доступні пізніше.</p>
        <dl className="employee-facts"><div><dt>Дата прийняття</dt><dd>{displayDate(employee.hireDate)}</dd></div>
          <div><dt>Посада</dt><dd>{employee.currentAssignment.position.name}</dd></div>
          <div><dt>Підрозділ</dt><dd>{employee.currentAssignment.department.name}</dd></div>
          <div><dt>Категорія</dt><dd>{employee.currentAssignment.category ?? 'Не зазначено'}</dd></div></dl>
      </section> : <fieldset className="dashboard-panel employee-form-panel" disabled={busy || loading || !!directoryError}>
        <legend>Початкове призначення</legend>
        {loading ? <DataState kind="loading" compact message="Завантаження довідників…" /> : <>
          <div className="employee-form-grid">
            {textField('startDate', 'Дата прийняття', true)}
            {directoryField('department', 'Підрозділ', departments)}
            {directoryField('position', 'Посада', positions)}
            {textField('category', 'Категорія посади')}
          </div>
          <p className="employee-hint">Немає потрібної назви? Додайте її поруч із полем. Нові записи зберігаються одразу й залишаються у довіднику після скасування цієї форми.</p>
          {draft && <div className="employee-quick-add" role="group" aria-label="Новий запис довідника">
            <label htmlFor="dictionary-name">{draft.kind === 'department' ? 'Назва нового підрозділу' : 'Назва нової посади'}</label>
            <input id="dictionary-name" autoFocus value={draft.name} aria-invalid={!!draftError} aria-describedby={draftError ? 'dictionary-error' : undefined}
              onChange={event => { setDraft({ ...draft, name: event.target.value }); setDraftError('') }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addDictionary() } }} />
            {draftError && <span className="field-error" role="alert" id="dictionary-error">{draftError}</span>}
            <div className="employee-actions"><button type="button" className="primary-button" onClick={() => { void addDictionary() }}>{adding ? 'Створення…' : 'Створити та вибрати'}</button>
              <button type="button" className="secondary-button" onClick={() => {
                const key = draft.kind === 'department' ? 'departmentId' : 'positionId'
                setDraft(null)
                requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`#employee-${key}`)?.focus())
              }}>Скасувати додавання</button></div>
          </div>}
        </>}
      </fieldset>}
      {!employee && directoryError && <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити завантаження довідників</button>}>{directoryError}</Alert>}
      <div className="employee-actions employee-form-footer">
        <button type="submit" className="primary-button" disabled={busy || (!employee && (loading || !!directoryError || !!draft))} aria-busy={saving}>{saving ? 'Збереження…' : employee ? 'Зберегти зміни' : 'Створити працівника'}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Скасувати</button>
      </div>
    </form>
  </div>
}
