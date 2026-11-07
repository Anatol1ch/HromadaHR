import useAccountingDate from './useAccountingDate'
import { isPeriodLeave } from '../../../shared/leave'
import { balanceSummary } from './summary'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import LeaveJournal from './LeaveJournal'
import { leaveLabels as labels, periodLeaveOptions as options } from './presentation'
import type { PeriodBalance, LeaveRecord } from '../../../shared/leave'
import { Fragment, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Trash2 } from 'lucide-react'
import { type PeriodLeaveType, type ConfirmedLeavePeriod, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import ConfirmDialog from '../ConfirmDialog'
import DictionaryTable from '../DictionaryTable'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import BalanceEditor, { periodLabel } from './BalanceEditor'
import { type Period } from './draft'

const columns = [{ label: 'Обліковий період' },
  { label: 'Внесено днів', width: '8rem', className: 'leave-days-column' }, { label: 'Враховано у відпустках', width: '6rem', className: 'leave-days-column' },
  { label: 'Залишилося', width: '6rem', className: 'leave-days-column' }, { label: 'Дії', width: '3.5rem' }]
const groups = [
  { basis: 'initial_balance', label: 'Початкові залишки' },
  { basis: 'confirmed_entitlement', label: 'Права за новими періодами' },
] as const
const dayPlural = new Intl.PluralRules('uk-UA')
const dayLabel = (days: bigint) => {
  const category = dayPlural.select(Number(days % 100n))
  return category === 'one' ? 'день' : category === 'few' ? 'дні' : 'днів'
}

export default function LeaveBalances({ employeeId, hireDate, navigationGuard, employeeName, onRegistered, showJournal = true, refreshRevision = 0, showRegister = true, selectedType, onTypeChange }: {
  employeeId: string; hireDate: string; navigationGuard: RefObject<NavigationGuard>
  employeeName?: string; onRegistered?: () => void; showJournal?: boolean; refreshRevision?: number; showRegister?: boolean; selectedType?: PeriodLeaveType; onTypeChange?: (type: PeriodLeaveType) => void
}) {
  const [localType, setLocalType] = useState<PeriodLeaveType>('annual_main')
  const type = selectedType ?? localType
  const setType = (value: PeriodLeaveType) => { setLocalType(value); onTypeChange?.(value) }
  const {today,throughDate}=useAccountingDate()
  const groupId = useId()
  const [revision, setRevision] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<ConfirmedLeavePeriod | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [manualProposals, setManualProposals] = useState<ProposedLeavePeriod[]>([])
  const [state, setState] = useState<{ key: string; periods?: Period[]; balances?: PeriodBalance[]; records?: LeaveRecord[]; proposals?: ProposedLeavePeriod[]; error?: string }>()
  const key = JSON.stringify([employeeId, hireDate, revision, refreshRevision, throughDate])
  const data = state?.key === key ? state : undefined
  const selectedPeriods = data?.periods?.filter(period => period.leaveType === type)
  const periods = selectedPeriods && (type === 'oms_service_additional' ?
    [...selectedPeriods, ...manualProposals.filter(proposal => !selectedPeriods.some(period => period.periodStart === proposal.periodStart))]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)) : selectedPeriods)
  const owner = useRef<HTMLElement>(null)
  const editorPeriods = useRef<Period[] | null>(null)
  const pending = useRef(false)
  const alive = useRef(false)
  useUnsavedChanges(false, pending, navigationGuard, owner)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let active = true
    const api = window.hromadaHR.leave
    async function load() {
      try {
        const [saved, proposals, balances, records] = await Promise.all([
          api.listPeriods(employeeId),
          Promise.all(options.map(option => api.proposePeriods(employeeId, throughDate, option.value))),
          api.getBalances(employeeId),
          showJournal ? api.listRecords(employeeId) : Promise.resolve({ ok: true as const, data: [] as LeaveRecord[] }),
        ])
        if (!active) return
        if (!saved.ok) { setState({ key, error: personnelMessage(saved.error.code) }); return }
        const failed = proposals.find(result => !result.ok)
        if (failed && !failed.ok) { setState({ key, error: personnelMessage(failed.error.code) }); return }
        const proposed = proposals.flatMap(result => result.ok ? result.data : [])
        if (!balances.ok) { setState({ key, error: personnelMessage(balances.error.code) }); return }
        if (!records.ok) { setState({ key, error: personnelMessage(records.error.code) }); return }
        const merged = new Map<string, Period>(proposed.map(period => [period.leaveType + period.periodStart, period]))
        for (const period of saved.data) merged.set(period.leaveType + period.periodStart, period)
        setState({ key, proposals: proposed, balances: balances.data, records: records.data, periods: [...merged.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)) })
      } catch {
        if (active) setState({ key, error: 'Не вдалося завантажити залишки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, key, showJournal])

  const balanceMap = new Map(data?.balances?.map(period => [period.id, period]))
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

  const selectedSummary=balanceSummary(type,data?.balances??[],(data?.proposals??[]).filter(p=>p.periodStart<=throughDate))
  return <section ref={owner} className="leave-layout" aria-label="Залишки відпусток">
    <div className="leave-section-heading"><h3>Залишки відпусток</h3>
      {showRegister && <button className="primary-button" type="button" onClick={() => setRegistering(true)}>Зареєструвати відпустку</button>}</div>
    <div className="leave-kind-nav">{options.map(option=><button type="button" key={option.value} aria-pressed={type===option.value} onClick={()=>setType(option.value)}>{option.label}</button>)}</div>
    {data&&!data.error&&<div className="leave-selected-summary"><strong>{selectedSummary.count?selectedSummary.remaining.toLocaleString('uk-UA')+' '+dayLabel(selectedSummary.remaining):'Залишки не внесено'}</strong>
      {selectedSummary.count>0&&<span>Внесено {selectedSummary.entered.toLocaleString('uk-UA')} · Враховано у відпустках {selectedSummary.accounted.toLocaleString('uk-UA')}</span>}
      {selectedSummary.incomplete&&<small>Залишки внесено не за всі поточні чи минулі періоди</small>}</div>}
    <div className="leave-section-heading"><button type="button" className="secondary-button" disabled={!periods || (!periods.length && type !== 'oms_service_additional')} onClick={() => { editorPeriods.current=periods??[]; setEditing(true) }}>Внести або змінити залишки</button>
      </div>
    {data?.error && <p role="alert">{data.error} <button type="button" onClick={refresh}>Повторити</button></p>}
    {periods?.length===0 ? <p className="leave-muted">Періоди ще не внесено. Натисніть «Внести або змінити залишки», щоб додати їх.</p> : <DictionaryTable label="Залишки за періодами" className="leave-table" columns={columns} loading={!data}
      empty={!periods?.length ? 'Немає облікових періодів для вибраного виду.' : undefined} error={data?.error} onRetry={refresh}>
      {groups.map(group => {
        const entries = periods?.filter(period => period.accountingBasis === group.basis)
        if (!entries?.length) return null
        return <Fragment key={group.basis}>
          <tr className="leave-group"><th id={groupId + group.basis} colSpan={5}>{group.label}</th></tr>
          {entries.map(period => <tr key={period.periodStart}>
            <td className="leave-period" aria-describedby={groupId + group.basis}>{periodLabel(period)}{period.periodStart>today&&<small className="leave-period-note">Майбутній період</small>}</td>
            <td className="leave-days-column">{period.status === 'confirmed'
              ? <strong>{period.confirmedDays} {dayLabel(BigInt(period.confirmedDays))}</strong>
              : <span className="leave-muted">Не внесено</span>}</td>
            <td className="leave-days-column">{period.status === 'confirmed' ? balanceMap.get(period.id)?.usedDays ?? '–' : '–'}</td>
            <td className="leave-days-column">{period.status === 'confirmed' ? <strong>{balanceMap.get(period.id)?.availableDays ?? '–'}</strong> : '–'}</td>
            <td>{period.status === 'confirmed' && <div className="registry-row-actions">
              <button type="button" className="table-action leave-icon-action leave-remove" title="Вилучити підтвердження"
                aria-label={'Вилучити підтвердження за період ' + periodLabel(period)}
                onClick={() => { setDeleteError(''); setDeleting(period) }}><Trash2 size={16} aria-hidden="true" /></button>
            </div>}</td>
          </tr>)}
        </Fragment>
      })}
    </DictionaryTable>}
    {showJournal && data?.records && <LeaveJournal records={data.records} onRegister={() => setRegistering(true)} navigationGuard={navigationGuard} onChanged={refresh} />}
    {registering && <LeaveRegistrationForm employeeId={employeeId} employeeName={employeeName} hireDate={hireDate} initialType={type} navigationGuard={navigationGuard}
      onClose={() => setRegistering(false)} onBalances={selectedType => { setRegistering(false); setType(selectedType); setState(undefined); setEditing(true); refresh() }}
      onSaved={savedType => { setRegistering(false); refresh(); onRegistered?.(); notifySystemToast('success', 'Відпустку зареєстровано', isPeriodLeave(savedType) ? 'Залишки оновлено.' : 'Журнал оновлено.') }} />}
    {editing && (editorPeriods.current??periods) && <BalanceEditor employeeId={employeeId} employeeName={employeeName} periods={editorPeriods.current??periods!} type={type} typeLabel={labels[type]} navigationGuard={navigationGuard}
      onClose={() => { setEditing(false); editorPeriods.current=null }} onSaved={() => {
        setEditing(false)
        editorPeriods.current=null
        refresh()
        notifySystemToast('success', 'Залишки збережено', 'Підтверджені величини оновлено.')
      }} />}
    {deleting && <ConfirmDialog title="Вилучити підтвердження?" confirmLabel="Вилучити" error={deleteError}
      message={`Підтверджені дні за період ${periodLabel(deleting)} буде вилучено. Період знову відображатиметься як «Не внесено».`}
      onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
  </section>
}
