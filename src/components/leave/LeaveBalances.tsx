import LeaveRegistrationForm from './LeaveRegistrationForm'
import LeaveJournal from './LeaveJournal'
import { leaveLabels as labels, leaveOptions as options } from './presentation'
import type { PeriodBalance, LeaveRecord } from '../../../shared/leave'
import { Fragment, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { type LeaveType, type ConfirmedLeavePeriod, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import { todayIsoDate } from '../../lib/dates'
import ConfirmDialog from '../ConfirmDialog'
import DictionaryTable from '../DictionaryTable'
import Select from '../Select'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import BalanceEditor, { periodLabel } from './BalanceEditor'
import { cutoff, type Period } from './draft'

const columns = [{ label: 'Обліковий період' },
  { label: 'Підтверджено', width: '8rem', className: 'leave-days-column' }, { label: 'Використано', width: '6rem', className: 'leave-days-column' },
  { label: 'Доступно', width: '6rem', className: 'leave-days-column' }, { label: 'Дії', width: '3.5rem' }]
const groups = [
  { basis: 'initial_balance', label: 'Початкові залишки' },
  { basis: 'confirmed_entitlement', label: 'Права за новими періодами' },
] as const
const dayPlural = new Intl.PluralRules('uk-UA')
const dayLabel = (days: bigint) => {
  const category = dayPlural.select(Number(days % 100n))
  return category === 'one' ? 'день' : category === 'few' ? 'дні' : 'днів'
}

export default function LeaveBalances({ employeeId, hireDate, navigationGuard, employeeName, onRegistered, showJournal = true }: {
  employeeId: string; hireDate: string; navigationGuard: RefObject<NavigationGuard>
  employeeName?: string; onRegistered?: () => void; showJournal?: boolean
}) {
  const [type, setType] = useState<LeaveType>('annual_main')
  const groupId = useId()
  const [revision, setRevision] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<ConfirmedLeavePeriod | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [manualProposals, setManualProposals] = useState<ProposedLeavePeriod[]>([])
  const [state, setState] = useState<{ key: string; periods?: Period[]; balances?: PeriodBalance[]; records?: LeaveRecord[]; error?: string }>()
  const key = JSON.stringify([employeeId, hireDate, type, revision])
  const data = state?.key === key ? state : undefined
  const periods = data?.periods && (type === 'oms_service_additional' ?
    [...data.periods, ...manualProposals.filter(proposal => !data.periods?.some(period => period.periodStart === proposal.periodStart))]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)) : data.periods)
  const owner = useRef<HTMLElement>(null)
  const pending = useRef(false)
  const alive = useRef(false)
  useUnsavedChanges(false, pending, navigationGuard, owner)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let active = true
    const api = window.hromadaHR.leave
    const today = todayIsoDate()
    async function load() {
      try {
        const [saved, proposals, balances, records] = await Promise.all([
          api.listPeriods(employeeId),
          api.proposePeriods(employeeId, today > cutoff ? today : cutoff, type),
          api.getBalances(employeeId),
          showJournal ? api.listRecords(employeeId) : Promise.resolve({ ok: true as const, data: [] as LeaveRecord[] }),
        ])
        if (!active) return
        if (!saved.ok) { setState({ key, error: personnelMessage(saved.error.code) }); return }
        if (!proposals.ok) { setState({ key, error: personnelMessage(proposals.error.code) }); return }
        if (!balances.ok) { setState({ key, error: personnelMessage(balances.error.code) }); return }
        if (!records.ok) { setState({ key, error: personnelMessage(records.error.code) }); return }
        const merged = new Map<string, Period>(proposals.data.map(period => [period.periodStart, period]))
        for (const period of saved.data) if (period.leaveType === type) merged.set(period.periodStart, period)
        setState({ key, balances: balances.data, records: records.data, periods: [...merged.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)) })
      } catch {
        if (active) setState({ key, error: 'Не вдалося завантажити залишки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, key, type, showJournal])

  const confirmed = periods?.filter(period => period.status === 'confirmed') ?? []
  const sum = confirmed.reduce((total, period) => total + BigInt(period.confirmedDays), 0n)
  const balanceMap = new Map(data?.balances?.map(period => [period.id, period]))
  const used = (data?.balances ?? []).filter(period => period.leaveType === type)
    .reduce((total, period) => total + BigInt(period.usedDays), 0n)
  const available = sum - used
  const refresh = () => setRevision(value => value + 1)

  async function remove(period: ConfirmedLeavePeriod) {
    if (pending.current) return
    pending.current = true
    setDeleteError('')
    try {
      const result = await window.hromadaHR.leave.deletePeriod(period.id)
      if (!alive.current) return
      if (!result.ok) { setDeleteError(personnelMessage(result.error.code)); return }
      if (period.leaveType === 'oms_service_additional') {
        const { leaveType, periodStart, periodEnd, accountingBasis } = period
        setManualProposals(current => [...current.filter(item => item.periodStart !== periodStart),
          { leaveType, periodStart, periodEnd, accountingBasis, status: 'proposed' }])
      }
      setDeleting(null)
      refresh()
      notifySystemToast('success', 'Підтвердження вилучено', periodLabel(period))
    } catch {
      if (alive.current) setDeleteError('Не вдалося вилучити підтвердження. Повторіть спробу.')
    } finally { pending.current = false }
  }

  return <section ref={owner} className="leave-layout" aria-label="Залишки відпусток">
    {periods && <div className="leave-summary" aria-live="polite">
      <strong>{confirmed.length ? available.toLocaleString('uk-UA') + ' ' + dayLabel(available) : 'Залишки не внесено'}</strong>
      {confirmed.length > 0 && <span>Підтверджені періоди: {confirmed.length} з {periods.length}</span>}
      <span>Підтверджено {sum.toLocaleString('uk-UA')} · використано {used.toLocaleString('uk-UA')}</span>
      <p>{confirmed.length > 0 && confirmed.length < periods.length ? 'Сума може бути неповною. ' : ''}
        Доступно за відомими підтвердженими періодами.</p>
    </div>}
    <div className="leave-toolbar">
      <div className="leave-select"><Select label="Вид відпустки" value={type} options={options} advanceOnSelect={false}
        onChange={value => { setState(undefined); setType(value as LeaveType) }} /></div>
      <button className="primary-button" type="button" disabled={!periods} onClick={() => setRegistering(true)}>Зареєструвати відпустку</button>
      <button className="secondary-button" type="button" disabled={!periods || (!periods.length && type !== 'oms_service_additional')}
        onClick={() => setEditing(true)}>
        {confirmed.length ? <Pencil size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        {confirmed.length ? 'Редагувати залишки' : 'Внести залишки'}
      </button>
    </div>
    <DictionaryTable label="Залишки за періодами" className="leave-table" columns={columns} loading={!data}
      empty={!periods?.length ? 'Немає облікових періодів для вибраного виду.' : undefined} error={data?.error} onRetry={refresh}>
      {groups.map(group => {
        const entries = periods?.filter(period => period.accountingBasis === group.basis)
        if (!entries?.length) return null
        return <Fragment key={group.basis}>
          <tr className="leave-group"><th id={groupId + group.basis} colSpan={5}>{group.label}</th></tr>
          {entries.map(period => <tr key={period.periodStart}>
            <td className="leave-period" aria-describedby={groupId + group.basis}>{periodLabel(period)}</td>
            <td className="leave-days-column">{period.status === 'confirmed'
              ? <strong>{period.confirmedDays} {dayLabel(BigInt(period.confirmedDays))}</strong>
              : <span className="leave-muted">Не внесено</span>}</td>
            <td className="leave-days-column">{period.status === 'confirmed' ? balanceMap.get(period.id)?.usedDays ?? '—' : '—'}</td>
            <td className="leave-days-column">{period.status === 'confirmed' ? <strong>{balanceMap.get(period.id)?.availableDays ?? '—'}</strong> : '—'}</td>
            <td>{period.status === 'confirmed' && <div className="registry-row-actions">
              <button type="button" className="table-action leave-icon-action leave-remove" title="Вилучити підтвердження"
                aria-label={'Вилучити підтвердження за період ' + periodLabel(period)}
                onClick={() => { setDeleteError(''); setDeleting(period) }}><Trash2 size={16} aria-hidden="true" /></button>
            </div>}</td>
          </tr>)}
        </Fragment>
      })}
    </DictionaryTable>
    {showJournal && data?.records && <LeaveJournal records={data.records} compact />}
    {registering && <LeaveRegistrationForm employeeId={employeeId} employeeName={employeeName} hireDate={hireDate} initialType={type} navigationGuard={navigationGuard}
      onClose={() => setRegistering(false)} onBalances={selectedType => { setRegistering(false); setType(selectedType); setState(undefined); setEditing(true); refresh() }}
      onSaved={() => { setRegistering(false); refresh(); onRegistered?.(); notifySystemToast('success', 'Відпустку зареєстровано', 'Залишки оновлено.') }} />}
    {editing && periods && <BalanceEditor employeeId={employeeId} periods={periods} type={type} typeLabel={labels[type]} navigationGuard={navigationGuard}
      onClose={() => setEditing(false)} onSaved={() => {
        setEditing(false)
        refresh()
        notifySystemToast('success', 'Залишки збережено', 'Підтверджені величини оновлено.')
      }} />}
    {deleting && <ConfirmDialog title="Вилучити підтвердження?" confirmLabel="Вилучити" error={deleteError}
      message={`Підтверджені дні за період ${periodLabel(deleting)} буде вилучено. Період знову відображатиметься як «Не внесено».`}
      onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
  </section>
}
