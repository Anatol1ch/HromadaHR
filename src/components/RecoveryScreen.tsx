import { useEffect, useRef, useState } from 'react'
import type { StorageStatus } from '../../shared/ipc'
import type { RestoreSelection } from '../../shared/backup'
import Alert from './Alert'

export default function RecoveryScreen({ status }: { status: StorageStatus }) {
  const [selection, setSelection] = useState<RestoreSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const code = status.state === 'error' ? status.code : null
  const eligible = code === 'CORRUPT' || code === 'UNSUPPORTED_SCHEMA' || code === 'MISSING_DATABASE'
  const explanation = code === 'CORRUPT' ? 'Формат або цілісність бази порушено. Початкові файли не замінено порожньою базою.' :
    code === 'UNSUPPORTED_SCHEMA' ? 'Структура або версія бази не підтримується. Це не обов’язково пошкодження; файл залишено без змін.' :
    code === 'MISSING_DATABASE' ? 'Раніше створений файл бази відсутній. Нову порожню базу не створено.' :
    code === 'BUSY' ? 'База зайнята іншою програмою. Закрийте її та повторіть спробу.' :
    code === 'FILESYSTEM' ? 'Немає доступу до файла або носія. Перевірте підключення диска, дозволи та вільне місце.' :
    code === 'RECOVERY_REQUIRED' ? 'Незавершене відновлення потребує повторної перевірки або технічної допомоги. Збережені файли не видаляйте.' :
    'Не вдалося підготувати сховище. Повторіть спробу або зверніться по технічну допомогу.'
  async function act(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage('')
    try { await action() }
    catch { if (mounted.current) setMessage('Не вдалося виконати дію. Початкові файли збережено. Повторіть перевірку або зверніться по технічну допомогу.') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  if (status.state === 'initializing' || status.state === 'closed') return <main className="recovery-screen"><p role="status">Перевірка або відновлення локального сховища…</p></main>
  return <main className="recovery-screen">
    <section className="dashboard-panel backup-panel" aria-labelledby="recovery-title" aria-busy={busy}>
      <h1 id="recovery-title">Не вдалося відкрити базу даних</h1>
      <p>{explanation}</p>
      {code && <p>Діагностичний код: {code}</p>}
      <div className="backup-actions">
        {eligible && <button type="button" className="primary-button" disabled={busy} onClick={() => {
          void act(async () => {
            const result = await window.hromadaHR.backup.chooseRestore()
            if (!result.ok) {
              if (mounted.current) setMessage(result.error.code === 'UNSUPPORTED_SCHEMA' ? 'Схема вибраної копії не підтримується.' : 'Не вдалося перевірити резервну копію. Виберіть справну копію HromadaHR.')
            } else if (mounted.current) setSelection(result.data)
          })
        }}>Вибрати резервну копію</button>}
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          setSelection(null)
          void act(async () => { const result = await window.hromadaHR.storage.retry(); if (!result.ok) throw new Error('Retry failed') })
        }}>Повторити спробу</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => { void window.hromadaHR.system.quit() }}>Закрити застосунок</button>
      </div>
      {selection && <Alert variant="warning">
        <strong>Відновлення замінить поточну базу.</strong>
        <p>Перевірено «{selection.fileName}», схема {selection.schemaVersion}. Початковий набір файлів буде збережено для діагностики, але він може бути пошкоджений.</p>
        <div className="backup-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={() => {
            void act(async () => {
              const result = await window.hromadaHR.backup.confirmRestore(selection.token)
              if (!result.ok) throw new Error('Restore refused')
              if (mounted.current) { setSelection(null); setMessage(result.data.restored ? 'Дані відновлено. Інтерфейс перезавантажується.' : 'Відновлення скасовано.') }
            })
          }}>Підтвердити відновлення</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setSelection(null)}>Скасувати</button>
        </div>
      </Alert>}
      {busy && <p role="status">Операція виконується. Не від’єднуйте носій.</p>}
      {message && <Alert variant="info">{message}</Alert>}
    </section>
  </main>
}
