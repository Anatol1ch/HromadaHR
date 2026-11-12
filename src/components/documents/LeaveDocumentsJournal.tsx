import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { LeaveRecord } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import Modal from '../Modal'
import Select from '../Select'
import { notifySystemToast } from '../SystemToastHost'
import LeaveJournal from '../leave/LeaveJournal'
import LeaveRegistrationForm from '../leave/LeaveRegistrationForm'
import type { LeaveJournalContext, RegistrationHistory } from '../leave/registry'

/** Global leave journal; LeaveRecord is not a separate personnel document. */
export default function LeaveDocumentsJournal({ navigationGuard, active }: { navigationGuard: RefObject<NavigationGuard>; active:boolean }) {
  const [revision, setRevision] = useState(0)
  const [employeeRevision, setEmployeeRevision] = useState(0)
  const [records, setRecords] = useState<{ revision: number; data?: LeaveRecord[]; error?: string }>()
  const [employees, setEmployees] = useState<{ revision: number; data?: EmployeeCard[]; error?: string }>()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState('')
  const [context, setContext] = useState<LeaveJournalContext | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{if(!active){setCreating(false);setContext(null)}},[active])
  const refresh = () => setRevision(value => value + 1)
  const reloadEmployees = () => setEmployeeRevision(value => value + 1)

  useEffect(() => {
    let active = true
    void window.hromadaHR.leave.listRecords(null).then(result => {
      if (active) setRecords(result.ok ? { revision, data: result.data } : { revision, error: personnelMessage(result.error.code) })
    }).catch(() => { if (active) setRecords({ revision, error: 'Не вдалося завантажити журнал відпусток.' }) })
    return () => { active = false }
  }, [revision])
  useEffect(() => {
    let active = true
    void window.hromadaHR.personnel.listEmployees().then(result => {
      if (active) setEmployees(result.ok ? { revision: employeeRevision, data: result.data }
        : { revision: employeeRevision, error: personnelMessage(result.error.code) })
    }).catch(() => { if (active) setEmployees({ revision: employeeRevision, error: 'Не вдалося завантажити працівників.' }) })
    return () => { active = false }
  }, [employeeRevision])

  const currentRecords = records?.revision === revision ? records : undefined
  const currentEmployees = employees?.revision === employeeRevision ? employees : undefined
  const people = currentEmployees?.data ?? []
  const person = people.find(employee => employee.id === selected)
  const history: RegistrationHistory = {
    records: currentRecords?.data ?? [], loading: !currentRecords || !currentEmployees,
    error: currentRecords?.error ?? currentEmployees?.error ?? '',
    retry: () => { refresh(); if (currentEmployees?.error) reloadEmployees() },
    open: next => { setContext(next); refresh() }, suspended: !active || context !== null,
  }
  function register() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    navigationGuard.current(() => {
      setSelected('')
      setContext(null)
      reloadEmployees()
      setCreating(true)
    })
  }
  function closeRegistration() {
    setCreating(false)
    setContext(null)
    refresh()
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
      else heading.current?.focus()
    })
  }

  return <div ref={heading} tabIndex={-1} className="leave-workspace">
    {history.error && <Alert variant="error" action={<button type="button" onClick={history.retry}>Повторити</button>}>{history.error}</Alert>}
    {history.loading && <DataState kind="loading" compact message="Завантаження журналу…"/>}
    <LeaveJournal active={active} records={history.records} employeeRows={people} navigationGuard={navigationGuard} history={history} context={context}
      onChanged={refresh} onRegister={register} onResume={() => setContext(null)}/>
    {active && creating && (!currentEmployees?.data ? <Modal title="Зареєструвати відпустку" onClose={closeRegistration} returnFocus={opener.current}>
      {currentEmployees?.error ? <Alert variant="error" action={<button type="button" onClick={reloadEmployees}>Повторити</button>}>{currentEmployees.error}</Alert>
        : <DataState kind="loading" message="Завантаження актуального переліку працівників…"/>}
    </Modal> : <LeaveRegistrationForm key={selected || 'new'} employeeId={person?.id ?? ''} employeeName={person ? fullName(person) : undefined}
      hireDate={person?.hireDate ?? '0001-01-01'} initialType="annual_main" navigationGuard={navigationGuard} history={history} returnFocus={opener.current}
      employeePicker={<div className="recipient-field"><span>Працівник</span><Select label="Працівник для нової відпустки" required searchable
        value={selected} options={people.map(employee => ({ value: employee.id, label: fullName(employee) }))} advanceOnSelect={false}
        onChange={id => { if (id !== selected) navigationGuard.current(() => setSelected(id)) }}/>
        {!people.length && <p>Додайте працівника до кадрового реєстру.</p>}
      </div>}
      onClose={closeRegistration} onSaved={() => {
        closeRegistration()
        notifySystemToast('success', 'Відпустку зареєстровано', 'Журнал оновлено.')
      }}/>)}
  </div>
}
