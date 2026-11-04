import BackupCopies from './BackupCopies'
import { DatabaseBackup, FolderOpen, HardDrive, Save, ShieldAlert, RefreshCw, TriangleAlert } from 'lucide-react'
import { backupOverview } from '../backup/presentation.ts'
import { formatDateTime } from '../lib/dates'
import { notifySystemToast } from './SystemToastHost'
import { useEffect, useRef, useState } from 'react'
import type { BackupStatus, FolderSelection, RestoreSelection } from '../../shared/backup'
import type { IpcErrorCode, IpcResult } from '../../shared/ipc'
import Alert from './Alert'
import Modal from './Modal'

const messages: Partial<Record<IpcErrorCode, string>> = {
  BUSY: 'Інша операція ще виконується. Спробуйте пізніше.',
  NOT_CONFIGURED: 'Спочатку виберіть і збережіть обидві теки.',
  INVALID_FOLDERS: 'Виберіть різні, невкладені теки поза каталогом даних застосунку.',
  FOLDER_UNAVAILABLE: 'Немає доступу до вибраної теки або неможливо записати файл.',
  INVALID_SELECTION: 'Вибір застарів. Виберіть теку або копію ще раз.',
  INVALID_BACKUP: 'Файл не є справною резервною копією HromadaHR.',
  UNSUPPORTED_SCHEMA: 'Версія або структура цієї копії не підтримується.',
  BACKUP_FAILED: 'Не вдалося завершити резервування. Перевірте доступ і вільне місце в теці.',
  RESTORE_FAILED: 'Відновлення не завершено. Попередні дані збережено.',
  RECOVERY_REQUIRED: 'Відновлення потребує технічної допомоги. Файли збережено; перезапустіть застосунок.',
  STORAGE_UNAVAILABLE: 'Сховище недоступне. Спочатку усуньте помилку його відкриття.',
}
const message = (code: IpcErrorCode) => messages[code] ?? 'Операція недоступна. Перезапустіть застосунок або зверніться по технічну допомогу.'
const time = (value: string | null) => value ? formatDateTime(value) : 'Ще немає'

export default function BackupSettings() {
  const [copiesRevision, setCopiesRevision] = useState(0)
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [choices, setChoices] = useState<[FolderSelection | null, FolderSelection | null]>([null, null])
  const [restore, setRestore] = useState<RestoreSelection | null>(null)
  const [restoreError, setRestoreError] = useState<{ code: IpcErrorCode; operation: 'choose' | 'confirm' } | null>(null)
  const [restoreConsumed, setRestoreConsumed] = useState(false)
  const [reloadPending, setReloadPending] = useState(false)
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; warning?: boolean; text: string } | null>(null)
  const mounted = useRef(false)
  const restoreNotified = useRef(false)
  const actionInFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    let active = true, polling = false
    const refresh = async () => {
      if (polling) return
      polling = true
      try {
        const result = await window.hromadaHR.backup.getStatus()
        if (active && !actionInFlight.current) {
          if (result.ok) { setStatus(result.data); setStatusError('') }
          else setStatusError(message(result.error.code))
        }
      } catch { if (active && !actionInFlight.current) setStatusError(message('UNAVAILABLE')) }
      finally { polling = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; mounted.current = false; clearInterval(timer) }
  }, [])

  async function act<T>(operation: () => Promise<IpcResult<T>>, done: (data: T) => void,
    failed: (code: IpcErrorCode) => void = code => setFeedback({ error: true, text: message(code) })) {
    if (actionInFlight.current || status?.busy || reloadPending) return
    actionInFlight.current = true
    setRunning(true); setFeedback(null)
    try {
      const result = await operation()
      if (mounted.current) {
        if (result.ok) done(result.data)
        else failed(result.error.code)
      }
    } catch { if (mounted.current) failed('UNAVAILABLE') }
    finally { actionInFlight.current = false; if (mounted.current) setRunning(false) }
  }
  useEffect(() => { if (feedback && !feedback.error && !feedback.warning) notifySystemToast('success', 'Готово', feedback.text) }, [feedback])
  useEffect(() => {
    if (status?.lastRestore === 'success' && !restoreNotified.current) {
      restoreNotified.current = true
      notifySystemToast('success', 'Дані відновлено', 'Відновлення з резервної копії завершено.')
    }
  }, [status?.lastRestore])
  const busy = running || status?.busy === true || reloadPending
  const configured = status?.targets.every(target => target.path !== null) === true
  const dirty = choices.some(Boolean)
  const canSave = dirty && ([0, 1] as const).every(index => choices[index] || status?.targets[index].path)
  const overview = backupOverview(status)
  const partial = status?.lastBackup?.result === 'partial'
  const backupFailed = status?.lastBackup?.result === 'error'
  const stateTone = busy ? 'info' : statusError || backupFailed ? 'error' : partial ? 'warning' : overview.errors ? 'error' : configured ? 'success' : 'info'
  const stateLabel = busy ? 'Виконується операція' : statusError || backupFailed ? 'Є помилка' : partial ? 'Частково' : overview.errors ? 'Потребує уваги' : !status ? 'Завантаження…' : configured ? 'Активне' : 'Потребує налаштування'
  function acceptStatus(data: BackupStatus) { setStatus(data); setStatusError(''); setCopiesRevision(value => value + 1) }
  function createBackup() {
    void act(() => window.hromadaHR.backup.runManual(), data => {
      acceptStatus(data)
      const successes = data.lastBackup?.copies ?? data.targets.filter(target => !target.error).length
      setFeedback({ error: successes === 0, warning: successes === 1, text: successes === 2 ? 'Резервну копію збережено в обох місцях.' : successes === 1 ? 'Резервну копію збережено лише в одному місці. Дублікат створити не вдалося.' : 'Не вдалося зберегти резервну копію в жодному місці.' })
    })
  }
  function closeRestore() {
    if (actionInFlight.current || busy) return
    setRestore(null); setRestoreError(null); setRestoreConsumed(false)
  }
  function chooseRestore() {
    void act(() => {
      // Main invalidates the prior selection even when the new picker cancels.
      if (restore) setRestoreConsumed(true)
      setRestoreError(null)
      return window.hromadaHR.backup.chooseRestore()
    }, selection => {
      setRestore(selection); setRestoreError(null); setRestoreConsumed(false)
    }, code => {
      if (restore) setRestoreError({ code, operation: 'choose' })
      else setFeedback({ error: true, text: message(code) })
    })
  }
  function selectCopy(id: string) {
    void act(() => window.hromadaHR.backup.selectCopy(id), selection => {
      setRestore(selection); setRestoreError(null); setRestoreConsumed(false)
    }, code => {
      setFeedback({ error: true, text: message(code) })
      setCopiesRevision(value => value + 1)
    })
  }
  function confirmRestore() {
    if (!restore || restoreConsumed) return
    void act(() => {
      setRestoreConsumed(true)
      return window.hromadaHR.backup.confirmRestore(restore.token)
    }, result => {
      if (result.restored) setReloadPending(true)
      else { setRestore(null); setRestoreError(null); setRestoreConsumed(false) }
    }, code => setRestoreError({ code, operation: 'confirm' }))
  }
  return <section className="backup-settings" aria-labelledby="backup-title" aria-busy={busy}>
    <header className="dashboard-panel backup-summary">
      <div className="backup-summary-info">
        <div className="backup-summary-heading"><DatabaseBackup size={22} aria-hidden="true"/><h2 id="backup-title">Резервне копіювання</h2>
          <span className="backup-state" data-tone={stateTone} role="status">{stateLabel}</span></div>
        <p className="backup-last-success">Остання успішна копія: <strong>{status ? time(overview.lastSuccess) : statusError ? 'Немає підтверджених даних' : 'Перевірка…'}</strong></p>
        {status?.sameVolume && <p className="backup-volume-warning" role="note"><TriangleAlert size={16} aria-hidden="true"/>Місця на одному томі: відмова диска загрожує обом копіям.</p>}
        {!configured && <p className="backup-setup-hint">Виберіть і збережіть обидва місця зберігання.</p>}
      </div>
      {configured && <button type="button" className="primary-button" disabled={busy || dirty} onClick={createBackup}><RefreshCw size={17} aria-hidden="true"/>Створити резервну копію</button>}
      <div className="backup-summary-feedback">
        {statusError && <Alert variant="error">{statusError}{status && ' Показано останні відомі дані.'}</Alert>}
        {(feedback?.error || feedback?.warning) && <Alert variant={feedback.error ? 'error' : 'warning'}>{feedback.text}</Alert>}
        {!(feedback?.error || feedback?.warning) && status?.lastBackup?.result === 'partial' && <Alert variant="warning">Останнє резервування завершено частково: копія збережена лише в одному місці.</Alert>}
        {!feedback && status?.lastBackup?.result === 'error' && <Alert variant="error">Останнє резервування не вдалося. Попередні успішні копії не підтверджують успіх цієї спроби.</Alert>}
        {status?.lastRestore === 'rolled-back' && <Alert variant="warning">Відновлення не вдалося. Попередню справну базу повернуто.</Alert>}
      </div>
    </header>

    <div className="backup-target-grid">
      {([0, 1] as const).map(index => {
        const target = status?.targets[index], choice = choices[index]
        const path = choice?.path ?? target?.path
        return <section className="dashboard-panel backup-target-card" key={index} aria-labelledby={'backup-slot-' + index}>
          <div className="backup-target-heading"><HardDrive size={19} aria-hidden="true"/><h3 id={'backup-slot-' + index}>{index === 0 ? 'Основне місце зберігання' : 'Додаткове місце зберігання'}</h3>
            <span className="backup-state" data-tone={choice ? 'info' : !target?.path ? 'info' : target.available ? 'success' : 'error'}>
              {choice ? 'Не збережено' : !target ? 'Перевірка…' : !target.path ? 'Не налаштовано' : target.available ? 'Доступна' : 'Недоступна'}
            </span></div>
          <div className="backup-folder-controls">
            <input className="backup-folder-address" aria-label={index === 0 ? 'Шлях основного місця' : 'Шлях додаткового місця'} readOnly value={path ?? ''} title={path ?? undefined} placeholder="Теку ще не вибрано"/>
            <button type="button" className="secondary-button backup-folder-open" title="Відкрити теку" aria-label="Відкрити теку" disabled={busy || !!choice || !target?.path || !target.available}
              onClick={() => { if (target) void act(() => window.hromadaHR.backup.openBackupFolder(target.slot), () => {}, code => setFeedback({ error: true, text: code === 'FOLDER_UNAVAILABLE' ? 'Не вдалося відкрити теку. Перевірте носій і доступ до неї.' : message(code) })) }}><FolderOpen size={17} aria-hidden="true"/></button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => {
              void act(() => window.hromadaHR.backup.chooseFolder(index === 0 ? 1 : 2), value => {
                if (value) setChoices(previous => index === 0 ? [value, previous[1]] : [previous[0], value])
              })
            }}>Змінити теку</button>
          </div>
          <p className="backup-last-success">{choice ? 'Остання копія в активній конфігурації' : 'Остання успішна копія'}: <strong>{target ? time(target.lastSuccess) : 'Немає підтверджених даних'}</strong></p>
          {target?.error && <Alert variant="error">{choice && 'Активна тека: '}{message(target.error)}</Alert>}
          {target?.path && !target.available && !target.error && <Alert variant="warning">Активна тека недоступна. Перевірте носій і доступ.</Alert>}
        </section>
      })}
    </div>

    {dirty ? <section className="backup-unsaved" aria-label="Незбережені зміни тек">
      <div><strong>{configured ? 'Незбережені зміни' : 'Налаштування тек'}</strong>
        <p>{configured ? 'Автоматичне резервування поки працює зі старими шляхами.' : 'Виберіть дві теки та збережіть налаштування, щоб увімкнути резервування.'}</p></div>
      <div className="backup-toolbar" role="group" aria-label="Збереження змін тек">
        <button type="button" className="primary-button" disabled={busy || !canSave}
          onClick={() => { void act(() => window.hromadaHR.backup.saveConfig([choices[0]?.token ?? null, choices[1]?.token ?? null]), data => {
            acceptStatus(data); setChoices([null, null]); setFeedback({ error: false, text: 'Теки збережено. Автоматичне резервування активовано.' })
          }) }}><Save size={17} aria-hidden="true"/>{configured ? 'Зберегти зміни' : 'Зберегти налаштування'}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          if (actionInFlight.current || busy) return
          setChoices([null, null]); setFeedback(null)
        }}>Скасувати зміни</button>
      </div>
    </section> : null}

    <BackupCopies busy={busy || !status} revision={copiesRevision} onSelect={selectCopy} onChoose={chooseRestore} />

    {restore && <Modal title="Відновлення з резервної копії" headerIcon={<ShieldAlert size={21} aria-hidden="true"/>}
      className="backup-restore-modal" onClose={closeRestore} busy={busy}>
      <dl className="backup-restore-details"><div><dt>Вибраний файл</dt><dd>{restore.fileName}</dd></div><div><dt>Версія схеми</dt><dd>{restore.schemaVersion}</dd></div></dl>
      <p className="backup-restore-warning">Поточні дані буде замінено вмістом цієї копії.</p>
      <p>Перед заміною буде створено захисну копію. Далі з’явиться обов’язкове системне підтвердження.</p>
      {restoreError && <Alert variant="error">{restoreError.operation === 'confirm' && restoreError.code === 'UNAVAILABLE' ? 'Результат відновлення не підтверджено. Перевірте стан застосунку перед повторним вибором копії.' : message(restoreError.code)}</Alert>}
      {restoreConsumed && !busy && <button type="button" className="secondary-button" onClick={chooseRestore}><FolderOpen size={17} aria-hidden="true"/>Вибрати копію повторно</button>}
      {busy && <p role="status">{reloadPending ? 'Дані відновлено. Інтерфейс перезавантажується…' : 'Операція виконується. Не від’єднуйте носій.'}</p>}
      <footer className="recipient-form-actions"><div>
        <button type="button" className="secondary-button" data-modal-autofocus disabled={busy} onClick={closeRestore}>Скасувати</button>
        <button type="button" className="danger-button" disabled={busy || restoreConsumed} aria-busy={running} onClick={confirmRestore}>Продовжити відновлення</button>
      </div></footer>
    </Modal>}
  </section>
}
