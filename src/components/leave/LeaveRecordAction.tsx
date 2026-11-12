import { FileText, List } from 'lucide-react'
import DictionaryTable from '../DictionaryTable'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import LeaveStatus from './LeaveStatus'
import LeaveTypeIcon from './LeaveTypeIcon'
import { formatLeaveDays } from './summary'
import HelpTip from './HelpTip'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LeaveRecord, PeriodBalance } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { fullName, personnelMessage } from '../../employees/model'
import { formatDate, formatDateTime } from '../../lib/dates'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DataState from '../DataState'
import Modal from '../Modal'
import { ValidatedTextarea } from '../ValidatedInput'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import { leaveLabels } from './presentation'
import { leaveRecordBelongsToEmployee, type RegistrationHistory } from './registry'

export default function LeaveRecordAction({ id, kind, navigationGuard, onClose, onChanged, history, expectedEmployeeId }: {
  expectedEmployeeId?: string; id: string; kind: 'view' | 'edit' | 'cancel'; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onChanged: () => void; history: RegistrationHistory
}) {
  const [data, setData] = useState<{ record: LeaveRecord; employee: EmployeeCard; balances: PeriodBalance[] }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  function reload() {
    setData(undefined)
    setError('')
    setRetry(value => value + 1)
  }
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const record = await window.hromadaHR.leave.getRecord(id)
        if (!active) return
        if (!record.ok) { setError(personnelMessage(record.error.code)); return }
        if (!leaveRecordBelongsToEmployee(record.data, expectedEmployeeId)) { setError('Відпустка не належить цьому працівнику. Оновіть історію.'); return }
        const [employee, balances] = await Promise.all([
          window.hromadaHR.personnel.getEmployee(record.data.employeeId), window.hromadaHR.leave.getBalances(record.data.employeeId),
        ])
        if (!active) return
        if (!employee.ok) { setError(personnelMessage(employee.error.code)); return }
        if (!balances.ok) { setError(personnelMessage(balances.error.code)); return }
        setData({ record: record.data, employee: employee.data, balances: balances.data })
      } catch { if (active) setError('Не вдалося завантажити актуальну відпустку.') }
    }
    void load()
    return () => { active = false }
  }, [id, retry, expectedEmployeeId])
  function refreshAndClose() {
    onChanged()
    onClose()
  }
  function changed() {
    refreshAndClose()
    notifySystemToast('success', kind === 'edit' ? 'Відпустку виправлено' : 'Реєстрацію скасовано', data?.record.allocations.length ? (kind === 'edit' ? 'Залишки перераховано.' : 'Списані дні знову доступні.') : 'Журнал оновлено.')
  }
  if (!data || error) return <Modal title="Зареєстрована відпустка" onClose={onClose} returnFocus={opener.current}>
    {error ? <Alert variant="error" action={<button type="button" onClick={reload}>Повторити</button>}>{error}</Alert> :
      <DataState kind="loading" message="Завантаження актуальних відомостей…" />}
  </Modal>
  if (kind === 'view') {
    const { record, employee, balances } = data
    return <Modal title="Перегляд відпустки" onClose={onClose} size="wide" className="leave-editor-modal leave-design-dialog" returnFocus={opener.current}
      footer={<div className="leave-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Закрити</button></div>}>
      <div className="leave-record-card">
        <InfoSection title={leaveLabels[record.leaveType]} icon={<LeaveTypeIcon type={record.leaveType}/>} action={<LeaveStatus status={record.status}/>}>
          <dl className="info-grid">
            <InfoItem label="Працівник" value={fullName(employee)}/>
            <InfoItem label="Підрозділ" value={employee.department.name}/>
            <InfoItem label="Посада" value={employee.position.name}/>
            <InfoItem label="Початок" value={formatDate(record.startDate)}/>
            <InfoItem label="Завершення" value={formatDate(record.endDate)}/>
            <InfoItem label="Днів" value={formatLeaveDays(record.usedDays)} emphasis/>
            {record.durationExplanation && <InfoItem label="Уточнення тривалості" value={record.durationExplanation} wide/>}
          </dl>
        </InfoSection>
        {record.status === 'cancelled' && <Alert variant="warning" className="leave-cancelled-notice">
          <strong>Скасовано{record.cancelledAt ? ' ' + formatDateTime(record.cancelledAt) : ''}.</strong>{' '}
          {record.cancelReason ? 'Причина – ' + record.cancelReason : 'Причину не внесено у старому записі.'}
        </Alert>}
        {(record.orderNumber || record.orderDate || record.grantBasis) && <InfoSection title="Документальні відомості" icon={<FileText size={17}/>}>
          <dl className="info-grid info-grid-two">
            {record.orderNumber && <InfoItem label="Номер розпорядження" value={record.orderNumber}/>}
            {record.orderDate && <InfoItem label="Дата розпорядження" value={formatDate(record.orderDate)}/>}
            {record.grantBasis && <InfoItem label="Підстава надання" value={record.grantBasis} wide/>}
          </dl>
        </InfoSection>}
        {record.allocations.length > 0 && <InfoSection title="Розподіл днів" icon={<List size={17}/>}>
          <DictionaryTable label="Розподіл днів відпустки" className="leave-table" columns={[{label:'Період'},{label:'Днів',width:'6rem',className:'leave-days-column'}]}>
            {record.allocations.map(allocation => {
              const period = balances.find(item => item.id === allocation.periodId)
              return <tr key={allocation.periodId}>
                <td>{period ? formatDate(period.periodStart) + '–' + formatDate(period.periodEnd) : 'Відомості про період недоступні'}</td>
                <td className="leave-days-column">{allocation.days}</td>
              </tr>
            })}
          </DictionaryTable>
        </InfoSection>}
      </div>
    </Modal>
  }
  if (data.record.status === 'cancelled') return <Modal title="Реєстрацію вже скасовано" onClose={refreshAndClose}>
    <p>{data.record.cancelReason ?? 'Причину не зазначено у старому записі.'}</p>
    <p>{formatDateTime(data.record.cancelledAt)}</p>
    <button type="button" className="secondary-button" onClick={() => { onChanged(); onClose() }}>Закрити та оновити журнал</button>
  </Modal>
  return kind === 'edit' ? <LeaveRegistrationForm employeeId={data.employee.id} employeeName={fullName(data.employee)}
    hireDate={data.employee.hireDate} initialType={data.record.leaveType} record={data.record} navigationGuard={navigationGuard}
    onClose={refreshAndClose} onSaved={changed} onReloadRecord={reload} returnFocus={opener.current} history={history} /> :
    <CancelRegistration record={data.record} employeeName={fullName(data.employee)} navigationGuard={navigationGuard} onClose={refreshAndClose} onChanged={changed} />
}

function CancelRegistration({ record, employeeName, navigationGuard, onClose, onChanged }: {
  record: LeaveRecord; employeeName: string; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onChanged: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [stale, setStale] = useState(false)
  const pending = useRef(false)
  const alive = useRef(false)
  const owner = useRef<HTMLDivElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const close = useUnsavedChanges(!!reason.trim(), pending, navigationGuard, owner)
  async function verify() {
    if (alive.current) setUncertain(true)
    try {
      const actual = await window.hromadaHR.leave.getRecord(record.id)
      if (!alive.current) return
      if (!actual.ok) { setError('Не вдалося перевірити результат. Повторіть перевірку фактичного запису.'); return }
      if (actual.data.status === 'cancelled') { onChanged(); return }
      setUncertain(false)
      setStale(actual.data.revision !== record.revision)
      setError(actual.data.revision === record.revision ? 'Скасування не підтверджено. Збережений запис не змінився. Можна повторити операцію.' :
        'Запис уже змінився. Закрийте діалог і відкрийте актуальні відомості.')
    } catch { if (alive.current) setError('Перевірка фактичного запису недоступна. Повторіть перевірку.') }
  }
  async function execute(checkOnly = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (checkOnly) { await verify(); return }
      const result = await window.hromadaHR.leave.cancelLeave(record.id, record.revision, reason.trim())
      if (!alive.current) return
      if (result.ok) onChanged()
      else if (['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code)) await verify()
      else {
        setError(personnelMessage(result.error.code))
        if (result.error.code === 'STALE_REVISION') setStale(true)
      }
    } catch { await verify() }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  return <ConfirmDialog title="Скасувати реєстрацію відпустки?" confirmLabel="Скасувати реєстрацію"
    message={<div ref={owner} className="leave-layout">
      <p><strong>{employeeName}</strong> <HelpTip label="Що означає скасування" text="Реєстрація залишається в журналі. Списані за нею дні знову доступні. Скасування запису не скасовує виданий кадровий документ." /></p>
      <p>{leaveLabels[record.leaveType]} · {formatDate(record.startDate)}–{formatDate(record.endDate)} · {record.usedDays} днів</p>
      {(record.orderNumber || record.orderDate) && <Alert variant="warning">Скасування реєстрації в HromadaHR саме собою не скасовує виданий кадровий документ.</Alert>}
      <label className="recipient-field">Причина скасування<ValidatedTextarea required maxLength={1000} value={reason} disabled={busy || uncertain}
        onChange={event => setReason(event.target.value)} /></label>
      {uncertain && <button type="button" className="secondary-button" disabled={busy} onClick={() => void execute(true)}>Перевірити фактичний результат</button>}
    </div>}
    confirmDisabled={!reason.trim() || busy || uncertain || stale} error={error}
    onCancel={() => close(onClose)} onConfirm={() => execute()} />
}
