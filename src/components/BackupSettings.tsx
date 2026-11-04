import BackupHistory from './BackupHistory'
import { DatabaseBackup, FolderOpen, HardDrive, History, Save, ShieldAlert, RefreshCw } from 'lucide-react'
import { backupOverview } from '../backup/presentation.ts'
import { formatDate, formatDateTime } from '../lib/dates'
import { notifySystemToast } from './SystemToastHost'
import { useEffect, useRef, useState } from 'react'
import type { BackupStatus, FolderSelection, RestoreSelection } from '../../shared/backup'
import type { IpcErrorCode, IpcResult } from '../../shared/ipc'
import Alert from './Alert'

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
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [choices, setChoices] = useState<[FolderSelection | null, FolderSelection | null]>([null, null])
  const [restore, setRestore] = useState<RestoreSelection | null>(null)
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const mounted = useRef(false)
  const restoreNotified = useRef(false)
  const actionInFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    let polling = false
    const refresh = async () => {
      if (polling) return
      polling = true
      try {
        const result = await window.hromadaHR.backup.getStatus()
        if (mounted.current) {
          if (result.ok) setStatus(result.data)
          else if (!actionInFlight.current) setFeedback({ error: true, text: message(result.error.code) })
        }
      } catch { if (mounted.current) setFeedback({ error: true, text: message('UNAVAILABLE') }) }
      finally { polling = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])

  async function act<T>(operation: () => Promise<IpcResult<T>>, done: (data: T) => void) {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setRunning(true); setFeedback(null)
    try {
      const result = await operation()
      if (mounted.current) {
        if (result.ok) done(result.data)
        else setFeedback({ error: true, text: message(result.error.code) })
      }
    } catch { if (mounted.current) setFeedback({ error: true, text: message('UNAVAILABLE') }) }
    finally { actionInFlight.current = false; if (mounted.current) setRunning(false) }
  }
  useEffect(() => { if (feedback && !feedback.error) notifySystemToast('success', 'Готово', feedback.text) }, [feedback])
  useEffect(() => {
    if (status?.lastRestore === 'success' && !restoreNotified.current) {
      restoreNotified.current = true
      notifySystemToast('success', 'Дані відновлено', 'Відновлення з резервної копії завершено.')
    }
  }, [status?.lastRestore])
  const busy = running || status?.busy === true
  const configured = status?.targets.every(target => target.path !== null) === true
  const overview = backupOverview(status)
  return <section className="backup-settings" aria-labelledby="backup-title" aria-busy={busy}>
    <section className="dashboard-panel backup-overview">
      <div className="settings-card-heading"><span className="settings-icon"><DatabaseBackup size={21} aria-hidden="true"/></span><div><h2 id="backup-title">Резервне копіювання</h2></div></div>
      <div className="backup-overview-status" role="status">
        <strong>{busy ? 'Виконується операція…' : overview.label}</strong>
        {status && <span>Остання успішна копія: {time(overview.lastSuccess)}</span>}
      </div>
      {status?.sameVolume && <Alert variant="warning">Обидві теки на одному томі. Це не захищає від відмови цього диска. Виберіть другу теку на іншому носії.</Alert>}
      {choices.some(Boolean) && <Alert variant="info">Вибір тек ще не збережено. Автоматичні копії використовують попередню конфігурацію.</Alert>}
      {feedback?.error && <Alert variant="error">{feedback.text}</Alert>}
      {status?.lastRestore === 'rolled-back' && <Alert variant="warning">Відновлення не вдалося. Попередню справну базу повернуто.</Alert>}
      <details className="backup-technical"><summary>Як працює резервування</summary><p className="backup-policy">Поки застосунок відкрито — одна автоматична копія на добу в кожній теці. Зберігаються 14 останніх автоматичних копій; ручні залишаються. Повторні спроби — через 15 хвилин, до чотирьох на теку за добу.</p></details>
    </section>
    <div className="backup-target-grid">
      {([0, 1] as const).map(index => {
        const target = status?.targets[index]
        const choice = choices[index]
        const path = choice?.path ?? target?.path
        return <section className="dashboard-panel backup-target-card" key={index} aria-labelledby={`backup-slot-${index}`}>
          <div className="backup-target-heading"><span className="settings-icon"><HardDrive size={20} aria-hidden="true"/></span><div><h3 id={`backup-slot-${index}`}>Тека {index + 1}</h3></div></div>
          <p className="backup-path" title={path ?? undefined}>{path ?? 'Теку ще не вибрано'}</p>
          <span className={`backup-target-state${target?.error || (target?.path && !target.available) ? ' has-error' : ''}`}>
            {choice ? 'Очікує збереження' : !target ? 'Завантаження…' : target.path ? target.available ? 'Тека доступна' : 'Тека недоступна' : 'Не налаштовано'}
          </span>
          <dl className="backup-target-facts"><div><dt>{choice ? 'Остання копія у попередній теці' : 'Остання успішна копія'}</dt><dd>{time(target?.lastSuccess ?? null)}</dd></div></dl>
          {target?.error && <Alert variant="error">{message(target.error)}</Alert>}
          {target?.path && !target.available && !target.error && <Alert variant="warning">Тека недоступна. Перевірте підключення носія та доступ до неї.</Alert>}
          <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            void act(() => window.hromadaHR.backup.chooseFolder(index === 0 ? 1 : 2), value => {
              if (value) setChoices(previous => index === 0 ? [value, previous[1]] : [previous[0], value])
            })
          }}><FolderOpen size={17} aria-hidden="true"/>{path ? 'Змінити теку' : 'Вибрати теку'}</button>
          <details className="backup-technical"><summary>Технічні відомості</summary>
            <dl><div><dt>Остання спроба</dt><dd>{time(target?.lastAttempt ?? null)}</dd></div>
              {target?.error && <div><dt>Код помилки</dt><dd>{target.error}</dd></div>}
              <div><dt>День автоматичної копії</dt><dd>{target?.autoDay ? formatDate(target.autoDay) : 'Ще немає'}</dd></div>
              <div><dt>Файл останньої копії</dt><dd>{target?.fileName ?? 'Ще немає'}</dd></div>
              {choice && target?.path && <div><dt>Збережена тека</dt><dd>{target.path}</dd></div>}
            </dl>
          </details>
        </section>
      })}
    </div>
    <section className="dashboard-panel backup-regular-actions" aria-label="Збереження та резервування">
      <h3>Керування копіями</h3>
      <div className="backup-actions">
        <button type="button" className="primary-button" disabled={busy || !choices.some(Boolean) || !([0, 1] as const).every(i => choices[i] || status?.targets[i].path)}
          onClick={() => { void act(() => window.hromadaHR.backup.saveConfig([choices[0]?.token ?? null, choices[1]?.token ?? null]), data => {
            setStatus(data); setChoices([null, null]); setFeedback({ error: false, text: 'Теки збережено. Автоматичне резервування активовано.' })
          }) }}><Save size={17} aria-hidden="true"/>Зберегти зміни тек</button>
        <button type="button" className="secondary-button" disabled={busy || !configured}
          onClick={() => { void act(() => window.hromadaHR.backup.runManual(), data => {
            setStatus(data)
            const failures = data.targets.filter(target => target.error).length
            setFeedback({ error: failures > 0, text: failures === 0 ? 'Ручні копії створено в обох теках.' : 'Резервування завершено з помилками. Перевірте результат для кожної теки.' })
          }) }}><RefreshCw size={17} aria-hidden="true"/>Створити копії зараз</button>
      </div>
      {busy && <p role="status">Операція виконується. Не від’єднуйте носії.</p>}
    </section>
    <section className="dashboard-panel backup-restore" aria-labelledby="backup-restore-title">
      <div className="settings-card-heading"><span className="backup-restore-icon"><ShieldAlert size={21} aria-hidden="true"/></span><div><h3 id="backup-restore-title">Відновлення даних</h3><p>Замінює поточні дані вмістом вибраної копії.</p></div></div>
      <button type="button" className="secondary-button" disabled={busy || !status}
        onClick={() => { void act(() => window.hromadaHR.backup.chooseRestore(), setRestore) }}><History size={17} aria-hidden="true"/>Вибрати копію для відновлення</button>
      {restore && <Alert variant="warning">
        <strong>Відновлення замінить поточні дані.</strong><span>Перед заміною буде збережено захисну копію; далі з’явиться системне підтвердження.</span>
        <details className="backup-technical"><summary>Відомості про вибрану копію</summary><p className="backup-path">{restore.fileName}</p><p>Версія схеми: {restore.schemaVersion}.</p></details>
        <div className="backup-actions">
          <button type="button" className="danger-button" disabled={busy} onClick={() => {
            void act(() => window.hromadaHR.backup.confirmRestore(restore.token), result => {
              setRestore(null)
              if (!result.restored) setFeedback({ error: false, text: 'Відновлення скасовано.' })
            })
          }}>Продовжити відновлення</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setRestore(null)}>Скасувати</button>
        </div>
      </Alert>}
    </section>
    <BackupHistory />
  </section>
}
