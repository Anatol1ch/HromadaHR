import Modal from '../Modal'
import { BriefcaseBusiness, Check, UserRound, X } from 'lucide-react'
import type { NavigationGuard } from './useUnsavedChanges'
import DateField from '../DateField'
import ValidatedInput from '../ValidatedInput'
import Select from '../Select'
import { formatDateInput, todayIsoDate } from '../../lib/dates'
import { focusFirstInvalid } from '../../lib/keyboardNavigation'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { positionCategories } from '../../../shared/personnel'
import type { EmployeeCard } from '../../../shared/personnel'
import Alert from '../Alert'
import InfoSection from '../InfoSection'
import DirectoryFields, { initialDirectoryState } from './DirectoryFields'
import useUnsavedChanges from './useUnsavedChanges'
import { employeeInput, employeeTypeLabels, emptyValues,
  changeAppointment, personnelMessage, validateEmployee, valuesForEmployee } from '../../employees/model'
import type { FormErrors, FormValues } from '../../employees/model'

type Props = {
  employee?: EmployeeCard
  navigationGuard: RefObject<NavigationGuard>
  onCancel: () => void
  onSaved: (employee: EmployeeCard) => void
}
export default function EmployeeForm({ employee, navigationGuard, onCancel, onSaved }: Props) {
  const formId = useId()
  const [initial] = useState(() => employee ? valuesForEmployee(employee) : { ...emptyValues })
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [directory, setDirectory] = useState(initialDirectoryState)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const form = useRef<HTMLFormElement>(null)
  const [appointmentRevision,setAppointmentRevision]=useState(0)
  const [appointmentReviewed,setAppointmentReviewed]=useState(false)
  const [categoryCleared,setCategoryCleared]=useState(false)
  const contextChanged=!!employee&&(values.positionId!==initial.positionId||values.departmentId!==initial.departmentId)
  const [dateDrafts, setDateDrafts] = useState<Record<string, boolean>>({})
  const dirty = Object.values(dateDrafts).some(Boolean) || JSON.stringify(values) !== JSON.stringify(initial)
  const busy = saving || directory.pending

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const requestClose = useUnsavedChanges(dirty, inFlight, navigationGuard, form)
  const close = () => requestClose(onCancel)

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value, ...(key==='employeeType'&&value==='staff'?{positionCategory:'' as const}:{}) }))
    if(key==='employeeType'&&value==='staff'&&values.positionCategory)setCategoryCleared(true)
    setErrors(current => ({ ...current, [key]: undefined }))
  }
  function changeDirectory(key:'positionId'|'departmentId',value:string) {
    if(values[key]===value)return
    setValues(current=>changeAppointment(current,key,value));setAppointmentRevision(v=>v+1);setAppointmentReviewed(false)
    setDateDrafts(current=>({...current,positionStartedOn:false}));setErrors(current=>({...current,positionStartedOn:undefined,positionCategory:undefined}))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || directory.loading || directory.error) return
    if (directory.draft) { setError('Завершіть або скасуйте додавання запису довідника.'); return }
    if(contextChanged&&(values.positionStartedOn||values.positionCategory)&&!appointmentReviewed){setError('Підтвердьте перевірку відомостей поточного призначення або залиште їх невідомими.');return}
    const nextErrors = validateEmployee(values)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors); setError('Перевірте позначені поля.')
      requestAnimationFrame(() => { if (form.current) focusFirstInvalid(form.current) })
      return
    }
    if (!form.current?.checkValidity()) { form.current?.reportValidity(); if (form.current) focusFirstInvalid(form.current); return }
    inFlight.current = true; setSaving(true); setError('')
    try {
      const result = employee ? await window.hromadaHR.personnel.updateEmployee(employee.id, employeeInput(values), appointmentReviewed) :
        await window.hromadaHR.personnel.createEmployee(employeeInput(values))
      if (!alive.current) return
      if (!result.ok) {
        const message = result.error.code === 'UNAVAILABLE' ? 'Результат збереження не підтверджено. Перед повторною спробою перевірте запис у реєстрі.' : personnelMessage(result.error.code)
        setError(message)
        if (result.error.code === 'HIRE_DATE_HAS_LEAVE_PERIODS') {
          requestAnimationFrame(() => { if (form.current) focusFirstInvalid(form.current, '#employee-hireDate') })
        }
        return
      }
      // The saved response is authoritative. Leave directly without the discard guard.
      onSaved(result.data)
    } catch { if (alive.current) setError('Не вдалося підтвердити збереження. Введені дані залишилися у формі; перевірте реєстр перед повторною спробою.') }
    finally { inFlight.current = false; if (alive.current) setSaving(false) }
  }
  function textField(key: 'lastName' | 'firstName' | 'middleName' | 'birthDate' | 'hireDate' | 'positionStartedOn', label: string, required = false) {
    const isDate = key === 'birthDate' || key === 'hireDate' || key === 'positionStartedOn'
    return <div className="recipient-field employee-field">
      <label htmlFor={`employee-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {isDate ? <DateField key={key==='positionStartedOn'?appointmentRevision:key} max={key==='positionStartedOn'?todayIsoDate():undefined} id={`employee-${key}`} required={required} disabled={busy} value={values[key]} error={errors[key]}
        onChange={value => change(key, value)} onDraftChange={display => setDateDrafts(current => ({ ...current, [key]: display !== formatDateInput(initial[key]) }))} /> :
        <ValidatedInput id={`employee-${key}`} name={key} required={required} maxLength={200} value={values[key]} onChange={event => change(key, event.target.value)}
          aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} />}
      {!isDate && errors[key] && <span className="field-error" id={`error-${key}`}>{errors[key]}</span>}
    </div>
  }
  return <Modal title={employee ? 'Редагувати працівника' : 'Додати працівника'} size="large" className="employee-form-modal" headerIcon={<UserRound size={21} aria-hidden="true"/>} busy={busy} onClose={close}
    footer={<div className="employee-form-footer">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="employee-form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={close}><X size={17} aria-hidden="true"/>Скасувати</button>
        <button type="submit" form={formId} className="primary-button" disabled={busy || directory.loading || !!directory.error || directory.draft} aria-busy={saving}><Check size={17} aria-hidden="true"/>{saving ? 'Збереження…' : employee ? 'Зберегти зміни' : 'Створити працівника'}</button>
      </div>
    </div>}>
    <form id={formId} ref={form} className="employee-form" noValidate onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <InfoSection title="Персональні відомості" icon={<UserRound size={17}/>}>
        <fieldset className="recipient-fieldset" disabled={busy}>
          <div className="employee-form-grid employee-personal-grid">
            {textField('lastName', 'Прізвище', true)}{textField('firstName', 'Ім’я', true)}{textField('middleName', 'По батькові')}
            {textField('birthDate', 'Дата народження')}
            <div className="recipient-field employee-field"><span>Тип працівника *</span>
              <Select label="Тип працівника" required disabled={busy} value={values.employeeType} error={errors.employeeType}
                options={Object.entries(employeeTypeLabels).map(([value, label]) => ({ value, label }))} onChange={value => change('employeeType', value as FormValues['employeeType'])} />
            </div>
          </div>
        </fieldset>
      </InfoSection>
      <InfoSection title="Кадрові відомості" icon={<BriefcaseBusiness size={17}/>}>
        <fieldset className="recipient-fieldset" disabled={busy}>
          <div className="employee-form-grid">
            <DirectoryFields departmentId={values.departmentId} positionId={values.positionId} errors={errors} disabled={busy} inFlight={inFlight} navigationGuard={navigationGuard} onState={setDirectory}
              onDepartment={id => changeDirectory('departmentId', id)} onPosition={id => changeDirectory('positionId', id)} />
            {textField('hireDate', 'Дата прийняття', true)}
            {textField('positionStartedOn','Дата призначення на поточну посаду')}
            {values.employeeType==='official'&&<div className="recipient-field employee-field"><span>Категорія посади</span><Select label="Категорія посади" value={values.positionCategory} disabled={busy} error={errors.positionCategory} options={[{value:'',label:'Не зазначено'},...positionCategories.map(value=>({value,label:`${value} категорія`}))]} onChange={value=>change('positionCategory',value as FormValues['positionCategory'])}/></div>}

          </div>
        </fieldset>
        {contextChanged&&<Alert variant="warning">Посаду або підрозділ змінено. Попередні відомості призначення скинуто. Внесіть перевірені дату й категорію або залиште їх невідомими.</Alert>}
        {contextChanged&&<label className="employee-hint"><input type="checkbox" checked={appointmentReviewed} disabled={busy} onChange={event=>setAppointmentReviewed(event.target.checked)}/> Підтверджую перевірку відомостей поточного призначення</label>}
        {categoryCleared&&values.employeeType==='staff'&&<Alert variant="info">Категорію ОМС очищено при виборі іншого персоналу. Чинний ранг потрібно очистити окремо, якщо він є.</Alert>}
      </InfoSection>
    </form>
  </Modal>
}
