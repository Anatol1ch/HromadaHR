import { allocationDraft, formatLeaveDays, futureAllocationPeriod } from './summary'
import useAccountingDate from './useAccountingDate'
import HelpTip from './HelpTip'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import { CalendarDays, FileText, List, Wallet } from 'lucide-react'
import { isPeriodLeave, specialLeaveLimit, type PeriodLeaveType } from '../../../shared/leave'
import type { LeaveRecord, LeaveUpdate } from '../../../shared/leave'
import { matchesUpdate } from './corrections'
import { useEffect, useId, useRef, useState, type RefObject, type ReactNode, type FormEvent } from 'react'
import type { AllocationProposal, ConfirmedLeavePeriod, LeaveRegistration, LeaveType, ProposedLeavePeriod } from '../../../shared/leave'
import { calendarDays } from '../../../shared/leave-calculations'
import { formatDate, parseDateInput } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import ConfirmDialog from '../ConfirmDialog'
import LeaveConfirmationSummary from './LeaveConfirmationSummary'
import { confirmationChanges, confirmationPeriods, type ConfirmationPeriod } from './confirmation'
import RegistrationBalanceEditor from './RegistrationBalanceEditor'
import DateField from '../DateField'
import DictionaryTable from '../DictionaryTable'
import Modal from '../Modal'
import Select from '../Select'
import ValidatedInput, { ValidatedTextarea } from '../ValidatedInput'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { leaveGroupOptions, specialOptions, groupForType, selectedLeaveType, type LeaveGroup } from './presentation'
import { annualUsage } from './usage'
import type { RegistrationHistory } from './registry'

type LeaveConfirmation = { input: LeaveRegistration; employeeName: string; periods: ConfirmationPeriod[]; update?: LeaveUpdate; changes: string[] }
const unconfirmedRegistration = 'Результат не підтверджено. Повторіть збереження тих самих даних для безпечної перевірки.'

export default function LeaveRegistrationForm({ employeeId, employeeName, hireDate, initialType, navigationGuard, onClose, onSaved, onReloadRecord, record, employeePicker, returnFocus, history }: {
  record?: LeaveRecord; employeePicker?: ReactNode
  employeeId: string; employeeName?: string; hireDate: string; initialType: LeaveType; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onSaved: (type: LeaveType) => void; onReloadRecord?: () => void; returnFocus?: HTMLElement | null
  history: RegistrationHistory
}) {
  const formId = useId()
  const { today, throughDate } = useAccountingDate()
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
  const [editedAllocation, setEditedAllocation] = useState(false)
  const [confirmFifo, setConfirmFifo] = useState<string | null>(null)
  const [future, setFuture] = useState<{ key: string; period?: ProposedLeavePeriod | ConfirmedLeavePeriod; error?: string }>()
  const [attempted,setAttempted] = useState(false)
  const [stale, setStale] = useState(false)
  const [uncertain, setUncertain] = useState<LeaveUpdate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<LeaveConfirmation | null>(null)
  const [retry, setRetry] = useState(0)
  const [balanceEditor, setBalanceEditor] = useState<PeriodLeaveType | null>(null)
  const [balancesUpdated, setBalancesUpdated] = useState(false)
  const [resumedType, setResumedType] = useState<PeriodLeaveType | null>(null)
  const opener = useRef(returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const owner = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const alive = useRef(false)
  const operation = useRef<{ payload: string; id: string } | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const start = parseDateInput(dates.start)
  const eventYear = !periodic && (group !== 'other' || subtypeChosen) && employeeId && start ? start.slice(0, 4) : null
  const eventUsage = eventYear && !history.error && !history.loading ? annualUsage(history.records, employeeId, type, eventYear) : null
  const end = parseDateInput(dates.end)
  const range = JSON.stringify([start, end])
  const length = start && end && end >= start ? calendarDays(start, end) : 0
  const daysText = override.range === range ? override.text : length > 0 ? String(length) : ''
  const days = /^\d+$/.test(daysText) && Number.isSafeInteger(Number(daysText)) ? Number(daysText) : 0
  const needsExplanation = days !== length || (limit !== null && days < limit)
  const key = JSON.stringify([type, days, start, end, retry])
  const current = proposal?.key === key ? proposal : undefined
  const futureKey = JSON.stringify([employeeId, throughDate, retry])
  const next = type === 'annual_main' && future?.key === futureKey ? future : undefined
  const draftSnapshot = JSON.stringify([type, group, subtypeChosen, dates, override, explanation, orderNumber, grantBasis, allocations])
  const initialSnapshot = useRef(draftSnapshot)
  const dirty = draftSnapshot !== initialSnapshot.current
  const close = useUnsavedChanges(dirty, pending, navigationGuard, owner)

  useEffect(() => {
    let active = true
    if (balanceEditor || !employeeId || !isPeriodLeave(type) || days <= 0 || days > 3652059 || !start || !end || end < start || start < '2027-01-01' || start < hireDate) return
    const request = record
      ? window.hromadaHR.leave.proposeEditAllocation(record.id, record.revision, type, days, start, end)
      : window.hromadaHR.leave.proposeAllocation(employeeId, type, days, start, end)
    void request.then(result => {
      if (!active) return
      if (!result.ok) {
        if (record && ['STALE_REVISION', 'LEAVE_CANCELLED', 'NOT_FOUND'].includes(result.error.code)) setStale(true)
        setProposal({ key, error: personnelMessage(result.error.code) })
        return
      }
      setProposal({ key, value: result.data })
    }).catch(() => { if (active) setProposal({ key, error: 'Не вдалося отримати доступні дні.' }) })
    return () => { active = false }
  }, [employeeId, type, days, start, end, key, record, hireDate, balanceEditor])

  useEffect(() => {
    if (balanceEditor || !employeeId || type !== 'annual_main') return
    let active = true
    const api = window.hromadaHR.leave
    const fail = () => { if (active) setFuture({ key: futureKey, error: 'Не вдалося перевірити наступний обліковий період.' }) }
    void Promise.all([api.proposePeriods(employeeId, throughDate, 'annual_main'), api.listPeriods(employeeId)]).then(([proposed, saved]) => {
      if (!active) return
      if (!proposed.ok || !saved.ok) { fail(); return }
      setFuture({ key: futureKey, period: futureAllocationPeriod(proposed.data, saved.data, throughDate) })
    }).catch(fail)
    return () => { active = false }
  }, [employeeId, type, throughDate, futureKey, balanceEditor])

  const available = current?.value?.balances.filter(period => period.availableDays > 0) ?? []
  const allocation = allocationDraft(available, allocations, days, resumedType === type)
  const unavailableDraft = resumedType === type && allocation.ignored
  const nextPeriod = next?.period
  const infoPeriod = nextPeriod && !available.some(period => period.periodStart === nextPeriod.periodStart) ? nextPeriod : undefined
  function applyFifo() {
    if (!current?.value) return
    setAllocations(Object.fromEntries(current.value.allocations.map(item => [item.periodId, String(item.days)])))
    setEditedAllocation(false)
  }
  const canSave = !!employeeId && (group !== 'other' || subtypeChosen) && !!start && start >= '2027-01-01' && start >= hireDate && !!end && length > 0 && days > 0 && days <= length &&
    (!needsExplanation || !!explanation.trim()) && (limit === null || days <= limit) &&
    (periodic ? !!current?.value && allocation.complete : !!grantBasis.trim()) && (!dates.order || !!parseDateInput(dates.order))

  const blockedReason = !employeeId ? 'Оберіть працівника.' : group === 'other' && !subtypeChosen ? 'Оберіть підвид відпустки.' : !start || !end ? 'Вкажіть коректні дати початку й завершення.' :
    start < '2027-01-01' ? 'Початок має бути від 01.01.2027.' : start < hireDate ? 'Початок раніше дати прийняття.' : end < start ? 'Завершення не може передувати початку.' :
    days < 1 || days > length ? 'Перевірте кількість календарних днів.' : limit !== null && days > limit ? 'Перевищено тривалість обраного виду.' :
    needsExplanation && !explanation.trim() ? 'Додайте пояснення уточненої тривалості.' : !periodic && !grantBasis.trim() ? 'Вкажіть документальну підставу.' :
    periodic && !current?.value ? 'Дочекайтеся доступних періодів або повторіть завантаження.' : periodic && !allocation.complete ? 'Перевірте розподіл днів між періодами.' :
    dates.order && !parseDateInput(dates.order) ? 'Перевірте дату розпорядження.' : stale ? 'Запис змінився. Відкрийте актуальні відомості.' : ''

  function prepare(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!canSave || pending.current || uncertain || stale || confirm) return
    setError('')
    const payload = { employeeId, leaveType: type, startDate: start!, endDate: end!, usedDays: days,
      grantBasis: grantBasis.trim() || null, durationExplanation: explanation.trim() || null, orderNumber: orderNumber.trim() || null,
      orderDate: dates.order ? parseDateInput(dates.order) : null,
      allocations: periodic ? allocation.values : [] }
    if (!record) {
      const json = JSON.stringify(payload)
      if (operation.current?.payload !== json) operation.current = { payload: json, id: crypto.randomUUID() }
    }
    const input = { ...payload, requestId: record?.id ?? operation.current!.id }
    const periods = confirmationPeriods(input, available)
    if (!periods || !employeeName) {
      setError(!employeeName ? 'Не вдалося визначити працівника.' : 'Не вдалося перевірити періоди списання. Уточніть розподіл.')
      if (!periods) setRetry(value => value + 1)
      return
    }
    const { employeeId: _employeeId, ...fields } = payload
    const update = record ? { ...fields, id: record.id, expectedRevision: record.revision } : undefined
    setConfirm({ input, employeeName, periods, update, changes: record ? confirmationChanges(input, record) : [] })
  }
  async function save({ input, update, periods }: LeaveConfirmation) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (periods.length) {
        // Check displayed identities without recalculating allocation or consuming the idempotent retry.
        const saved = await window.hromadaHR.leave.listPeriods(input.employeeId).catch(() => null)
        if (!alive.current) return
        const actual = saved?.ok ? confirmationPeriods(input, saved.data) : null
        if (!actual || actual.some((row, index) => row.start !== periods[index]?.start || row.end !== periods[index]?.end)) {
          setError(saved?.ok ? 'Облікові періоди змінилися. Перевірте розподіл і відкрийте підтвердження знову.'
            : 'Не вдалося перевірити облікові періоди. Повторіть спробу.')
          setConfirm(null)
          if (saved?.ok) setRetry(value => value + 1)
          return
        }
      }
      const result = update ? await window.hromadaHR.leave.updateLeave(update) : await window.hromadaHR.leave.registerLeave(input)
      if (update && !result.ok && ['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code)) {
        await verify(update)
        return
      }
      if (!alive.current) return
      if (result.ok) onSaved(result.data.leaveType)
      else {
        setError(!update && ['UNAVAILABLE','INTERNAL_ERROR'].includes(result.error.code)
          ? unconfirmedRegistration : personnelMessage(result.error.code))
        setConfirm(null)
        if (['STALE_REVISION','LEAVE_CANCELLED'].includes(result.error.code)) setStale(true)
        if (['INSUFFICIENT_DAYS','INVALID_PERIOD'].includes(result.error.code)) setRetry(value => value + 1)
      }
    } catch {
      if (update) await verify(update)
      else if (alive.current) { setError(unconfirmedRegistration); setConfirm(null) }
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

  if (history.suspended) return null
  if (balanceEditor) return <RegistrationBalanceEditor employeeId={employeeId} employeeName={employeeName} type={balanceEditor}
    throughDate={throughDate} navigationGuard={navigationGuard} onReturn={saved => {
      setResumedType(balanceEditor)
      setBalancesUpdated(saved)
      setRetry(value => value + 1)
      setBalanceEditor(null)
    }}/>

  return <Modal title={record ? 'Редагувати відпустку' : 'Зареєструвати відпустку'} description={employeePicker ? undefined : employeeName} size="wide" className="leave-editor-modal leave-design-dialog" busy={busy} onClose={() => close(onClose)} returnFocus={opener.current}
    footer={<div className="leave-dialog-footer">
        {attempted && !canSave && blockedReason && <p className="leave-validation" role="status">{blockedReason}</p>}
        {error && <Alert variant="error">{error}</Alert>}
        {stale && onReloadRecord && <Alert variant="warning" action={<button type="button" className="secondary-button"
          onClick={() => close(onReloadRecord)}>Завантажити актуальний запис</button>}>Запис змінився або його скасовано. Введені значення залишилися у формі.</Alert>}
        {uncertain && <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
          if (pending.current) return
          pending.current = true; setBusy(true)
          try { await verify(uncertain) } finally { pending.current = false; if (alive.current) setBusy(false) }
        }}>Перевірити фактичний результат</button>}
        <div className="leave-dialog-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => close(onClose)}>Скасувати</button>
          <button type="submit" form={formId} className="primary-button" onClick={()=>setAttempted(true)} disabled={busy || !!uncertain || stale}>{record ? 'Зберегти зміни' : 'Зареєструвати'}</button>
        </div>
      </div>}>
    <form id={formId} ref={owner} className="leave-layout leave-registration" onSubmit={prepare} onInvalidCapture={()=>setAttempted(true)}>
      <InfoSection title="Відомості про відпустку" icon={<CalendarDays size={17}/>} action={periodic && employeeId &&
        <button type="button" className="secondary-button" disabled={busy || !!uncertain}
          onClick={() => history.open({ employeeId, type, year: '' })}>Переглянути історію</button>}>
      {start && start < '2027-01-01' && <Alert variant="error">Дата початку має бути від 01.01.2027. Перехідні відпустки потребують окремої перевірки залишків.</Alert>}
      <div className={employeePicker ? "info-grid info-grid-two" : undefined}>{employeePicker}
      <div className="recipient-field"><span>Вид відпустки</span><Select label="Вид відпустки" value={group} options={leaveGroupOptions} disabled={busy || !!uncertain}
        onChange={value => {
          const next = value as LeaveGroup
          setGroup(next); setSubtypeChosen(next !== 'other')
          setType(next === 'other' ? 'veteran_special_leave' : next)
        }} advanceOnSelect={false} /></div></div>
      {group === 'other' && <div className="recipient-field"><span>Уточніть підвид</span><Select label="Уточнення виду відпустки" required value={subtypeChosen ? type : ''} options={specialOptions} disabled={busy || !!uncertain}
        onChange={value => { const selected = selectedLeaveType('other', value); if (selected) { setType(selected); setSubtypeChosen(true) } }} advanceOnSelect={false} /></div>}
      {start && start < hireDate && <Alert variant="warning">Відпустка не може починатися раніше дати прийняття.</Alert>}
      <div className="leave-registration-grid">
        <label className="recipient-field">Початок<DateField required disabled={busy || !!uncertain} value={dates.startIso} initialDraft={dates.start}
          onChange={startIso => setDates(current => ({ ...current, startIso }))} onDraftChange={start => setDates(current => ({ ...current, start }))} />{attempted && (!start || start < '2027-01-01' || start < hireDate) && <small className="recipient-field-error">Вкажіть дату від 01.01.2027, не раніше прийняття.</small>}</label>
        <label className="recipient-field">Завершення<DateField required disabled={busy || !!uncertain} value={dates.endIso} initialDraft={dates.end}
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
        {limit !== null && <p className="leave-muted">До {limit} календарних днів, одне активне надання за рік початку.</p>}
        {limit !== null && days > 0 && days < limit && <Alert variant="warning">Менша тривалість потребує пояснення. Система не встановлює права на використання решти окремою частиною.</Alert>}
        {limit !== null && days > limit && <Alert variant="warning">Для цього виду допустимо не більше {limit} календарних днів.</Alert>}
      </>}
      </InfoSection>
      {eventYear && <InfoSection title={'Надання за ' + eventYear + ' рік'} action={eventUsage && <button type="button" className="secondary-button"
        disabled={busy || !!uncertain} onClick={() => history.open({ employeeId, type, year: eventYear })}>Переглянути в журналі</button>}>
        {history.error ? <Alert variant="error" action={<button type="button" onClick={history.retry}>Повторити</button>}>Не вдалося завантажити історію надань.</Alert>
          : history.loading ? <DataState kind="loading" compact message="Завантаження історії надань…"/>
          : eventUsage && <dl className="info-grid">
            <InfoItem label="Активні надання" value={eventUsage.activeCount}/>
            <InfoItem label="Зареєстровані календарні дні" value={eventUsage.days}/>
            <InfoItem label="Скасовані надання" value={eventUsage.cancelledCount}/>
          </dl>}
      </InfoSection>}
      {periodic && current?.error && <Alert variant="error" action={<button type="button" disabled={busy || !!uncertain} onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{current.error}</Alert>}
      {periodic && start && start >= '2027-01-01' && start >= hireDate && end && end >= start && days > 0 && days <= length && days <= 3652059 && !current && <p role="status">Отримання доступних днів…</p>}
      {periodic && current?.value && <InfoSection title="Розподіл днів" icon={<List size={17}/>}
        help={<HelpTip label="Як розподіляються дні" text="Введіть дні вручну або натисніть «Автоматично розподілити». Кнопка застосовує найстаріші доступні періоди, що почалися до початку відпустки або в день її початку." />}>
        {balancesUpdated && <Alert variant="info">Залишки оновлено. Перевірте розподіл.</Alert>}
        {allocation.shortfall > 0 ? <Alert variant="warning" className="leave-right-notice" action={<button type="button" className="secondary-button" disabled={busy || !!uncertain || stale} onClick={() => { if (isPeriodLeave(type)) setBalanceEditor(type) }}><Wallet size={16} aria-hidden="true"/>Внести дні й повернутися</button>}>
          За допустимими підтвердженими періодами бракує {formatLeaveDays(allocation.shortfall)}.
        </Alert> : current.value.shortfall > 0 && <Alert variant="info">
          Автоматичний розподіл не охоплює всі дні. Решту можна розподілити вручну за доступними підтвердженими періодами.
        </Alert>}
        {unavailableDraft ? <Alert variant="warning" action={<button type="button" className="secondary-button" disabled={busy || !!uncertain || stale}
          onClick={() => setAllocations(values => Object.fromEntries(Object.entries(values).filter(([id]) => available.some(period => period.id === id))))}>Прибрати недоступні списання</button>}>
          Деякі обрані періоди більше недоступні. Приберіть недоступні списання й уточніть розподіл.
        </Alert> : allocation.ignored && <Alert variant="info">Дні, введені за періоди, яких зараз немає в таблиці, не враховано.</Alert>}
        {resumedType === type && allocation.invalid.size > 0 && <Alert variant="warning">Доступна кількість днів змінилася. Перевірте позначені списання.</Alert>}
        {next?.error && <Alert variant="error" action={<button type="button" disabled={busy || !!uncertain} onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{next.error}</Alert>}
        <DictionaryTable label="Розподіл використаних днів" className="leave-table" columns={[{ label: 'Обліковий період' }, { label: 'Доступно', width: '24%', className: 'leave-days-column' }, { label: 'Списати', width: '25%', className: 'leave-days-column' }]}
          empty={available.length || infoPeriod ? undefined : 'Немає підтверджених доступних днів.'}>
          {available.map(period => <tr key={period.id}><td>{formatDate(period.periodStart)}–{formatDate(period.periodEnd)}
            {period.periodStart > today && <small className="leave-period-note">Майбутній період</small>}
            {end && period.periodStart > end && Number(allocations[period.id]) > 0 && <small className="leave-period-note" role="status">
              Обраний період починається після завершення відпустки. Перевірте підставу його використання.
            </small>}</td><td className="leave-days-column">{period.availableDays}</td>
            <td><div className="recipient-field leave-days-field"><ValidatedInput aria-label={'Списати за період ' + formatDate(period.periodStart)} aria-invalid={allocation.invalid.has(period.id) || undefined} inputMode="numeric" disabled={busy || !!uncertain}
              value={allocations[period.id] ?? '0'} onChange={event => { setEditedAllocation(true); setAllocations(current => ({ ...current, [period.id]: event.target.value })) }} /></div></td></tr>)}
          {infoPeriod && <tr><td>{formatDate(infoPeriod.periodStart)}–{formatDate(infoPeriod.periodEnd)}
            <small className="leave-period-note">Майбутній період{end && infoPeriod.periodStart > end ? ' · після завершення відпустки' : ''}</small></td>
            <td className="leave-days-column">{infoPeriod.status === 'proposed' ? 'Дні не підтверджені' : 'Списання недоступне'}</td>
            <td className="leave-days-column">{infoPeriod.status === 'proposed' ? <button type="button" className="secondary-button leave-confirm-period" disabled={busy || !!uncertain || stale}
              onClick={() => setBalanceEditor('annual_main')}>Підтвердити дні</button> : '–'}</td>
          </tr>}
        </DictionaryTable>
        <div className="leave-allocation-summary">
          <div className="leave-allocation-state" aria-live="polite">
            <strong>Розподілено {allocation.total} із {days}</strong>
            <span className={allocation.invalid.size || allocation.total > days ? 'leave-validation' : 'leave-muted'}>{allocation.message}</span>
            <div className="leave-allocation-track" role="progressbar" aria-label="Розподіл днів" aria-valuemin={0} aria-valuemax={days}
              aria-valuenow={Math.min(allocation.total, days)} aria-valuetext={'Розподілено ' + allocation.total + ' із ' + days + '. ' + allocation.message}>
              <span style={{ width: Math.min(100, allocation.total * 100 / days) + '%' }}/>
            </div>
          </div>
          <button type="button" className="secondary-button" disabled={busy || !!uncertain || !current.value.allocations.length}
            onClick={() => editedAllocation || Object.keys(allocations).length ? setConfirmFifo(key) : applyFifo()}>Автоматично розподілити</button>
        </div>
      </InfoSection>}
      <InfoSection title="Розпорядження" icon={<FileText size={17}/>}
        help={<HelpTip label="Реквізити розпорядження" text="Номер і дату можна додати пізніше через редагування реєстрації." />}>
      <div className="info-grid info-grid-two">
        <label className="recipient-field">Номер<ValidatedInput maxLength={100} disabled={busy || !!uncertain} value={orderNumber} onChange={event => setOrderNumber(event.target.value)} /></label>
        <label className="recipient-field">Дата<DateField disabled={busy || !!uncertain} value={dates.orderIso} initialDraft={dates.order}
          onChange={orderIso => setDates(current => ({ ...current, orderIso }))} onDraftChange={order => setDates(current => ({ ...current, order }))} /></label>
      </div></InfoSection>
    </form>
    {confirmFifo !== null && <ConfirmDialog title="Замінити розподіл?" variant="warning" confirmLabel="Застосувати FIFO"
      message="Автоматичний розподіл замінить поточні значення списання за періодами."
      onCancel={() => setConfirmFifo(null)} onConfirm={() => { if (confirmFifo === key) applyFifo(); setConfirmFifo(null) }} />}
    {confirm && <ConfirmDialog title={confirm.update ? 'Підтвердження змін' : 'Підтвердження відпустки'} variant="primary" layout="summary"
      description={confirm.update ? 'Перевірте оновлені відомості перед збереженням.' : 'Перевірте відомості перед реєстрацією.'}
      cancelLabel="Повернутися" confirmLabel={confirm.update ? 'Зберегти зміни' : 'Зареєструвати'}
      message={<LeaveConfirmationSummary {...confirm}/>}
      onCancel={() => setConfirm(null)} onConfirm={() => save(confirm)} />}
  </Modal>
}
