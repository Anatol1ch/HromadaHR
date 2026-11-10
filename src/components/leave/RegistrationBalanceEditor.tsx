import { useEffect, useState, type RefObject } from 'react'
import type { PeriodLeaveType } from '../../../shared/leave'
import { personnelMessage } from '../../employees/model'
import Alert from '../Alert'
import DataState from '../DataState'
import Modal from '../Modal'
import { notifySystemToast } from '../SystemToastHost'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import BalanceEditor from './BalanceEditor'
import { historicalBalancePeriods, type Period } from './draft'
import { leaveLabels } from './presentation'

export default function RegistrationBalanceEditor({ employeeId, employeeName, type, throughDate, navigationGuard, onReturn }: {
  employeeId: string; employeeName?: string; type: PeriodLeaveType; throughDate: string
  navigationGuard: RefObject<NavigationGuard>; onReturn: (saved: boolean) => void
}) {
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [data, setData] = useState<{ periods: Period[]; historicalOnly: boolean; serviceStart?: string | null }>()
  useEffect(() => {
    let active = true
    const api = window.hromadaHR.leave
    void Promise.all([api.listPeriods(employeeId), api.proposePeriods(employeeId, throughDate, type), api.listRights(employeeId),
      type === 'oms_service_additional' ? api.getServiceLeaveStart(employeeId) : null])
      .then(([saved, proposed, rights, serviceStart]) => {
        if (!active) return
        if (!saved.ok || !proposed.ok || !rights.ok) {
          setError(personnelMessage(!saved.ok ? saved.error.code : !proposed.ok ? proposed.error.code : !rights.ok ? rights.error.code : 'UNAVAILABLE'))
          return
        }
        if (serviceStart && !serviceStart.ok) { setError(personnelMessage(serviceStart.error.code)); return }
        const historicalOnly = rights.data.some(right => right.leaveType === type && right.status === 'no_right')
        const merged = new Map<string, Period>(proposed.data.map(period => [period.periodStart, period]))
        for (const period of saved.data) if (period.leaveType === type) merged.set(period.periodStart, period)
        const periods = [...merged.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
        setData({ historicalOnly, periods: historicalOnly ? historicalBalancePeriods(periods) : periods, serviceStart: serviceStart?.data })
      }).catch(() => { if (active) setError('Не вдалося завантажити залишки та статус права.') })
    return () => { active = false }
  }, [employeeId, type, throughDate, retry])

  if (data) return <BalanceEditor employeeId={employeeId} employeeName={employeeName} periods={data.periods}
    type={type} typeLabel={leaveLabels[type]} navigationGuard={navigationGuard} historicalOnly={data.historicalOnly}
    serviceStart={data.serviceStart} closeLabel="Повернутися до оформлення" onClose={() => onReturn(false)} onSaved={daysWritten => {
      if (!daysWritten) notifySystemToast('success', 'Дату набуття права збережено', 'Пропозиції періодів оновлено.')
      onReturn(daysWritten)
    }} />

  return <Modal title={'Залишки – ' + leaveLabels[type]} description={employeeName} onClose={() => onReturn(false)}
    footer={<button type="button" className="secondary-button" onClick={() => onReturn(false)}>Повернутися до оформлення</button>}>
    {error ? <Alert variant="error" action={<button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Повторити</button>}>{error}</Alert>
      : <DataState kind="loading" message="Завантаження залишків…"/>}
  </Modal>
}
