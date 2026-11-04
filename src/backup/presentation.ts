import type { BackupStatus } from '../../shared/backup'

/** Presentation of the persisted Main status only; drafts do not imply protection. */
export function backupOverview(status: BackupStatus | null) {
  if (!status) return { configured: false, successes: 0, lastSuccess: null, errors: 0, label: 'Завантаження стану…' }
  const configured = status.targets.every(target => target.path !== null)
  const successes = status.targets.filter(target => target.lastSuccess !== null && target.error === null &&
    (!target.lastAttempt || Date.parse(target.lastSuccess) >= Date.parse(target.lastAttempt))).length
  const dates = status.targets.flatMap(target => target.lastSuccess ? [target.lastSuccess] : [])
  const lastSuccess = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
  const errors = status.targets.filter(target => target.error !== null || (target.path !== null && !target.available)).length
  const label = status.busy ? 'Виконується операція' : errors ? 'Потребує уваги' : !configured ? 'Потрібно вибрати дві теки' :
    'Теки доступні'
  return { configured, successes, lastSuccess, errors, label }
}
