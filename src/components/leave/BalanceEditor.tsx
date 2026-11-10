import useAccountingDate from './useAccountingDate'
import Select from '../Select'
import HelpTip from './HelpTip'
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { LeavePeriodInput, PeriodLeaveType, ProposedLeavePeriod } from '../../../shared/leave'
import { formatDate, formatDateInput, parseDateInput } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DateField from '../DateField'
import DictionaryTable from '../DictionaryTable'
import Modal from '../Modal'
import ValidatedInput from '../ValidatedInput'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import ServiceLeaveDate from './ServiceLeaveDate'
import { BalanceDraftError, buildChanges, cutoff, hasNewEntitlement, saveBalanceDraft, serviceDraftRows, setManualStart, suggestedPeriodEnd, type Draft, type Period } from './draft'

export const periodLabel = (period: Period) => formatDate(period.periodStart) + '–' + formatDate(period.periodEnd)

export default function BalanceEditor({ employeeId, employeeName, periods, type, typeLabel, navigationGuard, onClose, onSaved, rightsReady = true, historicalOnly = false, closeLabel = 'Скасувати', serviceStart, manualProposals = [] }: {
  employeeId: string; employeeName?: string; periods: Period[]; type: PeriodLeaveType; typeLabel: string; navigationGuard: RefObject<NavigationGuard>
  onClose: (dateWritten: boolean) => void; onSaved: (daysWritten: boolean) => void
  rightsReady?: boolean; historicalOnly?: boolean; closeLabel?: string
  serviceStart?: string | null; manualProposals?: ProposedLeavePeriod[]
}) {
  const {today, throughDate}=useAccountingDate()
  const formId = useId()
  const service = type === 'oms_service_additional'
  const initial = useRef<Draft[]>(periods.filter(period => type === 'annual_main' || period.status === 'confirmed').map(period => ({ period, days: period.status === 'confirmed' ? String(period.confirmedDays) : '' })))
  const [draftRows, setRows] = useState(initial.current)
  const [savedDate, setSavedDate] = useState(serviceStart ?? null)
  const [dateValue, setDateValue] = useState(serviceStart ?? '')
  const [dateDraft, setDateDraft] = useState(formatDateInput(serviceStart ?? ''))
  const [dateError, setDateError] = useState('')
  const [dateWritten, setDateWritten] = useState(false)
  const preview = service ? serviceDraftRows(draftRows, dateValue || null, throughDate, manualProposals, historicalOnly) : undefined
  const rows = preview?.rows ?? draftRows
  const dateDirty = service && dateDraft !== formatDateInput(savedDate ?? '')
  const childYears = type === 'children_social_additional' ? periods.filter(period =>
    period.status === 'proposed' && !rows.some(row => 'period' in row && row.period.periodStart === period.periodStart)) : []
  const [confirmZeros, setConfirmZeros] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rowError, setRowError] = useState<BalanceDraftError>()
  const form = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const nextRowId = useRef(0)
  const alive = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const enteredRows = rows.filter(row => !service || !('period' in row) || row.period.status === 'confirmed' || row.days.trim())
  const close = useUnsavedChanges(dateDirty || JSON.stringify(enteredRows) !== JSON.stringify(initial.current), pending, navigationGuard, form)
  const returnToParent = () => onClose(dateWritten)
  const eligible = (row: Draft) => {
    if (row.days.trim() || preview?.detached.has(row)) return false
    if ('period' in row) return row.period.status === 'proposed'
    const start = parseDateInput(row.start)
    const end = parseDateInput(row.end)
    return !!start && !!end && start <= end && (!historicalOnly || start < cutoff)
  }
  const hasRowActions = type === 'oms_service_additional' && rows.some(row => 'start' in row)
  const zeroCount = rows.filter(eligible).length
  function update(index: number, edit: (row: Draft) => Draft) {
    setRowError(undefined)
    setRows(current => {
      const latest = service ? serviceDraftRows(current, dateValue || null, throughDate, manualProposals, historicalOnly).rows : current
      return latest.map((row, i) => i === index ? edit(row) : row)
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || confirmZeros) return
    setError('')
    setDateError('')
    setRowError(undefined)
    const date = dateDirty ? (dateDraft.trim() ? parseDateInput(dateDraft) : null) : undefined
    if (dateDirty && dateDraft.trim() && !date) { setDateError('Перевірте дату набуття права.'); return }
    if (preview?.detached.size) { setError('Приберіть введені дні за періодами, що більше не відповідають даті.'); return }
    let changes
    try { changes = buildChanges(rows) }
    catch (error) {
      if (error instanceof BalanceDraftError) {
        setRowError(error)
        form.current?.querySelectorAll('tbody tr')[error.row]?.scrollIntoView({ block: 'nearest' })
      } else setError(error instanceof Error ? error.message : 'Перевірте введені значення.')
      return
    }
    if (!changes.length && date === undefined) { returnToParent(); return }
    const newEntitlement = hasNewEntitlement(changes, periods)
    if (newEntitlement && !rightsReady) {
      setError('Не вдалося перевірити статус права. Перед внесенням нового підтвердження закрийте редактор та повторіть завантаження статусів.')
      return
    }
    if (newEntitlement && historicalOnly) {
      setError('Нові права за періодами в цьому режимі не підтверджуються. Перевірте право у вкладці «Права на відпустки».')
      return
    }
    await save(date, changes)
  }

  async function save(date: string | null | undefined, changes: LeavePeriodInput[]) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const result = await saveBalanceDraft(window.hromadaHR.leave, employeeId, date, changes)
      if (!alive.current) return
      if (result.savedDate !== undefined) {
        setSavedDate(result.savedDate)
        setDateDraft(formatDateInput(result.savedDate ?? ''))
        setDateWritten(true)
      }
      if (result.failed === 'date') {
        setDateError(result.code ? personnelMessage(result.code) : 'Не вдалося підтвердити збереження дати.')
        setError('Запис днів не розпочато.')
      } else if (result.failed === 'days') {
        const reason = result.code ? personnelMessage(result.code) : 'Не вдалося підтвердити збереження днів. Повторіть спробу.'
        const partial = result.savedDate !== undefined || dateWritten
        setError((partial ? 'Дату збережено. ' : '') + (partial && result.code ? 'Дні не збережено. ' : '') + reason)
      } else onSaved(changes.length > 0)
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }

  return <Modal title={(historicalOnly ? 'Історичні залишки – ' : 'Залишки – ') + typeLabel} description={employeeName} size="wide" className="leave-editor-modal" busy={busy} onClose={() => close(returnToParent)}
    footer={<div className="leave-dialog-footer">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="leave-dialog-actions leave-editor-actions">
        {type !== 'children_social_additional' && <button type="button" className="secondary-button" disabled={busy || !zeroCount} onClick={() => setConfirmZeros(true)}>Заповнити порожні нулями ({zeroCount})</button>}
        <div className="leave-save-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => close(returnToParent)}>{closeLabel}</button>
          <button type="submit" form={formId} className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />{busy ? 'Збереження…' : 'Зберегти'}</button>
        </div>
      </div>
    </div>}>
    <form id={formId} ref={form} className="leave-layout leave-editor" onSubmit={event => void submit(event)}>
      {service && <ServiceLeaveDate value={dateValue} disabled={busy} error={dateError} onChange={setDateValue}
        onDraftChange={value => { setDateDraft(value); setDateError(''); setRowError(undefined) }}/>}
      <p className="leave-muted">{historicalOnly ? 'Виправте підтверджені записи або внесіть документально підтверджений початковий залишок за період, що почався до 01.01.2027.' : 'Перенесіть залишки зі зошита за кожним періодом.'} Порожньо – не внесено. 0 – залишку немає. <HelpTip label="Як заповнювати залишки"
        text={historicalOnly ? 'Початковий залишок має враховувати операції до 31.12.2026.' : 'Історичні значення вносять після операцій до 31.12.2026. За новим періодом внесіть підтверджене право – воно не нараховується автоматично.'}/></p>
      {type === 'children_social_additional' && childYears.length > 0 && <div className="recipient-field">
        <span>Додати рік</span>
        <Select label="Додати рік" value="" placeholder="Оберіть календарний рік" advanceOnSelect={false} disabled={busy}
          options={childYears.map(period => ({ value: period.periodStart, label: period.periodStart.slice(0, 4) }))}
          onChange={start => {
            const period = childYears.find(item => item.periodStart === start)
            if (period) setRows([...rows, { period, days: '' }].sort((a, b) => ('period' in a ? a.period.periodStart : '').localeCompare('period' in b ? b.period.periodStart : '')))
          }}/>
      </div>}
      <DictionaryTable label="Введення залишків" className="leave-table leave-editor-table"
        columns={[{ label: 'Обліковий період' }, { label: 'Днів', width: '7.5rem', className: 'leave-editor-days' }, ...(hasRowActions ? [{label:'Дії',width:'3.5rem',className:'leave-actions-column'}] : [])]}
        empty={rows.length ? undefined : service && !dateValue ? 'Введіть дату набуття права або додайте період вручну.' : 'Немає періодів для введення.'}>
        {rows.map((row, index) => {
          const manualStart = 'start' in row ? parseDateInput(row.start) : null
          const basis = 'period' in row ? row.period.accountingBasis : manualStart ? manualStart < cutoff ? 'initial_balance' : 'confirmed_entitlement' : null
          return <tr key={'period' in row ? row.period.periodStart + '/' + row.period.periodEnd : row.id} className={'start' in row ? 'leave-manual-period' : undefined}>
            <td>{'period' in row ? <span className="leave-period">{type === 'children_social_additional' ? row.period.periodStart.slice(0, 4) + ' рік · ' + periodLabel(row.period) : periodLabel(row.period)}{row.period.periodStart>today&&<small className="leave-period-note">Майбутній період</small>}</span> : <>
              {row.endEdited && suggestedPeriodEnd(row.startIso) && suggestedPeriodEnd(row.startIso) !== row.endIso &&
                <button type="button" className="secondary-button leave-recalculate-end" disabled={busy}
                  onClick={() => update(index, current => 'start' in current ? setManualStart({ ...current, endEdited: false }, current.startIso) : current)}>
                  Перерахувати завершення до {formatDate(suggestedPeriodEnd(row.startIso))}
                </button>}
              <div className="leave-dates">
              <label className="recipient-field">Початок<DateField disabled={busy} value={row.startIso} onChange={startIso => update(index, current => 'start' in current ? setManualStart(current, startIso) : current)} onDraftChange={start => update(index, current => 'start' in current ? { ...current, start } : current)} /></label>
              <label className="recipient-field">Завершення<DateField disabled={busy} value={row.endIso} onChange={endIso => update(index, current => 'end' in current ? { ...current, endIso } : current)} onDraftChange={end => update(index, current => 'end' in current ? { ...current, end, endEdited: current.endEdited || end !== formatDateInput(current.endIso) } : current)} /></label>
            </div></>}
            {'period' in row && basis === 'confirmed_entitlement' && !historicalOnly && <small className="leave-period-note">Право за новим періодом</small>}
            {preview?.detached.has(row) && <small className="recipient-field-error">Цей період більше не відповідає даті. Очистьте дні або поверніть попередню дату.</small>}
            </td>
            <td><div className="recipient-field leave-days-field"><ValidatedInput type="text" inputMode="numeric" disabled={busy} value={row.days}
              aria-label={'Дні за період ' + ('period' in row ? periodLabel(row.period) : index + 1)} aria-invalid={rowError?.row === index || undefined}
              aria-describedby={rowError?.row === index ? formId + '-row-error' : undefined}
              onChange={event => { const days = event.target.value; update(index, current => ({ ...current, days })) }} /></div>
              {rowError?.row === index && <small className="recipient-field-error" id={formId + '-row-error'} role="alert">{rowError.message}</small>}
            </td>
            {hasRowActions && <td className="leave-actions-column">{'start' in row && <button type="button" className="table-action leave-icon-action" title="Прибрати рядок" aria-label={`Прибрати незбережений рядок ${index + 1}`} disabled={busy} onClick={() => { setRowError(undefined); setRows(rows.filter((_,i)=>i!==index)) }}><X size={16} aria-hidden="true" /></button>}</td>}
          </tr>
        })}
      </DictionaryTable>
        {type === 'oms_service_additional' && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          const id = nextRowId.current++
          setRows([...rows, { id, start: '', end: '', startIso: '', endIso: '', days: '' }])
        }}><Plus size={16} aria-hidden="true" />Додати період вручну</button>}
    </form>
    {confirmZeros && <ConfirmDialog title="Заповнити нулями?" variant="primary" confirmLabel="Заповнити нулями"
      message={`Кількість періодів вибраного виду для заповнення: ${zeroCount}. Нулі буде записано після натискання «Зберегти».`}
      onCancel={() => setConfirmZeros(false)} onConfirm={() => {
        setRows(rows.map(row => eligible(row) ? { ...row, days: '0' } : row))
        setConfirmZeros(false)
      }} />}
  </Modal>
}
