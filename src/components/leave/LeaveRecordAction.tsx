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

export default function LeaveRecordAction({ id, kind, navigationGuard, onClose, onChanged, onBalances }: {
  id: string; kind: 'view' | 'edit' | 'cancel'; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onChanged: () => void; onBalances?: (employeeId: string) => void
}) {
  const [data, setData] = useState<{ record: LeaveRecord; employee: EmployeeCard; balances: PeriodBalance[] }>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const record = await window.hromadaHR.leave.getRecord(id)
        if (!active) return
        if (!record.ok) { setError(personnelMessage(record.error.code)); return }
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
  }, [id, retry])
  function refreshAndClose() {
    onChanged()
    onClose()
  }
  function changed() {
    refreshAndClose()
    notifySystemToast('success', kind === 'edit' ? 'Відпустку виправлено' : 'Реєстрацію скасовано', data?.record.allocations.length ? (kind === 'edit' ? 'Залишки перераховано.' : 'Списані дні знову доступні.') : 'Журнал оновлено.')
  }
  if (!data || error) return <Modal title="Зареєстрована відпустка" onClose={onClose}>
    {error ? <Alert variant="error" action={<button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Повторити</button>}>{error}</Alert> :
      <DataState kind="loading" message="Завантаження актуальних відомостей…" />}
  </Modal>
  if (kind === 'view') return <Modal title="Відомості про відпустку" description={fullName(data.employee)} onClose={onClose} size="wide" className="leave-editor-modal"><div className="leave-layout">
    <h3>{leaveLabels[data.record.leaveType]}</h3><p>{formatDate(data.record.startDate)}–{formatDate(data.record.endDate)} · {data.record.usedDays} днів · {data.record.status === 'active' ? 'Зареєстровано' : 'Скасовано'}</p>
    <p>Поточні відомості: {data.employee.position.name} · {data.employee.department.name}</p><p>Розпорядження: {data.record.orderNumber ?? 'Не зазначено'} · {formatDate(data.record.orderDate)}</p>
    <p>Підстава: {data.record.grantBasis ?? 'Не зазначено'}</p><p>Пояснення тривалості: {data.record.durationExplanation ?? 'Не зазначено'}</p>
    {data.record.status === 'cancelled' && <p>Причина скасування: {data.record.cancelReason ?? 'Не зазначено'} · {formatDateTime(data.record.cancelledAt)}</p>}
    {data.record.allocations.length > 0 && <ul>{data.record.allocations.map(a=>{const p=data.balances.find(p=>p.id===a.periodId);return <li key={a.periodId}>{p?formatDate(p.periodStart)+'–'+formatDate(p.periodEnd):'Період недоступний'}: {a.days} днів</li>})}</ul>}
    <button type="button" className="secondary-button" onClick={onClose}>Закрити</button></div></Modal>
  if (data.record.status === 'cancelled') return <Modal title="Реєстрацію вже скасовано" onClose={refreshAndClose}>
    <p>{data.record.cancelReason ?? 'Причину не зазначено у старому записі.'}</p>
    <p>{formatDateTime(data.record.cancelledAt)}</p>
    <button type="button" className="secondary-button" onClick={() => { onChanged(); onClose() }}>Закрити та оновити журнал</button>
  </Modal>
  return kind === 'edit' ? <LeaveRegistrationForm employeeId={data.employee.id} employeeName={fullName(data.employee)}
    hireDate={data.employee.hireDate} initialType={data.record.leaveType} record={data.record} originalBalances={data.balances} navigationGuard={navigationGuard}
    onClose={refreshAndClose} onSaved={changed} onBalances={() => { refreshAndClose(); onBalances?.(data.employee.id) }} /> :
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
