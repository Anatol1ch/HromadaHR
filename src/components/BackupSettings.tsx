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
const time = (value: string | null) => value ? new Date(value).toLocaleString('uk-UA') : 'Ще немає'

export default function BackupSettings() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [choices, setChoices] = useState<[FolderSelection | null, FolderSelection | null]>([null, null])
  const [restore, setRestore] = useState<RestoreSelection | null>(null)
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const mounted = useRef(false)
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
  const busy = running || status?.busy === true
  const configured = status?.targets.every(target => target.path !== null) === true
  return <section className="dashboard-panel backup-panel" aria-labelledby="backup-title" aria-busy={busy}>
    <h2 id="backup-title">Резервне копіювання</h2>
    <p>Виберіть дві незалежні теки. Поки HromadaHR відкрито, застосунок створює по одній автоматичній копії на добу в кожній теці. Зберігаються 14 останніх автоматичних копій; ручні копії не видаляються.</p>
    {([0, 1] as const).map(index => {
      const target = status?.targets[index]
      return <div className="backup-target" key={index}>
        <h3>Тека {index + 1}</h3>
        <p className="backup-path">{choices[index]?.path ?? target?.path ?? 'Не вибрано'}</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          void act(() => window.hromadaHR.backup.chooseFolder(index === 0 ? 1 : 2), choice => {
            if (choice) setChoices(previous => index === 0 ? [choice, previous[1]] : [previous[0], choice])
          })
        }}>Вибрати теку {index + 1}</button>
        {choices[index] ? <p>Новий вибір ще не збережено.</p> : <p>{target?.path ? target.available ? 'Тека доступна' : 'Тека недоступна' : 'Очікує налаштування'}</p>}
        <p>Остання спроба: {time(target?.lastAttempt ?? null)}. Успішна копія: {time(target?.lastSuccess ?? null)}.</p>
        {target?.fileName && <p className="backup-path">{target.fileName}</p>}
        <p>Автоматичну копію створено за: {target?.autoDay ?? 'ще немає'}.</p>
        {target?.error && <Alert variant="warning">{message(target.error)} Автоматичні спроби — з інтервалом 15 хвилин, до чотирьох на добу. Ручну копію можна спробувати будь-коли.</Alert>}
      </div>
    })}
    <div className="backup-actions">
      <button type="button" className="primary-button" disabled={busy || !choices.some(Boolean) || !([0, 1] as const).every(i => choices[i] || status?.targets[i].path)}
        onClick={() => { void act(() => window.hromadaHR.backup.saveConfig([choices[0]?.token ?? null, choices[1]?.token ?? null]), data => {
          setStatus(data); setChoices([null, null]); setFeedback({ error: false, text: 'Теки збережено. Автоматичне резервування активовано.' })
        }) }}>Зберегти теки</button>
      <button type="button" className="secondary-button" disabled={busy || !configured}
        onClick={() => { void act(() => window.hromadaHR.backup.runManual(), data => {
          setStatus(data)
          const failures = data.targets.filter(target => target.error).length
          setFeedback({ error: failures > 0, text: failures === 0 ? 'Ручні копії створено в обох теках.' : 'Резервування завершено з помилками. Перевірте результат для кожної теки.' })
        }) }}>Створити резервну копію</button>
      <button type="button" className="secondary-button" disabled={busy || !status}
        onClick={() => { void act(() => window.hromadaHR.backup.chooseRestore(), setRestore) }}>Відновити з резервної копії</button>
    </div>
    {status?.sameVolume && <Alert variant="warning">Обидві теки розташовані на одному томі. Для захисту від відмови диска виберіть другу теку на іншому носії.</Alert>}
    {restore && <Alert variant="warning">
      <strong>Відновлення замінить поточні дані.</strong>
      <span>Перевірено файл «{restore.fileName}», схема {restore.schemaVersion}. Перед заміною буде збережено захисну копію.</span>
      <div className="backup-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => {
          void act(() => window.hromadaHR.backup.confirmRestore(restore.token), result => {
            setRestore(null)
            setFeedback({ error: false, text: result.restored ? 'Дані відновлено. Інтерфейс перезавантажується.' : 'Відновлення скасовано.' })
          })
        }}>Підтвердити відновлення</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setRestore(null)}>Скасувати</button>
      </div>
    </Alert>}
    {status?.lastRestore === 'success' && <Alert variant="success">Дані відновлено з резервної копії.</Alert>}
    {status?.lastRestore === 'rolled-back' && <Alert variant="warning">Попереднє відновлення не вдалося. Попередню справну базу повернуто.</Alert>}
    {busy && <p role="status">Операція виконується… Не від’єднуйте носії.</p>}
    {feedback && <Alert variant={feedback.error ? 'error' : 'success'}>{feedback.text}</Alert>}
  </section>
}
