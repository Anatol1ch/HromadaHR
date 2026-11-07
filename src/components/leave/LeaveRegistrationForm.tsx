import { useEffect, useRef, useState, type RefObject, type FormEvent } from 'react'
import type { AllocationProposal, LeaveRegistration, LeaveType } from '../../../shared/leave'
import { calendarDays } from '../../../shared/leave-calculations'
import { formatDate, parseDateInput } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DateField from '../DateField'
import DictionaryTable from '../DictionaryTable'
import Modal from '../Modal'
import Select from '../Select'
import ValidatedInput, { ValidatedTextarea } from '../ValidatedInput'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { leaveLabels, leaveOptions } from './presentation'

export default function LeaveRegistrationForm({ employeeId, employeeName, hireDate, initialType, navigationGuard, onClose, onSaved, onBalances }: {
  employeeId: string; employeeName?: string; hireDate: string; initialType: LeaveType; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onSaved: () => void; onBalances: (type: LeaveType) => void
}) {
  const [type, setType] = useState(initialType)
  const [dates, setDates] = useState({ start: '', end: '', startIso: '', endIso: '', order: '', orderIso: '' })
  const [override, setOverride] = useState({ range: '', text: '' })
  const [explanation, setExplanation] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [proposal, setProposal] = useState<{ key: string; value?: AllocationProposal; error?: string }>()
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<LeaveRegistration | null>(null)
  const [retry, setRetry] = useState(0)
  const owner = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const alive = useRef(false)
  const operation = useRef<{ payload: string; id: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const start = parseDateInput(dates.start)
  const end = parseDateInput(dates.end)
  const range = JSON.stringify([start, end])
  const length = start && end && end >= start ? calendarDays(start, end) : 0
  const daysText = override.range === range ? override.text : length > 0 ? String(length) : ''
  const days = /^\d+$/.test(daysText) && Number.isSafeInteger(Number(daysText)) ? Number(daysText) : 0
  const key = JSON.stringify([type, days, retry])
  const current = proposal?.key === key ? proposal : undefined
  const dirty = !!(dates.start || dates.end || dates.order || orderNumber || explanation || override.text || type !== initialType)
  const close = useUnsavedChanges(dirty, pending, navigationGuard, owner)

  useEffect(() => {
    let active = true
    if (days <= 0 || days > 3652059) return
    void window.hromadaHR.leave.proposeAllocation(employeeId, type, days).then(result => {
      if (!active) return
      if (!result.ok) { setProposal({ key, error: personnelMessage(result.error.code) }); return }
      setProposal({ key, value: result.data })
      setAllocations(Object.fromEntries(result.data.allocations.map(item => [item.periodId, String(item.days)])))
    }).catch(() => { if (active) setProposal({ key, error: 'Не вдалося отримати доступні дні.' }) })
    return () => { active = false }
  }, [employeeId, type, days, key])

  const available = current?.value?.balances.filter(period => period.availableDays > 0) ?? []
  const values = available.map(period => ({ periodId: period.id, days: Number(allocations[period.id] || '0') }))
  const allocationValid = available.every(period => {
    const text = allocations[period.id] || '0'
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) <= period.availableDays
  })
  const total = values.reduce((sum, item) => sum + item.days, 0)
  const canSave = !!start && start >= '2027-01-01' && start >= hireDate && !!end && length > 0 && days > 0 && days <= length &&
    (days === length || !!explanation.trim()) && !!current?.value && current.value.shortfall === 0 &&
    allocationValid && total === days && (!dates.order || !!parseDateInput(dates.order))

  function prepare(event: FormEvent) {
    event.preventDefault()
    if (!canSave || pending.current) return
    const payload = { employeeId, leaveType: type, startDate: start!, endDate: end!, usedDays: days,
      durationExplanation: explanation.trim() || null, orderNumber: orderNumber.trim() || null,
      orderDate: dates.order ? parseDateInput(dates.order) : null,
      allocations: values.filter(item => item.days > 0) }
    const json = JSON.stringify(payload)
    if (operation.current?.payload !== json) operation.current = { payload: json, id: crypto.randomUUID() }
    setConfirm({ ...payload, requestId: operation.current!.id })
  }
  async function save(input: LeaveRegistration) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await window.hromadaHR.leave.registerLeave(input)
      if (!alive.current) return
      if (result.ok) onSaved()
      else { setError(personnelMessage(result.error.code)); setConfirm(null) }
    } catch {
      if (alive.current) { setError('Результат не підтверджено. Повторіть збереження тих самих даних для безпечної перевірки.'); setConfirm(null) }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }

  return <Modal title="Зареєструвати відпустку" description={employeeName} size="wide" className="leave-editor-modal" busy={busy} onClose={() => close(onClose)}>
    <form ref={owner} className="leave-layout leave-registration" onSubmit={prepare}>
      <Alert variant="info">Звичайна реєстрація доступна для початку від 01.01.2027. Відпустка, що почалася у 2026 році, потребує окремої перевірки початкових залишків.</Alert>
      <div className="recipient-field"><span>Вид відпустки</span><Select label="Вид відпустки" value={type} options={leaveOptions} disabled={busy}
        onChange={value => setType(value as LeaveType)} advanceOnSelect={false} /></div>
      {start && start < hireDate && <Alert variant="warning">Відпустка не може починатися раніше дати прийняття.</Alert>}
      <div className="leave-registration-grid">
        <label className="recipient-field">Початок<DateField required disabled={busy} value={dates.startIso}
          onChange={startIso => setDates(current => ({ ...current, startIso }))} onDraftChange={start => setDates(current => ({ ...current, start }))} /></label>
        <label className="recipient-field">Завершення<DateField required disabled={busy} value={dates.endIso}
          onChange={endIso => setDates(current => ({ ...current, endIso }))} onDraftChange={end => setDates(current => ({ ...current, end }))} /></label>
        <label className="recipient-field">Використані дні<ValidatedInput inputMode="numeric" required disabled={busy} value={daysText}
          onChange={event => setOverride({ range, text: event.target.value })} /></label>
      </div>
      <p className="leave-muted">Календарна тривалість включно з обома датами — {length || '—'} днів.</p>
      {length > 0 && (days < 1 || days > length) && <Alert variant="warning">Введіть додатну цілу тривалість у межах календарного інтервалу.</Alert>}
      {days > 0 && days !== length && <label className="recipient-field">Пояснення уточненої тривалості<ValidatedTextarea required maxLength={1000} disabled={busy}
        value={explanation} onChange={event => setExplanation(event.target.value)} /></label>}
      {current?.error && <Alert variant="error" action={<button type="button" onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{current.error}</Alert>}
      {days > 0 && days <= length && days <= 3652059 && !current && <p role="status">Отримання доступних днів…</p>}
      {current?.value && <>
        {current.value.shortfall > 0 && <Alert variant="warning" action={<button type="button" onClick={() => close(() => onBalances(type))}>Внести або виправити права</button>}>
          Бракує {current.value.shortfall} підтверджених днів. Внесіть або виправте облікові періоди перед реєстрацією.
        </Alert>}
        <DictionaryTable label="Розподіл використаних днів" className="leave-table" columns={[{ label: 'Обліковий період' }, { label: 'Доступно', width: '6rem' }, { label: 'Списати', width: '7rem' }]}
          empty={available.length ? undefined : 'Немає підтверджених доступних днів.'}>
          {available.map(period => <tr key={period.id}><td>{formatDate(period.periodStart)}–{formatDate(period.periodEnd)}</td><td>{period.availableDays}</td>
            <td><div className="recipient-field leave-days-field"><ValidatedInput aria-label={'Списати за період ' + formatDate(period.periodStart)} inputMode="numeric" disabled={busy}
              value={allocations[period.id] ?? '0'} onChange={event => setAllocations(current => ({ ...current, [period.id]: event.target.value }))} /></div></td></tr>)}
        </DictionaryTable>
        <div className="leave-toolbar"><span aria-live="polite">Розподілено {allocationValid ? total : '—'} із {days} днів</span>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setRetry(value => value + 1)}>Автоматично розподілити</button></div>
      </>}
      <details><summary>Реквізити розпорядження</summary><div className="leave-registration-grid">
        <label className="recipient-field">Номер<ValidatedInput maxLength={100} disabled={busy} value={orderNumber} onChange={event => setOrderNumber(event.target.value)} /></label>
        <label className="recipient-field">Дата<DateField disabled={busy} value={dates.orderIso}
          onChange={orderIso => setDates(current => ({ ...current, orderIso }))} onDraftChange={order => setDates(current => ({ ...current, order }))} /></label>
      </div></details>
      <div className="leave-editor-footer">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="recipient-form-actions leave-editor-actions"><span>Розподіл і тривалість підтверджує кадровик.</span><div>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => close(onClose)}>Скасувати</button>
          <button type="submit" className="primary-button" disabled={!canSave || busy}>Зберегти</button>
        </div></div>
      </div>
    </form>
    {confirm && <ConfirmDialog title="Підтвердити реєстрацію?" variant="primary" confirmLabel="Зареєструвати"
      message={`${leaveLabels[confirm.leaveType]}, ${formatDate(confirm.startDate)}–${formatDate(confirm.endDate)}. Підтверджую надання на ${confirm.usedDays} днів і зазначений розподіл між обліковими періодами.`}
      onCancel={() => setConfirm(null)} onConfirm={() => save(confirm)} />}
  </Modal>
}
