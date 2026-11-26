import { CalendarDays, History } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { LeavePeriodAttentionItem, LeaveType, PeriodLeaveType } from '../../../shared/leave'
import Alert from '../Alert'
import DataState from '../DataState'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import Modal from '../Modal'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import LeaveBalances from './LeaveBalances'
import LeaveRights from './LeaveRights'
import LeaveTypeIcon from './LeaveTypeIcon'
import { leaveBalanceOverviewMetrics, leaveOverviewProposals } from './summary'
import { leaveWorkspaceLabels } from './presentation'
import type { LeaveJournalContext } from './registry'
import type { LeaveWorkspaceData } from './workspace-data'

const periodTypes = ['annual_main', 'oms_service_additional', 'children_social_additional'] as const
type PeriodType = typeof periodTypes[number]
type ManagerPane = 'summary' | 'periods'

export default function LeaveTypeManagerDialog({ type, employeeId, data, employeeName, hireDate, throughDate, today, attentionItems, attentionTarget, refreshRevision, navigationGuard, returnFocus, onAttentionTargetHandled, onChanged, onOpenHistory, onClose }: {
  type: LeaveType
  employeeId: string
  data?: LeaveWorkspaceData
  employeeName: string
  hireDate: string
  throughDate: string
  today: string
  attentionItems: LeavePeriodAttentionItem[]
  attentionTarget?: { periodStart: string | null; requestId: number } | null
  refreshRevision: number
  navigationGuard: RefObject<NavigationGuard>
  returnFocus: HTMLElement | null
  onAttentionTargetHandled: () => void
  onChanged: () => void
  onOpenHistory: (context: LeaveJournalContext) => void
  onClose: () => void
}) {
  const [pane, setPane] = useState<ManagerPane>(attentionTarget ? 'periods' : 'summary')
  const status = data?.rights.find(right => right.leaveType === type)?.status ?? 'unknown'
  const proposals = data ? leaveOverviewProposals(type, status, data.proposals, throughDate, today) : []
  const metrics = data ? leaveBalanceOverviewMetrics(type, status, data.balances, proposals, data.records,
    data.employeeId, today.slice(0, 4), today, attentionItems.find(item => item.leaveType === type)) : undefined
  const isPeriodic = periodTypes.includes(type as PeriodType)

  function requestClose() {
    navigationGuard.current(onClose)
  }
  function changePane(next: ManagerPane) {
    navigationGuard.current(() => setPane(next))
  }
  function openHistory() {
    navigationGuard.current(() => onOpenHistory({ employeeId, type, year: today.slice(0, 4) }))
  }

  return <Modal title={leaveWorkspaceLabels[type]} description={employeeName} headerIcon={<LeaveTypeIcon type={type}/>} size="wide"
    className="leave-design-dialog leave-management-dialog" returnFocus={returnFocus} onClose={requestClose}>
    {!data ? <DataState kind="loading" compact message="Завантаження облікових даних…"/> : pane === 'summary' ? <>
      <LeaveRights employeeId={employeeId} leaveType={type} navigationGuard={navigationGuard} onSaved={onChanged}/>
      <InfoSection className="leave-manager-accounting" title="Облік днів" icon={<CalendarDays size={17} aria-hidden="true"/>}>
        {!metrics ? <p className="leave-muted">Завантаження показників…</p> : <>
          <dl className="info-grid info-grid-three">
            <InfoItem label={isPeriodic ? 'Підтверджено' : type === 'study_leave' ? 'Використано за рік' : `Норматив / використано за ${today.slice(0, 4)} рік`}
              value={isPeriodic ? metrics.confirmed.value : type === 'study_leave' ? metrics.used.value : `${metrics.confirmed.value} / ${metrics.used.value}`}
              detail={isPeriodic ? metrics.confirmed.detail?.join(' · ') : undefined}/>
            {isPeriodic && <InfoItem label="Використано" value={metrics.used.value} detail={metrics.used.detail?.join(' · ')}/>}
            <InfoItem label={isPeriodic ? 'Залишок' : type === 'study_leave' ? 'Доступність' : 'Стан за рік'}
              value={metrics.remaining.value} emphasis={metrics.remaining.emphasis}/>
          </dl>
          {metrics.note && <p className="leave-manager-note">{metrics.note}</p>}
          {type === 'chernobyl_special_leave' && <p className="leave-manager-note">Реєстрація належить року її початку.</p>}
        </>}
      </InfoSection>
      {isPeriodic
        ? <div className="leave-manager-actions"><button type="button" className="primary-button" onClick={() => changePane('periods')}>Керувати періодами</button></div>
        : <div className="leave-manager-actions"><button type="button" className="primary-button" disabled={!data} onClick={openHistory}>
          <History size={16} aria-hidden="true"/>Відкрити історію за {today.slice(0, 4)} рік
        </button></div>}
    </> : isPeriodic ? <LeaveBalances key={type} employeeId={data.employeeId} employeeName={employeeName} hireDate={hireDate}
      type={type as PeriodLeaveType} navigationGuard={navigationGuard} refreshRevision={refreshRevision} rightsReady={!!data.rights}
      historicalOnly={status === 'no_right'} childrenRightStatus={status === 'has_right' || status === 'no_right' ? status : undefined}
      attentionTarget={attentionTarget} onAttentionTargetHandled={onAttentionTargetHandled} onChanged={onChanged} modalMode
      onBack={() => changePane('summary')}/>
      : <Alert variant="info">Для цього виду окремий редактор періодів не застосовується.</Alert>}
  </Modal>
}
