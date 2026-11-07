import { allocationMessage } from './summary'
import HelpTip from './HelpTip'
import { isPeriodLeave, specialLeaveLimit, type PeriodLeaveType } from '../../../shared/leave'
import type { LeaveRecord, LeaveUpdate, PeriodBalance } from '../../../shared/leave'
import { matchesUpdate } from './corrections'
import { useEffect, useRef, useState, type RefObject, type ReactNode, type FormEvent } from 'react'
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
import { leaveLabels, leaveGroupOptions, specialOptions, groupForType, selectedLeaveType, type LeaveGroup } from './presentation'

export default function LeaveRegistrationForm({ employeeId, employeeName, hireDate, initialType, navigationGuard, onClose, onSaved, onBalances, record, originalBalances, employeePicker }: {
  record?: LeaveRecord; originalBalances?: PeriodBalance[]; employeePicker?: ReactNode
  employeeId: string; employeeName?: string; hireDate: string; initialType: LeaveType; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onSaved: (type: LeaveType) => void; onBalances: (type: PeriodLeaveType) => void
}) {
  const [type, setType] = useState(record?.leaveType ?? initialType)
  const [group, setGroup] = useState<LeaveGroup>(groupForType(record?.leaveType ?? initialType))
  const [subtypeChosen, setSubtypeChosen] = useState(true)
  const [dates, setDates] = useState({
    start: formatDate(record?.startDate ?? '').replace('–',''), end: formatDate(record?.endDate ?? '').replace('–',''),
    startIso: record?.startDate ?? '', endIso: record?.endDate ?? '',
    order: record?.orderDate ? formatDate(record.orderDate) : '', orderIso: record?.orderDate ?? '',
  })
  const [override, setOverride] = useState({ range: record ? JSON.stringify([record.startDate, record.endDate]) : '', text: record ? String(record.usedDays) : '' })
  const [explanation, setExplanation] = useState(record?.durationExplanation ?? '')
  const [grantBasis, setGrantBasis] = useState(record?.grantBasis ?? '')
  const periodic = isPeriodLeave(type)
  const limit = specialLeaveLimit(type)
  const [orderNumber, setOrderNumber] = useState(record?.orderNumber ?? '')
  const [proposal, setProposal] = useState<{ key: string; value?: AllocationProposal; error?: string }>()
  const [allocations, setAllocations] = useState<Record<string, string>>(Object.fromEntries(record?.allocations.map(item => [item.periodId, String(item.days)]) ?? []))
  const [manualAllocation, setManualAllocation] = useState(!!record)
  const [attempted,setAttempted] = useState(false)
  const [stale, setStale] = useState(false)
  const [uncertain, setUncertain] = useState<LeaveUpdate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<LeaveRegistration | null>(null)
  const [retry, setRetry] = useState(0)
  const owner = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const alive = useRef(false)
  const firstProposal = useRef(true)
  const autoRequested = useRef(false)
  const operation = useRef<{ payload: string; id: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const start = parseDateInput(dates.start)
  const end = parseDateInput(dates.end)
  const range = JSON.stringify([start, end])
  const length = start && end && end >= start ? calendarDays(start, end) : 0
  const daysText = override.range === range ? override.text : length > 0 ? String(length) : ''
  const days = /^\d+$/.test(daysText) && Number.isSafeInteger(Number(daysText)) ? Number(daysText) : 0
  const needsExplanation = days !== length || (limit !== null && days < limit)
  const key = JSON.stringify([type, days, start, end, retry])
  const current = proposal?.key === key ? proposal : undefined
  const draftSnapshot = JSON.stringify([type, group, subtypeChosen, dates, override, explanation, orderNumber, grantBasis, allocations])
  const initialSnapshot = useRef(draftSnapshot)
  const dirty = draftSnapshot !== initialSnapshot.current
  const close = useUnsavedChanges(dirty, pending, navigationGuard, owner)

  useEffect(() => {
    let active = true
    if (!employeeId || !isPeriodLeave(type) || days <= 0 || days > 3652059 || !start || !end || end < start || start < '2027-01-01' || start < hireDate) return
    const request = record
      ? window.hromadaHR.leave.proposeEditAllocation(record.id, record.revision, type, days, start, end)
      : window.hromadaHR.leave.proposeAllocation(employeeId, type, days, start, end)
    void request.then(result => {
      if (!active) return
      if (!result.ok) { setProposal({ key, error: personnelMessage(result.error.code) }); return }
      setProposal({ key, value: result.data })
      const preserve = record && firstProposal.current && !autoRequested.current && type === record.leaveType && start === record.startDate && end === record.endDate && days === record.usedDays
      setManualAllocation(!!preserve)
      firstProposal.current = false
      if (preserve) setAllocations(Object.fromEntries(record.allocations.map(item => [item.periodId, String(item.days)])))
      else setAllocations(Object.fromEntries(result.data.allocations.map(item => [item.periodId, String(item.days)])))
    }).catch(() => { if (active) setProposal({ key, error: 'Не вдалося отримати доступні дні.' }) })
    return () => { active = false }
  }, [employeeId, type, days, start, end, key, record, retry, hireDate])

  const available = current?.value?.balances.filter(period => period.availableDays > 0) ?? []
  const values = available.map(period => ({ periodId: period.id, days: Number(allocations[period.id] || '0') }))
  const allocationValid = available.every(period => {
    const text = allocations[period.id] || '0'
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) <= period.availableDays
  })
  const total = values.reduce((sum, item) => sum + item.days, 0)
  const canSave = !!employeeId && (group !== 'other' || subtypeChosen) && !!start && start >= '2027-01-01' && start >= hireDate && !!end && length > 0 && days > 0 && days <= length &&
    (!needsExplanation || !!explanation.trim()) && (limit === null || days <= limit) &&
    (periodic ? !!current?.value && allocationValid && total === days : !!grantBasis.trim()) && (!dates.order || !!parseDateInput(dates.order))

  const blockedReason = !employeeId ? 'Оберіть працівника.' : group === 'other' && !subtypeChosen ? 'Оберіть підвид відпустки.' : !start || !end ? 'Вкажіть коректні дати початку й завершення.' :
    start < '2027-01-01' ? 'Початок має бути від 01.01.2027.' : start < hireDate ? 'Початок раніше дати прийняття.' : end < start ? 'Завершення не може передувати початку.' :
    days < 1 || days > length ? 'Перевірте кількість календарних днів.' : limit !== null && days > limit ? 'Перевищено тривалість обраного виду.' :
    needsExplanation && !explanation.trim() ? 'Додайте пояснення уточненої тривалості.' : !periodic && !grantBasis.trim() ? 'Вкажіть документальну підставу.' :
    periodic && !current?.value ? 'Дочекайтеся розподілу або повторіть його завантаження.' : periodic && (!allocationValid || total !== days) ? 'Перевірте розподіл днів між періодами.' :
    dates.order && !parseDateInput(dates.order) ? 'Перевірте дату розпорядження.' : stale ? 'Запис змінився. Відкрийте актуальні відомості.' : ''

  function prepare(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!canSave || pending.current || uncertain || stale) return
    const payload = { employeeId, leaveType: type, startDate: start!, endDate: end!, usedDays: days,
      grantBasis: grantBasis.trim() || null, durationExplanation: explanation.trim() || null, orderNumber: orderNumber.trim() || null,
      orderDate: dates.order ? parseDateInput(dates.order) : null,
      allocations: periodic ? values.filter(item => item.days > 0) : [] }
    if (record) { setConfirm({ ...payload, requestId: record.id }); return }
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
      const update: LeaveUpdate | null = record ? {
        id: record.id, expectedRevision: record.revision, leaveType: input.leaveType,
        startDate: input.startDate, endDate: input.endDate, usedDays: input.usedDays, allocations: input.allocations,
        orderNumber: input.orderNumber, orderDate: input.orderDate, durationExplanation: input.durationExplanation, grantBasis: input.grantBasis ?? null,
      } : null
      const result = update ? await window.hromadaHR.leave.updateLeave(update) : await window.hromadaHR.leave.registerLeave(input)
      if (update && !result.ok && ['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code)) {
        await verify(update)
        return
      }
      if (!alive.current) return
      if (result.ok) onSaved(result.data.leaveType)
      else { setError(personnelMessage(result.error.code)); setConfirm(null); if (['STALE_REVISION','LEAVE_CANCELLED'].includes(result.error.code)) setStale(true) }
    } catch {
      if (record) {
        await verify({ id: record.id, expectedRevision: record.revision, leaveType: input.leaveType,
          startDate: input.startDate, endDate: input.endDate, usedDays: input.usedDays, allocations: input.allocations,
          orderNumber: input.orderNumber, orderDate: input.orderDate, durationExplanation: input.durationExplanation, grantBasis: input.grantBasis ?? null })
      } else if (alive.current) { setError('Результат не підтверджено. Повторіть збереження тих самих даних для безпечної перевірки.'); setConfirm(null) }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }

  async function verify(update: LeaveUpdate) {
    if (alive.current) { setUncertain(update); setConfirm(null) }
    try {
      const actual = await window.hromadaHR.leave.getRecord(update.id)
      if (!alive.current) return
      if (!actual.ok) { setError('Не вдалося перевірити фактичний запис. Чернетку збережено.'); return }
      if (matchesUpdate(actual.data, update)) { onSaved(actual.data.leaveType); return }
      setUncertain(null)
      setStale(actual.data.revision !== update.expectedRevision || actual.data.status !== 'active')
      setError(actual.data.revision === update.expectedRevision && actual.data.status === 'active'
        ? 'Зміни не підтверджено. Збережений запис не змінився. Можна повторити збереження.'
        : 'Фактичний запис уже змінився. Чернетку збережено. Закрийте форму та відкрийте актуальний запис.')
    } catch { if (alive.current) setError('Перевірка результату недоступна. Чернетку збережено.') }
  }

  return <Modal title={record ? 'Редагувати відпустку' : 'Зареєструвати відпустку'} description={employeePicker ? undefined : employeeName} size="wide" className="leave-editor-modal" busy={busy} onClose={() => close(onClose)}>
    <form ref={owner} className="leave-layout leave-registration" onSubmit={prepare} onInvalidCapture={()=>setAttempted(true)}>
      {record?.allocationWarning && <Alert variant="warning">Попередній розподіл містить період, що почався після завершення відпустки. Виправте розподіл вручну.</Alert>}
      <section className="leave-form-section"><h3>Відомості про відпустку</h3>{employeePicker}<p className="leave-muted">Облік відпусток із 01.01.2027.</p>
      {start && start < '2027-01-01' && <Alert variant="error">Дата початку має бути від 01.01.2027. Перехідні відпустки потребують окремої перевірки залишків.</Alert>}
      {record?.allocationWarning && record.allocations.length > 0 && <details><summary>Поточний збережений розподіл</summary><ul>
        {record.allocations.map(allocation => {
          const period = originalBalances?.find(item => item.id === allocation.periodId)
          return <li key={allocation.periodId}>{period ? formatDate(period.periodStart) + '–' + formatDate(period.periodEnd) : 'Період недоступний'} – {allocation.days} днів</li>
        })}
      </ul></details>}
      <div className="recipient-field"><span>Вид відпустки</span><Select label="Вид відпустки" value={group} options={leaveGroupOptions} disabled={busy || !!uncertain}
        onChange={value => {
          const next = value as LeaveGroup
          setGroup(next); setSubtypeChosen(next !== 'other')
          setType(next === 'other' ? 'veteran_special_leave' : next)
        }} advanceOnSelect={false} /></div>
      {group === 'other' && <div className="recipient-field"><span>Уточніть підвид</span><Select label="Уточнення виду відпустки" required value={subtypeChosen ? type : ''} options={specialOptions} disabled={busy || !!uncertain}
        onChange={value => { const selected = selectedLeaveType('other', value); if (selected) { setType(selected); setSubtypeChosen(true) } }} advanceOnSelect={false} /></div>}
      {start && start < hireDate && <Alert variant="warning">Відпустка не може починатися раніше дати прийняття.</Alert>}
      <div className="leave-registration-grid">
        <label className="recipient-field">Початок<DateField required disabled={busy || !!uncertain} value={dates.startIso}
          onChange={startIso => setDates(current => ({ ...current, startIso }))} onDraftChange={start => setDates(current => ({ ...current, start }))} />{attempted && (!start || start < '2027-01-01' || start < hireDate) && <small className="recipient-field-error">Вкажіть дату від 01.01.2027, не раніше прийняття.</small>}</label>
        <label className="recipient-field">Завершення<DateField required disabled={busy || !!uncertain} value={dates.endIso}
          onChange={endIso => setDates(current => ({ ...current, endIso }))} onDraftChange={end => setDates(current => ({ ...current, end }))} />{attempted && (!end || (!!start && end < start)) && <small className="recipient-field-error">Завершення має бути не раніше початку.</small>}</label>
        <label className="recipient-field">Кількість днів<ValidatedInput inputMode="numeric" required disabled={busy || !!uncertain} value={daysText}
          onChange={event => setOverride({ range, text: event.target.value })} />{attempted && (days < 1 || days > length) && <small className="recipient-field-error">Введіть ціле число в межах інтервалу.</small>}</label>
      </div>
      {length > 0 && (days < 1 || days > length) && <Alert variant="warning">Введіть додатну цілу тривалість у межах календарного інтервалу.</Alert>}
      {days > 0 && needsExplanation && <label className="recipient-field">Пояснення уточненої тривалості<ValidatedTextarea required maxLength={1000} disabled={busy || !!uncertain}
        value={explanation} onChange={event => setExplanation(event.target.value)} /></label>}
      {!periodic && <>
        <label className="recipient-field">Підстава надання<ValidatedTextarea required maxLength={1000} disabled={busy || !!uncertain}
          value={grantBasis} onChange={event => setGrantBasis(event.target.value)} /></label>
        <p className="leave-muted">Право та документи перевіряє кадровик. Накопичуваного залишку немає. <HelpTip label="Подієва відпустка" text="Для цього виду не ведеться накопичення днів за робочими роками." /></p>
        {limit !== null && <Alert variant="info">Не більше {limit} календарних днів, одне активне надання за рік початку{start ? ' – ' + start.slice(0,4) : ''}. Невикористані дні не переносяться.
          {type === 'chernobyl_special_leave' && ' Орієнтир: 14 робочих (16 календарних) днів для визначених законом категорій.'}
        </Alert>}
        {limit !== null && days > 0 && days < limit && <Alert variant="warning">Менша тривалість потребує пояснення. Система не встановлює права на використання решти окремою частиною.</Alert>}
        {limit !== null && days > limit && <Alert variant="warning">Для цього виду допустимо не більше {limit} календарних днів.</Alert>}
      </>}
      </section>
      {periodic && current?.error && <Alert variant="error" action={<button type="button" disabled={busy || !!uncertain} onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{current.error}</Alert>}
      {periodic && start && start >= '2027-01-01' && start >= hireDate && end && end >= start && days > 0 && days <= length && days <= 3652059 && !current && <p role="status">Отримання доступних днів…</p>}
      {periodic && current?.value && <section className="leave-allocation-section"><div className="leave-section-heading"><h3>Розподіл днів</h3><HelpTip label="Як розподіляються дні" text="Програма спочатку використовує найстаріші доступні залишки. За потреби розподіл можна змінити." /></div>
        {current.value.shortfall > 0 && <Alert variant="warning" action={<button type="button" disabled={busy || !!uncertain} onClick={() => close(() => onBalances(type as PeriodLeaveType))}>Внести або змінити залишки</button>}>
          Для автоматичного розподілу на дату початку бракує {current.value.shortfall} днів. Перевірте права або задайте ручний розподіл із допустимих періодів.
        </Alert>}
<DictionaryTable label="Розподіл використаних днів" className="leave-table" columns={[{ label: 'Обліковий період' }, { label: 'Доступно', width: '6rem' }, { label: 'Списати', width: '7rem' }]}
          empty={available.length ? undefined : 'Немає підтверджених доступних днів.'}>
          {available.map(period => <tr key={period.id}><td>{formatDate(period.periodStart)}–{formatDate(period.periodEnd)}</td><td>{period.availableDays}</td>
            <td><div className="recipient-field leave-days-field"><ValidatedInput aria-label={'Списати за період ' + formatDate(period.periodStart)} inputMode="numeric" disabled={busy || !!uncertain}
              value={allocations[period.id] ?? '0'} onChange={event => { setManualAllocation(true); setAllocations(current => ({ ...current, [period.id]: event.target.value })) }} /></div></td></tr>)}
        </DictionaryTable>
        <div className="leave-toolbar"><span aria-live="polite">{allocationMessage(days,total,allocationValid,manualAllocation)}</span>
          <button type="button" className="secondary-button" disabled={busy || !!uncertain} onClick={() => { autoRequested.current = true; setRetry(value => value + 1) }}>Автоматично розподілити</button></div>
      </section>}
      <section className="leave-order-section"><div className="leave-section-heading"><h3>Розпорядження (необов’язково)</h3><HelpTip label="Реквізити розпорядження" text="Номер і дату можна додати пізніше через редагування реєстрації." /></div><div className="leave-registration-grid">
        <label className="recipient-field">Номер<ValidatedInput maxLength={100} disabled={busy || !!uncertain} value={orderNumber} onChange={event => setOrderNumber(event.target.value)} /></label>
        <label className="recipient-field">Дата<DateField disabled={busy || !!uncertain} value={dates.orderIso}
          onChange={orderIso => setDates(current => ({ ...current, orderIso }))} onDraftChange={order => setDates(current => ({ ...current, order }))} /></label>
      </div></section>
      <div className="leave-editor-footer">
        {attempted && !canSave && blockedReason && <p className="leave-validation" role="status">{blockedReason}</p>}
        {error && <Alert variant="error">{error}</Alert>}
        {uncertain && <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
          if (pending.current) return
          pending.current = true; setBusy(true)
          try { await verify(uncertain) } finally { pending.current = false; if (alive.current) setBusy(false) }
        }}>Перевірити фактичний результат</button>}
        <div className="recipient-form-actions leave-editor-actions"><div>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => close(onClose)}>Скасувати</button>
          <button type="submit" className="primary-button" onClick={()=>setAttempted(true)} disabled={busy || !!uncertain || stale}>{record ? 'Зберегти зміни' : 'Зареєструвати'}</button>
        </div></div>
      </div>
    </form>
    {confirm && <ConfirmDialog title={record ? "Підтвердити зміни?" : "Підтвердити реєстрацію?"} variant="primary" confirmLabel={record ? "Зберегти зміни" : "Зареєструвати"}
      message={`${leaveLabels[confirm.leaveType]}, ${formatDate(confirm.startDate)}–${formatDate(confirm.endDate)}. Підтверджую надання на ${confirm.usedDays} днів ${isPeriodLeave(confirm.leaveType) ? 'із зазначених залишків' : 'за введеною документальною підставою'}.`}
      onCancel={() => setConfirm(null)} onConfirm={() => save(confirm)} />}
  </Modal>
}
