import useAccountingDate from './useAccountingDate'
import { balanceSummary, formatLeaveDays } from './summary'
import { leaveLabels as labels } from './presentation'
import type { PeriodBalance } from '../../../shared/leave'
import { Fragment, useEffect, useId, useRef, useState, type RefObject, type ReactNode } from 'react'
import { CalendarDays, Pencil, Trash2 } from 'lucide-react'
import { type PeriodLeaveType, type ConfirmedLeavePeriod, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import { formatDate } from '../../lib/dates'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import LeaveTypeIcon from './LeaveTypeIcon'
import ConfirmDialog from '../ConfirmDialog'
import DictionaryTable from '../DictionaryTable'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import BalanceEditor, { periodLabel } from './BalanceEditor'
import { historicalBalancePeriods, type Period } from './draft'

const columns = [{ label: 'Обліковий період', width: '38%' },
  { label: 'Внесено днів', width: '18%', className: 'leave-days-column' }, { label: 'Враховано у відпустках', width: '18%', className: 'leave-days-column' },
  { label: 'Залишилося', width: '18%', className: 'leave-days-column' }, { label: 'Дії', width: '8%', className: 'leave-actions-column' }]
const groups = [
  { basis: 'initial_balance', label: 'Початкові залишки' },
  { basis: 'confirmed_entitlement', label: 'Права за новими періодами' },
] as const
export default function LeaveBalances({ employeeId, hireDate, navigationGuard, employeeName, type, refreshRevision, rightsReady, historicalOnly, rightBadge }: {
  employeeId: string
  employeeName: string
  hireDate: string
  type: PeriodLeaveType
  navigationGuard: RefObject<NavigationGuard>
  refreshRevision: number
  rightsReady: boolean
  historicalOnly: boolean
  rightBadge?: ReactNode
}) {
  const {today,throughDate}=useAccountingDate()
  const groupId = useId()
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<ConfirmedLeavePeriod | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [manualProposals, setManualProposals] = useState<ProposedLeavePeriod[]>([])
  const [state, setState] = useState<{ key: string; periods?: Period[]; balances?: PeriodBalance[]; proposals?: ProposedLeavePeriod[]; serviceStart?: string | null; error?: string }>()
  const key = JSON.stringify([employeeId, hireDate, revision, refreshRevision, throughDate])
  const data = state?.key === key ? state : undefined
  const selectedPeriods = data?.periods?.filter(period => period.leaveType === type)
  const periods = selectedPeriods && (type === 'oms_service_additional' ?
    [...selectedPeriods, ...manualProposals.filter(proposal => !selectedPeriods.some(period => period.periodStart === proposal.periodStart))]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)) : selectedPeriods)
  const owner = useRef<HTMLElement>(null)
  const editorPeriods = useRef<Period[] | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const focusAfterRefresh = useRef(false)
  const pending = useRef(false)
  const alive = useRef(false)
  useUnsavedChanges(false, pending, navigationGuard, owner)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let active = true
    const api = window.hromadaHR.leave
    async function load() {
      try {
        const [saved, proposals, balances, serviceStart] = await Promise.all([
          api.listPeriods(employeeId),
          api.proposePeriods(employeeId, throughDate, type),
          api.getBalances(employeeId),
          type === 'oms_service_additional' ? api.getServiceLeaveStart(employeeId) : null,
        ])
        if (!active) return
        if (!saved.ok) { setState({ key, error: personnelMessage(saved.error.code) }); return }
        if (!proposals.ok) { setState({ key, error: personnelMessage(proposals.error.code) }); return }
        if (serviceStart && !serviceStart.ok) { setState({ key, error: personnelMessage(serviceStart.error.code) }); return }
        const proposed = proposals.data
        if (!balances.ok) { setState({ key, error: personnelMessage(balances.error.code) }); return }
        const merged = new Map<string, Period>(proposed.map(period => [period.leaveType + period.periodStart, period]))
        for (const period of saved.data) merged.set(period.leaveType + period.periodStart, period)
        setState({ key, serviceStart: serviceStart?.data, proposals: proposed, balances: balances.data, periods: [...merged.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)) })
      } catch {
        if (active) setState({ key, error: 'Не вдалося завантажити залишки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, key, throughDate, type])

  useEffect(() => {
    if (!data || !focusAfterRefresh.current) return
    focusAfterRefresh.current = false
    if (document.activeElement === document.body) editButton.current?.focus()
  }, [data])

  const editorCandidates = periods && (historicalOnly ? historicalBalancePeriods(periods) : periods)
  const visiblePeriods = historicalOnly || type === 'children_social_additional' ? periods?.filter(period => period.status === 'confirmed') : periods
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
      focusAfterRefresh.current = true
      refresh()
      notifySystemToast('success', 'Підтвердження вилучено', periodLabel(period))
    } catch {
      if (alive.current) setDeleteError('Не вдалося вилучити підтвердження. Повторіть спробу.')
    } finally { pending.current = false }
  }

  const selectedSummary=balanceSummary(type,data?.balances??[],type === 'children_social_additional' ? [] : (data?.proposals??[]).filter(p=>p.periodStart<=throughDate))
  return <section ref={owner} className="leave-layout" aria-label="Залишки відпусток">
    <InfoSection title={labels[type]} icon={<LeaveTypeIcon type={type}/>} action={<div className="leave-summary-actions">
      {rightBadge}
      <button ref={editButton} type="button" className="secondary-button"
        disabled={!editorCandidates || (!editorCandidates.length && type !== 'oms_service_additional')}
        onClick={() => { editorPeriods.current = editorCandidates ?? []; setEditing(true) }}>
        <Pencil size={16} aria-hidden="true"/>{selectedSummary.count > 0 ? 'Редагувати залишки' : type === 'children_social_additional' ? 'Додати рік' : historicalOnly ? 'Внести історичні залишки' : 'Внести залишки'}
      </button>
      {type === 'children_social_additional' && selectedSummary.count > 0 && <button type="button" className="secondary-button" disabled={!editorCandidates?.some(p => p.status === 'proposed')}
        onClick={() => { editorPeriods.current = editorCandidates ?? []; setEditing(true) }}>Додати рік</button>}
    </div>}>
      {data?.error ? <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{data.error}</Alert>
        : !data ? <DataState kind="loading" compact message="Завантаження залишків…"/>
        : selectedSummary.count === 0 ? !historicalOnly && <div className="info-item"><DataState kind="empty" compact message="Залишки ще не внесено."/></div>
        : <>
          <dl className="leave-metric-grid leave-metric-grid-two">
            <InfoItem label={historicalOnly ? 'Історичний залишок' : selectedSummary.incomplete ? 'Доступно за внесеними періодами' : 'Доступно'}
              value={formatLeaveDays(selectedSummary.remaining)} emphasis/>
            <InfoItem label="Внесено до обліку" value={formatLeaveDays(selectedSummary.entered)}/>
            <InfoItem label="Враховано у відпустках" value={formatLeaveDays(selectedSummary.accounted)}/>
          </dl>
          {selectedSummary.incomplete && !historicalOnly && <Alert variant="warning">Залишки внесено лише за частиною періодів.</Alert>}
        </>}
      {data?.serviceStart !== undefined && <dl className="info-grid">
        <InfoItem label="Дата набуття права за стаж" value={data.serviceStart ? formatDate(data.serviceStart) : 'Не внесено'}/>
      </dl>}
    </InfoSection>
    {(!historicalOnly || !!visiblePeriods?.length) && <section className="leave-balances-table" aria-label="Облікові періоди">
      <header className="leave-section-heading"><CalendarDays size={17} aria-hidden="true"/><h3>Облікові періоди</h3></header>
    {!data?.error && <DictionaryTable label="Залишки за періодами" className="leave-table leave-period-table" columns={columns} loading={!data}
      empty={!visiblePeriods?.length ? 'Немає облікових періодів для вибраного виду.' : undefined}>
      {groups.map(group => {
        const entries = visiblePeriods?.filter(period => period.accountingBasis === group.basis)
        if (!entries?.length) return null
        return <Fragment key={group.basis}>
          <tr className="leave-group"><th id={groupId + group.basis} colSpan={5}>{historicalOnly && group.basis === 'confirmed_entitlement' ? 'Раніше підтверджені періоди' : group.label}</th></tr>
          {entries.map(period => <tr key={period.periodStart}>
            <td className="leave-period" aria-describedby={groupId + group.basis}>{type === 'children_social_additional' ? period.periodStart.slice(0, 4) + ' рік' : periodLabel(period)}{period.periodStart>today&&<small className="leave-period-note">Майбутній період</small>}</td>
            <td className="leave-days-column">{period.status === 'confirmed'
              ? <strong>{formatLeaveDays(period.confirmedDays)}</strong>
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
    </section>}
    {editing && (editorPeriods.current??periods) && <BalanceEditor employeeId={employeeId} employeeName={employeeName} periods={editorPeriods.current??periods!} type={type} typeLabel={labels[type]} navigationGuard={navigationGuard} rightsReady={rightsReady} historicalOnly={historicalOnly}
      serviceStart={data?.serviceStart} manualProposals={manualProposals}
      onClose={dateWritten => {
        setEditing(false)
        editorPeriods.current = null
        if (dateWritten) { focusAfterRefresh.current = true; refresh() }
      }} onSaved={daysWritten => {
        setEditing(false)
        editorPeriods.current=null
        focusAfterRefresh.current = true
        refresh()
        notifySystemToast('success', daysWritten ? 'Залишки збережено' : 'Дату набуття права збережено',
          daysWritten ? 'Підтверджені величини оновлено.' : 'Пропозиції періодів оновлено.')
      }} />}
    {deleting && <ConfirmDialog title="Вилучити підтвердження?" confirmLabel="Вилучити" error={deleteError}
      message={`Підтверджені дні за період ${periodLabel(deleting)} буде вилучено. Підтвердження можна внести повторно за чинними правилами.`}
      onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
  </section>
}
