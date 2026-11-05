import { useEffect, useRef, useState, type RefObject } from 'react'
import { leaveTypes, type LeaveType, type ConfirmedLeavePeriod, type ProposedLeavePeriod } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import { todayIsoDate } from '../../lib/dates'
import ConfirmDialog from '../ConfirmDialog'
import DictionaryTable from '../DictionaryTable'
import Select from '../Select'
import { notifySystemToast } from '../SystemToastHost'
import useUnsavedChanges, { type NavigationGuard } from '../employees/useUnsavedChanges'
import BalanceEditor, { basisLabels, periodLabel } from './BalanceEditor'
import { cutoff, type Period } from './draft'

const labels = {
  annual_main: 'Щорічна основна',
  oms_service_additional: 'Додаткова за стаж служби в ОМС',
  children_social_additional: 'Додаткова соціальна на дітей',
}
const options = leaveTypes.map(value => ({ value, label: labels[value] }))
const columns = [{ label: 'Обліковий період' }, { label: 'Основа обліку' }, { label: 'Підтверджено' }, { label: 'Дії' }]

export default function LeaveBalances({ employeeId, hireDate, navigationGuard }: {
  employeeId: string; hireDate: string; navigationGuard: RefObject<NavigationGuard>
}) {
  const [type, setType] = useState<LeaveType>('annual_main')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState<ConfirmedLeavePeriod | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [manualProposals, setManualProposals] = useState<ProposedLeavePeriod[]>([])
  const [state, setState] = useState<{ key: string; periods?: Period[]; error?: string }>()
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
        const [saved, proposals] = await Promise.all([
          api.listPeriods(employeeId),
          api.proposePeriods(employeeId, today > cutoff ? today : cutoff, type),
        ])
        if (!active) return
        if (!saved.ok) { setState({ key, error: personnelMessage(saved.error.code) }); return }
        if (!proposals.ok) { setState({ key, error: personnelMessage(proposals.error.code) }); return }
        const merged = new Map<string, Period>(proposals.data.map(period => [period.periodStart, period]))
        for (const period of saved.data) if (period.leaveType === type) merged.set(period.periodStart, period)
        setState({ key, periods: [...merged.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)) })
      } catch {
        if (active) setState({ key, error: 'Не вдалося завантажити залишки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, key, type])

  const confirmed = periods?.filter(period => period.status === 'confirmed') ?? []
  const sum = confirmed.reduce((total, period) => total + BigInt(period.confirmedDays), 0n)
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
    <div className="leave-actions">
      <div className="leave-select"><Select label="Вид відпустки" value={type} options={options} advanceOnSelect={false}
        onChange={value => { setState(undefined); setType(value as LeaveType) }} /></div>
      <button className="primary-button" type="button" disabled={!periods || (!periods.length && type !== 'oms_service_additional')}
        onClick={() => setEditing(true)}>{confirmed.length ? 'Редагувати залишки' : 'Внести залишки'}</button>
    </div>
    {periods && <div aria-live="polite">
      <strong>Сума підтверджених днів: {confirmed.length ? sum.toLocaleString('uk-UA') : 'Не внесено'}</strong>
      <p>{periods.some(period => period.status === 'proposed') ? 'Є непідтверджені періоди. Сума може бути неповною. ' : ''}
        Сума показує внесені величини без обліку використаних відпусток.</p>
    </div>}
    <DictionaryTable label="Залишки за періодами" columns={columns} loading={!data}
      empty={!periods?.length ? 'Немає облікових періодів для вибраного виду.' : undefined} error={data?.error} onRetry={refresh}>
      {periods?.map(period => <tr key={period.periodStart}>
        <td>{periodLabel(period)}</td>
        <td>{basisLabels[period.accountingBasis]}</td>
        <td>{period.status === 'confirmed' ? period.confirmedDays + ' дн.' : 'Не внесено'}</td>
        <td>{period.status === 'confirmed' && <button type="button" className="secondary-button danger-action"
          aria-label={'Вилучити підтвердження за період ' + periodLabel(period)} onClick={() => { setDeleteError(''); setDeleting(period) }}>Вилучити</button>}</td>
      </tr>)}
    </DictionaryTable>
    {editing && periods && <BalanceEditor employeeId={employeeId} periods={periods} type={type} navigationGuard={navigationGuard}
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
