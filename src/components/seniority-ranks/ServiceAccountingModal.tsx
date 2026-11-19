import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { CalendarCheck, Calculator, Check, ClipboardCheck, Clock3, History } from 'lucide-react'
import type { ServiceProjection } from '../../../shared/service-calculations'
import type { ServiceAccounting } from '../../../shared/seniority-ranks'
import type { NavigationGuard } from '../employees/useUnsavedChanges'
import useUnsavedChanges from '../employees/useUnsavedChanges'
import Modal from '../Modal'
import InfoSection from '../InfoSection'
import Alert from '../Alert'
import DataState from '../DataState'
import DateField from '../DateField'
import ValidatedInput from '../ValidatedInput'
import ConfirmDialog from '../ConfirmDialog'
import { notifySystemToast } from '../SystemToastHost'
import { formatDate, formatDateInput, isIsoCalendarDate, todayIsoDate } from '../../lib/dates'
import { personnelMessage } from '../../employees/model'
import { serviceAccountingDraftInput, serviceAccountingReasonMessage, createServiceAccountingDrafts, type ServiceAccountingMode, type ServiceAccountingDrafts } from './service-accounting-form'
import { serviceDurationLabel } from './service-accounting-model'
import ServicePeriodEditor from './ServicePeriodEditor'

const modes: { value: ServiceAccountingMode; title: string; description: string; icon: typeof CalendarCheck }[] = [
  { value: 'continuous', title: 'Дата початку служби', description: 'Безперервний період служби', icon: CalendarCheck },
  { value: 'periods', title: 'Періоди служби', description: 'Декілька зарахованих періодів', icon: History },
  { value: 'snapshot', title: 'Стаж на дату', description: 'Раніше визначена тривалість стажу', icon: ClipboardCheck },
]

export default function ServiceAccountingModal({ employeeId, hireDate, navigationGuard, returnFocus, onClose, onSaved, onCleared, onBusyChange }: {
  employeeId: string
  hireDate: string
  navigationGuard: RefObject<NavigationGuard>
  returnFocus: HTMLElement | null
  onClose: () => void
  onSaved: (value: ServiceAccounting) => void
  onCleared: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const today = todayIsoDate()
  const id = useId()
  const owner = useRef<HTMLDivElement>(null)
  const pending = useRef(false)
  const alive = useRef(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState<{ value: ServiceAccounting | null; mode: ServiceAccountingMode; drafts: ServiceAccountingDrafts } | null>(null)
  const [mode, setMode] = useState<ServiceAccountingMode>('continuous')
  const [drafts, setDrafts] = useState<ServiceAccountingDrafts>(() => createServiceAccountingDrafts(null, today).drafts)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [preview, setPreview] = useState<{ key: string; value?: ServiceProjection; error?: string; loading?: boolean } | null>(null)
  const [previewRetry, setPreviewRetry] = useState(0)

  const result = useMemo(() => serviceAccountingDraftInput(mode, drafts, today), [mode, drafts, today])
  const input = result.input
  const previewKey = loaded && input ? JSON.stringify([employeeId, input, today]) : ''
  const currentPreview = preview?.key === previewKey ? preview : null
  const previewReady = !!currentPreview?.value && currentPreview.value.calculation.status === 'calculated'
  const dirty = !!loaded && (mode !== loaded.mode || JSON.stringify(drafts[mode]) !== JSON.stringify(loaded.drafts[mode]))
  const requestClose = useUnsavedChanges(dirty, pending, navigationGuard, owner)
  const hasHireDate = isIsoCalendarDate(hireDate) && hireDate <= today
  const visibleErrors = attempted

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setLoadError(''); setLoaded(null)
    void window.hromadaHR.seniorityRanks.getServiceAccounting(employeeId).then(response => {
      if (!active) return
      if (!response.ok) { setLoadError(personnelMessage(response.error.code)); return }
      const initialized = createServiceAccountingDrafts(response.data, todayIsoDate())
      setLoaded({ value: response.data, mode: initialized.mode, drafts: initialized.drafts })
      setMode(initialized.mode); setDrafts(initialized.drafts); setAttempted(false)
    }).catch(() => { if (active) setLoadError('Не вдалося завантажити відомості стажу.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employeeId, retry])

  useEffect(() => {
    if (loading || !input || !previewKey) { setPreview(null); return }
    let active = true
    const timer = window.setTimeout(() => {
      setPreview({ key: previewKey, loading: true })
      void window.hromadaHR.seniorityRanks.previewServiceAccounting(employeeId, input, today).then(response => {
        if (!active) return
        if (response.ok) setPreview({ key: previewKey, value: response.data })
        else setPreview({ key: previewKey, error: personnelMessage(response.error.code) })
      }).catch(() => { if (active) setPreview({ key: previewKey, error: 'Не вдалося виконати попередній розрахунок.' }) })
    }, 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [employeeId, input, loading, previewKey, previewRetry, today])

  function changeDraft<K extends keyof ServiceAccountingDrafts>(key: K, value: ServiceAccountingDrafts[K]) {
    setDrafts(current => ({ ...current, [key]: value }))
    setError('')
  }
  function close() { requestClose(onClose) }

  async function persist() {
    if (!input || !previewReady || pending.current) return false
    pending.current = true; setBusy(true); onBusyChange(true); setError('')
    try {
      const response = await window.hromadaHR.seniorityRanks.saveServiceAccounting(employeeId, input)
      if (!alive.current) return false
      if (!response.ok) { setError(personnelMessage(response.error.code)); return false }
      notifySystemToast('success', 'Відомості стажу збережено', 'Попередній розрахунок і кадрові прогнози оновлено.')
      onSaved(response.data)
      return true
    } catch {
      if (alive.current) setError('Не вдалося підтвердити результат. Чернетку збережено; перевірте запис перед повторною спробою.')
      return false
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
      onBusyChange(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAttempted(true)
    if (!loaded || !input || !previewReady || pending.current) return
    if (loaded.value && mode !== loaded.mode) { setConfirmReplace(true); return }
    await persist()
  }

  async function clear() {
    if (pending.current) return
    pending.current = true; setBusy(true); onBusyChange(true); setError('')
    try {
      const response = await window.hromadaHR.seniorityRanks.clearServiceAccounting(employeeId)
      if (!alive.current) return
      if (!response.ok) { setError(personnelMessage(response.error.code)); return }
      setConfirmClear(false)
      notifySystemToast('success', 'Відомості стажу очищено', 'Надбавка, ранг і відпустки залишилися без змін.')
      onCleared()
    } catch { if (alive.current) setError('Не вдалося підтвердити результат очищення. Перечитайте відомості перед повторною спробою.') }
    finally { pending.current = false; if (alive.current) setBusy(false); onBusyChange(false) }
  }

  const activeFields = result.errors
  const currentResult = currentPreview?.value?.calculation
  const isEstimate = !!currentResult && currentResult.accuracy !== 'confirmed'
  const footer = <div className="service-accounting-footer">
    {loaded?.value && <button type="button" className="secondary-button danger-action" disabled={busy} onClick={() => { setError(''); setConfirmClear(true) }}>Очистити стаж</button>}
    <div className="employee-form-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={close}>Скасувати</button>
      <button type="submit" form={id + '-form'} className="primary-button" disabled={busy || loading || !dirty || (!!input && !previewReady)} aria-busy={busy}><Check size={17} aria-hidden="true"/>{busy ? 'Збереження…' : 'Зберегти стаж'}</button>
    </div>
  </div>

  return <>
    <Modal title={loaded?.value ? 'Редагувати стаж служби' : 'Внести стаж служби'} description="Відомості про стаж працівника" size="wide" className="employee-form-modal seniority-modal service-accounting-modal" headerIcon={<Clock3 size={19} aria-hidden="true"/>} busy={busy} onClose={close} returnFocus={returnFocus} footer={footer}>
      <div ref={owner} className="employee-form service-accounting-form">
        {loading ? <DataState kind="loading" message="Завантаження відомостей стажу…"/> : loadError ? <Alert variant="error" action={<button type="button" disabled={busy} onClick={() => setRetry(value => value + 1)}>Повторити</button>}>{loadError}</Alert> : loaded && <form id={id + '-form'} noValidate onSubmit={event => void submit(event)}>
          <fieldset className="service-accounting-mode-section" disabled={busy}>
            <legend>Спосіб визначення стажу</legend>
            <div className="service-accounting-mode-options">
              {modes.map(({ value, title, description, icon: Icon }) => <label className={`service-accounting-mode-option${mode === value ? ' is-selected' : ''}`} key={value}>
                <input type="radio" name={id + '-mode'} value={value} checked={mode === value} onChange={() => { setMode(value); setAttempted(false); setError('') }}/>
                <span className="service-accounting-mode-icon"><Icon size={18} aria-hidden="true"/></span>
                <span className="service-accounting-mode-copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="service-accounting-radio-indicator" aria-hidden="true"/>
              </label>)}
            </div>
          </fieldset>

          <InfoSection title="Відомості про стаж" icon={<Clock3 size={17} aria-hidden="true"/>}>
            <fieldset className="service-accounting-fields" disabled={busy}>
              {mode === 'continuous' && <>
                <div className="recipient-field employee-field service-accounting-date-field"><label htmlFor={id + '-continuous'}>Дата початку безперервної служби *</label><DateField id={id + '-continuous'} value={drafts.continuous.startDate} initialDraft={drafts.continuous.startDraft} max={today} required disabled={busy} error={visibleErrors ? activeFields.startDate : undefined} onDraftChange={text => changeDraft('continuous', { ...drafts.continuous, startDraft: text })} onChange={date => changeDraft('continuous', { startDate: date, startDraft: formatDateInput(date) })}/></div>
                {hasHireDate && <button type="button" className="secondary-button service-accounting-copy-date" disabled={busy} onClick={() => changeDraft('continuous', { startDate: hireDate, startDraft: formatDateInput(hireDate) })}><CalendarCheck size={16} aria-hidden="true"/>Використати дату прийняття</button>}
                {visibleErrors && activeFields.startDate && <span className="field-error">{activeFields.startDate}</span>}
              </>}
              {mode === 'periods' && <>
                <ServicePeriodEditor rows={drafts.periods} errors={visibleErrors ? activeFields.periods : {}} today={today} hireDate={hireDate} busy={busy} hasHireDate={hasHireDate} createId={() => crypto.randomUUID()} onChange={periods => changeDraft('periods', periods)}/>
                {visibleErrors && activeFields.form && <span className="field-error">{activeFields.form}</span>}
              </>}
              {mode === 'snapshot' && <div className="employee-form-grid service-accounting-snapshot-grid">
                {(['years', 'months', 'days'] as const).map((key, index) => <div className="recipient-field employee-field" key={key}><label htmlFor={id + '-' + key}>{['Роки', 'Місяці', 'Дні'][index]} *</label><ValidatedInput id={id + '-' + key} required inputMode="numeric" pattern="[0-9]+" value={drafts.snapshot[key]} disabled={busy} aria-invalid={visibleErrors && !!activeFields.snapshot[key]} aria-describedby={visibleErrors && activeFields.snapshot[key] ? id + '-' + key + '-error' : undefined} onChange={event => changeDraft('snapshot', { ...drafts.snapshot, [key]: event.target.value })}/>{visibleErrors && activeFields.snapshot[key] && <span className="field-error" id={id + '-' + key + '-error'}>{activeFields.snapshot[key]}</span>}</div>)}
                <div className="recipient-field employee-field"><label htmlFor={id + '-as-of'}>Стаж визначено станом на *</label><DateField id={id + '-as-of'} value={drafts.snapshot.asOfDateIso} initialDraft={drafts.snapshot.asOfDate} max={today} required disabled={busy} error={visibleErrors ? activeFields.snapshot.asOfDate : undefined} onDraftChange={text => changeDraft('snapshot', { ...drafts.snapshot, asOfDate: text })} onChange={date => changeDraft('snapshot', { ...drafts.snapshot, asOfDate: formatDateInput(date), asOfDateIso: date })}/></div>
              </div>}
            </fieldset>
          </InfoSection>

          <InfoSection title="Попередній розрахунок" icon={<Calculator size={17} aria-hidden="true"/>}>
            <div className="service-accounting-preview" aria-live="polite" aria-atomic="true">
              {!input ? <DataState kind="empty" compact message="Заповніть коректні відомості для розрахунку стажу."/> : currentPreview?.loading || !currentPreview ? <DataState kind="loading" compact message="Розрахунок стажу…"/> : currentPreview.error ? <Alert variant="error" action={<button type="button" disabled={busy} onClick={() => setPreviewRetry(value => value + 1)}>Повторити</button>}>{currentPreview.error}</Alert> : currentPreview.value && currentResult?.status !== 'calculated' ? <Alert variant="error">{serviceAccountingReasonMessage(currentResult?.reason ?? null)}</Alert> : currentPreview.value && currentResult?.current ? <div className="service-accounting-preview-result">
                <span>Стаж станом на {formatDate(currentResult.calculatedOn)}</span>
                <strong>{serviceDurationLabel(currentResult.current)}</strong>
                {mode === 'periods' && currentResult.creditedDays !== null && <span className="service-accounting-credited-days">Точна сума зарахованого часу: {currentResult.creditedDays.toLocaleString('uk-UA')} календарних днів</span>}
                <span className="service-accounting-accrual-note">{mode === 'periods' ? currentResult.accrues ? 'Стаж продовжує накопичуватися за поточним періодом.' : 'Враховано лише завершені періоди служби.' : 'Подальша служба враховується автоматично.'}</span>
                {isEstimate && <span className="service-accounting-estimate-note">{mode === 'periods' ? 'Тривалість у роках, місяцях і днях є розрахунковою оцінкою за внесеними періодами.' : 'Результат попередній і стане підтвердженим після збереження вихідних відомостей.'}</span>}
              </div> : <DataState kind="empty" compact message="Заповніть коректні відомості для розрахунку стажу."/>}
            </div>
          </InfoSection>
          {error && <Alert variant="error">{error}</Alert>}
        </form>}
      </div>
    </Modal>
    {confirmReplace && <ConfirmDialog title="Замінити спосіб обліку стажу?" message="Після збереження попередні вихідні відомості буде замінено новим способом обліку. Продовжити?" variant="warning" confirmLabel="Замінити й зберегти" confirmDisabled={!previewReady || busy} onCancel={() => setConfirmReplace(false)} onConfirm={async () => { setConfirmReplace(false); await persist() }}/>}
    {confirmClear && <ConfirmDialog title="Очистити відомості стажу?" message="Усі вихідні відомості стажу та пов’язані періоди буде вилучено. Надбавка, ранг і відпустки залишаться без змін." confirmLabel="Очистити стаж" error={error} onCancel={() => { if (!pending.current) setConfirmClear(false) }} onConfirm={clear}/>}
  </>
}
