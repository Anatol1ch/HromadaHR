import { useEffect, useRef, useState, type RefObject } from 'react'
import { Info, Plus, Wallet } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { LeavePeriodAttentionItem, LeavePeriodAttentionSummary, LeaveType } from '../../../shared/leave'
import { fullName, personnelMessage } from '../../employees/model'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import Alert from '../Alert'
import DataState from '../DataState'
import LeaveAccountingTable from './LeaveAccountingTable'
import LeaveJournal from './LeaveJournal'
import LeaveRegistrationForm from './LeaveRegistrationForm'
import LeaveTypeManagerDialog from './LeaveTypeManagerDialog'
import { leavePeriodAttentionTarget } from './attention'
import useAccountingDate from './useAccountingDate'
import { leaveRecordBelongsToEmployee, type LeaveJournalContext, type RegistrationHistory } from './registry'
import { notifySystemToast } from '../SystemToastHost'
import { formatDate } from '../../lib/dates'
import type { LeaveWorkspaceData } from './workspace-data'

type LoadedWorkspace = {
  key: string
  data?: LeaveWorkspaceData
  attention?: LeavePeriodAttentionSummary
  attentionError?: string
  error?: string
}
type AttentionTarget = { periodStart: string | null; requestId: number } | null

/** One employee work page: all leave balances followed directly by the existing journal. */
export default function ProfileLeaveWorkbench({ employee, navigationGuard, revision }: {
  employee: EmployeeCard; navigationGuard: RefObject<NavigationGuard>; revision: number
}) {
  const employeeId = employee.id
  const [localRevision, setLocalRevision] = useState(0)
  const refreshRevision = revision + localRevision
  const refresh = () => setLocalRevision(value => value + 1)
  const { today, throughDate } = useAccountingDate()
  const readKey = JSON.stringify([employeeId, refreshRevision, throughDate, today])
  const [loaded, setLoaded] = useState<LoadedWorkspace>()
  const [attentionTarget, setAttentionTarget] = useState<AttentionTarget>(null)
  const attentionRequest = useRef(0)
  const [managerType, setManagerType] = useState<LeaveType | null>(null)
  const [managerOpener, setManagerOpener] = useState<HTMLElement | null>(null)
  const [preferredType, setPreferredType] = useState<LeaveType>('annual_main')
  const [creating, setCreating] = useState(false)
  const [context, setContext] = useState<LeaveJournalContext | null>(null)
  const [contextSource, setContextSource] = useState<'registration' | 'filter' | null>(null)
  const registrationOpener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const historyRegion = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    setLoaded(undefined)
    async function load() {
      try {
        const api = window.hromadaHR.leave
        const [balances, records, rights, attention, ...proposals] = await Promise.all([
          api.getBalances(employeeId), api.listRecords(employeeId), api.listRights(employeeId), api.getPeriodAttention(today),
          ...(['annual_main', 'oms_service_additional', 'children_social_additional'] as const)
            .map(type => api.proposePeriods(employeeId, throughDate, type)),
        ] as const)
        if (!active) return
        if (!balances.ok) { setLoaded({ key: readKey, error: personnelMessage(balances.error.code) }); return }
        if (!records.ok) { setLoaded({ key: readKey, error: personnelMessage(records.error.code) }); return }
        if (!rights.ok) { setLoaded({ key: readKey, error: personnelMessage(rights.error.code) }); return }
        const failedProposal = proposals.find(result => !result.ok)
        if (failedProposal && !failedProposal.ok) { setLoaded({ key: readKey, error: personnelMessage(failedProposal.error.code) }); return }
        setLoaded({ key: readKey, data: {
          employeeId, balances: balances.data, rights: rights.data,
          records: records.data.filter(record => leaveRecordBelongsToEmployee(record, employeeId)),
          proposals: proposals.flatMap(result => result.ok ? result.data : []),
        }, attention: attention.ok ? attention.data : undefined,
        attentionError: attention.ok ? undefined : personnelMessage(attention.error.code) })
      } catch {
        if (active) setLoaded({ key: readKey, error: 'Не вдалося завантажити відомості про відпустки.' })
      }
    }
    void load()
    return () => { active = false }
  }, [employeeId, readKey, throughDate, today])

  const current = loaded?.key === readKey ? loaded : undefined
  const data = current?.data
  const attentionItems = current?.attention?.items.filter(item => item.employeeId === employeeId) ?? []
  const history: RegistrationHistory = {
    records: data?.records ?? [], error: current?.error ?? '', loading: !current,
    retry: refresh, suspended: contextSource === 'registration',
    open: next => {
      if (next.employeeId !== employeeId) return
      setContext(next)
      setContextSource('registration')
      setManagerType(null)
      setAttentionTarget(null)
      refresh()
      focusHistory()
    },
  }

  function focusHistory() {
    requestAnimationFrame(() => {
      historyRegion.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      historyRegion.current?.focus()
    })
  }
  function manage(type: LeaveType, opener: HTMLElement, target: AttentionTarget = null) {
    navigationGuard.current(() => {
      setPreferredType(type)
      setManagerOpener(opener)
      setAttentionTarget(target)
      setManagerType(type)
    })
  }
  function openAttention(item: LeavePeriodAttentionItem, opener: HTMLElement) {
    const target = leavePeriodAttentionTarget(item)
    manage(target.type, opener, target.reviewRight ? null
      : { periodStart: target.periodStart, requestId: ++attentionRequest.current })
  }
  function openJournalContext(next: LeaveJournalContext) {
    setManagerType(null)
    setAttentionTarget(null)
    setContext(next)
    setContextSource('filter')
    focusHistory()
  }
  function resumeJournalContext() {
    setContext(null)
    setContextSource(null)
    if (contextSource === 'registration') requestAnimationFrame(() => heading.current?.focus())
  }
  function register() {
    registrationOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    navigationGuard.current(() => setCreating(true))
  }
  function closeRegistration() {
    setCreating(false)
    if (contextSource === 'registration') { setContext(null); setContextSource(null) }
    refresh()
    requestAnimationFrame(() => {
      if (registrationOpener.current?.isConnected) registrationOpener.current.focus()
      else heading.current?.focus()
    })
  }

  return <div className="profile-leave-workbench">
    <header className="profile-leave-toolbar">
      <h3 ref={heading} tabIndex={-1}><Wallet size={20} aria-hidden="true"/>Відпустки</h3>
      <button type="button" className="primary-button" disabled={creating} onClick={register}>
        <Plus size={17} aria-hidden="true"/>Зареєструвати відпустку
      </button>
    </header>

    <LeavePeriodAttentionNotice loading={!current} error={current?.attentionError} items={attentionItems}
      onOpen={openAttention} onRetry={refresh}/>

    {current?.error
      ? <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>{current.error}</Alert>
      : !data ? <DataState kind="loading" message="Завантаження обліку відпусток…"/>
        : <LeaveAccountingTable data={data} throughDate={throughDate} today={today} attentionItems={attentionItems}
          onManage={manage}/>}

    <section ref={historyRegion} className="leave-history-section" tabIndex={-1} aria-label="Історія відпусток">
      {current?.error ? <Alert variant="error" action={<button type="button" onClick={refresh}>Повторити</button>}>
        Історія поки недоступна. {current.error}
      </Alert> : !current ? <DataState kind="loading" compact message="Завантаження історії відпусток…"/> :
        <LeaveJournal employeeId={employeeId} records={history.records} navigationGuard={navigationGuard}
          onChanged={refresh} history={history} context={context} onResume={resumeJournalContext}
          contextReturnLabel={contextSource === 'registration' ? 'Повернутися до оформлення' : 'Показати всю історію'}
          allowContextActions={contextSource !== 'registration'}/>}
    </section>

    {managerType && <LeaveTypeManagerDialog key={managerType} type={managerType} employeeId={employeeId} data={data}
      employeeName={fullName(employee)} hireDate={employee.hireDate} throughDate={throughDate} today={today}
      attentionItems={attentionItems} attentionTarget={attentionTarget} refreshRevision={refreshRevision}
      navigationGuard={navigationGuard} returnFocus={managerOpener} onAttentionTargetHandled={() => setAttentionTarget(null)}
      onChanged={refresh} onOpenHistory={openJournalContext} onClose={() => { setManagerType(null); setAttentionTarget(null) }}/>}

    {creating && <LeaveRegistrationForm employeeId={employeeId} employeeName={fullName(employee)} hireDate={employee.hireDate}
      initialType={preferredType} navigationGuard={navigationGuard} history={history} returnFocus={registrationOpener.current}
      onClose={closeRegistration} onSaved={() => {
        closeRegistration()
        notifySystemToast('success', 'Відпустку зареєстровано', 'Облік та історію оновлено.')
      }}/ >}
  </div>
}

function LeavePeriodAttentionNotice({ loading, error, items, onOpen, onRetry }: {
  loading: boolean; error?: string; items: LeavePeriodAttentionItem[]
  onOpen: (item: LeavePeriodAttentionItem, opener: HTMLElement) => void; onRetry: () => void
}) {
  if (loading) return null
  if (error) return <Alert variant="info" action={<button type="button" onClick={onRetry}>Повторити</button>}>
    Не вдалося перевірити дії, потрібні для обліку відпусток. {error}
  </Alert>
  if (!items.length) return null
  return <section className="leave-attention-list" aria-label="Потрібні дії щодо відпусток">
    <div className="leave-attention-list-heading"><Info size={16} aria-hidden="true"/><strong>Потрібні дії</strong></div>
    {items.map(item => <div className="leave-attention-item" key={`${item.leaveType}/${item.periodStart ?? item.reviewReason}`}>
      <span>{attentionDescription(item)}</span>
      <button type="button" className="secondary-button" onClick={event => onOpen(item, event.currentTarget)}>
        {item.reviewReason === 'right' ? 'Перевірити право' : item.kind === 'needs_confirmation' && item.leaveType === 'children_social_additional' ? 'Обрати тривалість' : 'Керувати'}
      </button>
    </div>)}
  </section>
}

function attentionDescription(item: LeavePeriodAttentionItem) {
  const name = item.leaveType === 'annual_main' ? 'Щорічна основна'
    : item.leaveType === 'oms_service_additional' ? 'Додаткова за стаж ОМС' : 'Додаткова на дітей'
  if (item.reviewReason === 'right') return `Перевірте право на відпустку «${name}».`
  if (item.reviewReason === 'initial_balance') return `Внесіть початковий залишок: ${name}${item.leaveType === 'children_social_additional' && item.periodStart ? ` за ${item.periodStart.slice(0, 4)} рік` : ''}.`
  if (item.reviewReason === 'service_data') return `Перевірте дані стажу для відпустки «${name}».`
  if (item.leaveType === 'children_social_additional') return `Оберіть 10 або 17 днів для ${item.periodStart?.slice(0, 4) ?? ''} року.`
  const period = item.periodStart && item.periodEnd ? ` ${formatDate(item.periodStart)}–${formatDate(item.periodEnd)}` : ''
  const recommendation = item.suggestedDays === null ? '' : ` · пропозиція ${item.suggestedDays} к. дн.`
  return `Підтвердьте новий період${period}: ${name}${recommendation}.`
}
