import useAccountingDate from './useAccountingDate'
import { serviceYearDrafts } from './registry'
import HelpTip from './HelpTip'
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { LeavePeriodInput, PeriodLeaveType } from '../../../shared/leave'
import { formatDate, parseDateInput } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DateField from '../DateField'
import DictionaryTable from '../DictionaryTable'
import Modal from '../Modal'
import ValidatedInput from '../ValidatedInput'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import { buildChanges, cutoff, hasNewEntitlement, type Draft, type Period } from './draft'

export const periodLabel = (period: Period) => formatDate(period.periodStart) + '–' + formatDate(period.periodEnd)

export default function BalanceEditor({ employeeId, employeeName, periods, type, typeLabel, navigationGuard, onClose, onSaved, rightsReady = true, historicalOnly }: {
  employeeId: string; employeeName?: string; periods: Period[]; type: PeriodLeaveType; typeLabel: string; navigationGuard: RefObject<NavigationGuard>
  onClose: () => void; onSaved: () => void
  rightsReady?: boolean; historicalOnly?: boolean
}) {
  const {today}=useAccountingDate()
  const initial = useRef<Draft[]>(periods.map(period => ({ period, days: period.status === 'confirmed' ? String(period.confirmedDays) : '' })))
  const [rows, setRows] = useState(initial.current)
  const [fromYear,setFromYear] = useState('2027')
  const [toYear,setToYear] = useState('2027')
  const [confirmZeros, setConfirmZeros] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const pending = useRef(false)
  const nextRowId = useRef(0)
  const alive = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const close = useUnsavedChanges(JSON.stringify(rows) !== JSON.stringify(initial.current), pending, navigationGuard, form)
  const eligible = (row: Draft) => {
    if (row.days.trim()) return false
    if ('period' in row) return row.period.status === 'proposed'
    const start = parseDateInput(row.start)
    const end = parseDateInput(row.end)
    return !!start && !!end && start <= end && (!historicalOnly || start < cutoff)
  }
  const hasRowActions = type === 'oms_service_additional' && rows.some(row => 'start' in row)
  const zeroCount = rows.filter(eligible).length
  function update(index: number, edit: (row: Draft) => Draft) {
    setRows(current => current.map((row, i) => i === index ? edit(row) : row))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || confirmZeros) return
    setError('')
    let changes
    try { changes = buildChanges(rows) }
    catch (error) {
      setError(error instanceof Error ? error.message : 'Перевірте введені значення.')
      return
    }
    if (!changes.length) { onClose(); return }
    const newEntitlement = hasNewEntitlement(changes, periods)
    if (newEntitlement && !rightsReady) {
      setError('Не вдалося перевірити статус права. Перед внесенням нового підтвердження закрийте редактор та повторіть завантаження статусів.')
      return
    }
    if (newEntitlement && historicalOnly) {
      setError('Нові права за періодами в цьому режимі не підтверджуються. Перевірте право у вкладці «Права на відпустки».')
      return
    }
    await save(changes)
  }

  async function save(changes: LeavePeriodInput[]) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const result = await window.hromadaHR.leave.savePeriods(employeeId, changes)
      if (!alive.current) return
      if (result.ok) onSaved()
      else setError(personnelMessage(result.error.code))
    } catch {
      if (alive.current) setError('Не вдалося зберегти зміни. Повторіть спробу.')
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }

  return <Modal title={(historicalOnly ? 'Історичні залишки – ' : 'Залишки – ') + typeLabel} description={employeeName} size="wide" className="leave-editor-modal" busy={busy} onClose={() => close(onClose)}>
    <form ref={form} className="leave-layout leave-editor" onSubmit={event => void submit(event)}>
      <p className="leave-muted">{historicalOnly ? 'Виправте підтверджені записи або внесіть документально підтверджений початковий залишок за період, що почався до 01.01.2027.' : 'Перенесіть залишки зі зошита за кожним періодом.'} Порожньо – не внесено. 0 – залишку немає. <HelpTip label="Як заповнювати залишки"
        text={historicalOnly ? 'Початковий залишок має враховувати операції до 31.12.2026.' : 'Історичні значення вносять після операцій до 31.12.2026. За новим періодом внесіть підтверджене право – воно не нараховується автоматично.'}/></p>
      {type === 'oms_service_additional' && !historicalOnly && <section className="leave-year-proposals"><p>Календарні інтервали – лише чернетка. Перевірте відповідність стажу та виправте дати перед підтвердженням днів.</p><div className="leave-registration-grid">
        <label className="recipient-field">З року<ValidatedInput inputMode="numeric" value={fromYear} disabled={busy} onChange={e=>setFromYear(e.target.value)}/></label>
        <label className="recipient-field">До року<ValidatedInput inputMode="numeric" value={toYear} disabled={busy} onChange={e=>setToYear(e.target.value)}/></label>
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{try{const proposals=serviceYearDrafts(Number(fromYear),Number(toYear));const starts=new Set(rows.map(row=>'period' in row?row.period.periodStart:row.startIso));setRows(current=>[...current,...proposals.filter(p=>!starts.has(p.start)).map(p=>({id:nextRowId.current++,start:formatDate(p.start),end:formatDate(p.end),startIso:p.start,endIso:p.end,days:''}))]);setError('')}catch(e){setError(e instanceof Error?e.message:'Перевірте роки.')}}}>Запропонувати періоди</button></div></section>}
      <DictionaryTable label="Введення залишків" className="leave-table leave-editor-table"
        columns={[{ label: 'Обліковий період' }, { label: 'Днів', width: '7.5rem', className: 'leave-editor-days' }, ...(hasRowActions ? [{label:'Дії',width:'3.5rem',className:'leave-actions-column'}] : [])]}
        empty={rows.length ? undefined : 'Немає періодів для введення.'}>
        {rows.map((row, index) => {
          const manualStart = 'start' in row ? parseDateInput(row.start) : null
          const basis = 'period' in row ? row.period.accountingBasis : manualStart ? manualStart < cutoff ? 'initial_balance' : 'confirmed_entitlement' : null
          return <tr key={'period' in row ? row.period.periodStart : row.id}>
            <td>{'period' in row ? <span className="leave-period">{periodLabel(row.period)}{row.period.periodStart>today&&<small className="leave-period-note">Майбутній період</small>}</span> : <div className="leave-dates">
              <label className="recipient-field">Початок<DateField disabled={busy} value={row.startIso} onChange={startIso => update(index, current => 'start' in current ? { ...current, startIso } : current)} onDraftChange={start => update(index, current => 'start' in current ? { ...current, start } : current)} /></label>
              <label className="recipient-field">Завершення<DateField disabled={busy} value={row.endIso} onChange={endIso => update(index, current => 'end' in current ? { ...current, endIso } : current)} onDraftChange={end => update(index, current => 'end' in current ? { ...current, end } : current)} /></label>
            </div>}
            {basis === 'confirmed_entitlement' && !historicalOnly && <small className="leave-period-note">Право за новим періодом</small>}
            </td>
            <td><div className="recipient-field leave-days-field"><ValidatedInput type="text" inputMode="numeric" disabled={busy} value={row.days}
              aria-label={'Дні за період ' + ('period' in row ? periodLabel(row.period) : index + 1)}
              onChange={event => { const days = event.target.value; update(index, current => ({ ...current, days })) }} /></div></td>
            {hasRowActions && <td className="leave-actions-column">{'start' in row && <button type="button" className="table-action leave-icon-action" title="Прибрати рядок" aria-label={`Прибрати незбережений рядок ${index + 1}`} disabled={busy} onClick={() => setRows(current => current.filter((_,i)=>i!==index))}><X size={16} aria-hidden="true" /></button>}</td>}
          </tr>
        })}
      </DictionaryTable>
        {type === 'oms_service_additional' && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          const id = nextRowId.current++
          setRows(current => [...current, { id, start: '', end: '', startIso: '', endIso: '', days: '' }])
        }}><Plus size={16} aria-hidden="true" />Додати період</button>}
      <div className="leave-editor-footer">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="recipient-form-actions leave-editor-actions">
          <button type="button" className="secondary-button" disabled={busy || !zeroCount} onClick={() => setConfirmZeros(true)}>Заповнити порожні нулями ({zeroCount})</button>
          <div className="leave-save-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => close(onClose)}>Скасувати</button>
            <button type="submit" className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />{busy ? 'Збереження…' : 'Зберегти'}</button>
          </div>
        </div>
      </div>
    </form>
    {confirmZeros && <ConfirmDialog title="Заповнити нулями?" variant="primary" confirmLabel="Заповнити нулями"
      message={`Кількість періодів вибраного виду для заповнення: ${zeroCount}. Нулі буде записано після натискання «Зберегти».`}
      onCancel={() => setConfirmZeros(false)} onConfirm={() => {
        setRows(current => current.map(row => eligible(row) ? { ...row, days: '0' } : row))
        setConfirmZeros(false)
      }} />}
  </Modal>
}
