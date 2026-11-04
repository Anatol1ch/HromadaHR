import Database from 'better-sqlite3'
import { BackupHistoryStore } from './history.js'
import type { BackupEvent } from '../../shared/backupHistory.js'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { constants, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import type { BackupSlot, BackupStatus, BackupTarget, FolderSelection, RestoreSelection } from '../../shared/backup.js'
import type { Storage } from '../storage/index.js'
import { inspectDatabase } from '../storage/validation.js'
import { BackupError, directory, rotateAutomatic, sameFile, snapshot, syncFile, validateDestination, validateFolders } from './files.js'
import { beginEmergencyReplacement, beginReplacement, preserveDamagedSet, recoverInterruptedRestore, restoreFiles } from './recovery.js'
import { storageErrorCode } from '../storage/errors.js'

const retryInterval = 15 * 60 * 1000
interface Config { instance_id: string; folder1: string | null; folder2: string | null }
interface TargetRow {
  slot: BackupSlot; auto_day: string | null; last_attempt: string | null; last_success: string | null
  last_kind: 'auto' | 'manual' | null; error: BackupTarget['error']; file_name: string | null; retry_after: number
  attempt_day: string | null; attempt_count: number
}
export function localDay(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export class BackupService {
  private busy = false
  private timer: ReturnType<typeof setInterval> | undefined
  private lastRestore: BackupStatus['lastRestore'] = null
  private folders = new Map<BackupSlot, FolderSelection & { expires: number }>()
  private restoreSelection: (RestoreSelection & { staged: string; expires: number }) | undefined

  constructor(private storage: Storage, private now: () => Date = () => new Date(),
    private history = new BackupHistoryStore(() => join(dirname(storage.getFile()), 'backup-history.json'))) {}
  getHistory = () => this.history.get()
  private record(operation: BackupEvent['operation'], result: BackupEvent['result'], slot: BackupSlot | null = null, code: BackupEvent['code'] = null) {
    try { this.history.append({ time: this.now().toISOString(), operation, slot, result, code }) } catch { /* Diagnostics must never affect the operation. */ }
  }
  isBusy() { return this.busy }
  emergencyAvailable() { return this.storage.canRecover() }
  private db() {
    if (this.storage.getStatus().state !== 'ready') throw new BackupError('STORAGE_UNAVAILABLE')
    return this.storage.getDatabase()
  }
  private config(): Config {
    const db = this.db()
    let config = db.prepare<[], Config>('SELECT instance_id, folder1, folder2 FROM backup_config WHERE id=1').get()
    if (!config) {
      db.prepare('INSERT INTO backup_config(id, instance_id) VALUES (1, ?)').run(randomUUID())
      config = db.prepare<[], Config>('SELECT instance_id, folder1, folder2 FROM backup_config WHERE id=1').get()!
    }
    return config
  }
  getStatus(): BackupStatus {
    const config = this.config()
    const rows = this.db().prepare<[], TargetRow>('SELECT * FROM backup_state ORDER BY slot').all()
    const targets = rows.map(row => {
      const path = row.slot === 1 ? config.folder1 : config.folder2
      let available = false
      try { if (path) { directory(path); available = true } } catch { /* Offline target, no reset. */ }
      return { slot: row.slot, path, available, autoDay: row.auto_day, lastAttempt: row.last_attempt,
        lastSuccess: row.last_success, lastKind: row.last_kind, error: row.error, fileName: row.file_name }
    }) as [BackupTarget, BackupTarget]
    let sameVolume = false
    try {
      if (config.folder1 && config.folder2) sameVolume = validateFolders([config.folder1, config.folder2], this.storage.getFile(), false).sameVolume
    } catch { /* Individual target states remain visible. */ }
    return { targets, sameVolume, busy: this.busy, lastRestore: this.lastRestore }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BackupError('BUSY')
    this.busy = true
    try { return await operation() } finally { this.busy = false }
  }

  async chooseFolder(slot: BackupSlot, pick: () => Promise<string | null>): Promise<FolderSelection | null> {
    return this.exclusive(async () => {
      this.db()
      const path = await pick()
      if (!path) return null
      let normalized: string
      try { normalized = directory(path, true) } catch { throw new BackupError('FOLDER_UNAVAILABLE') }
      const selection = { token: randomUUID(), path: normalized, expires: this.now().getTime() + 10 * 60 * 1000 }
      this.folders.set(slot, selection)
      return { token: selection.token, path: selection.path }
    })
  }

  async saveConfig(tokens: [string | null, string | null]) {
    return this.exclusive(async () => {
      const config = this.config()
      const paths = tokens.map((token, index) => {
        if (token === null) return index === 0 ? config.folder1 : config.folder2
        const selected = this.folders.get((index + 1) as BackupSlot)
        if (!selected || selected.token !== token || selected.expires < this.now().getTime()) throw new BackupError('INVALID_SELECTION')
        return selected.path
      })
      if (!paths[0] || !paths[1]) throw new BackupError('NOT_CONFIGURED')
      let validated: ReturnType<typeof validateFolders>
      try { validated = validateFolders(paths as [string, string], this.storage.getFile()) }
      catch (error) { throw error instanceof BackupError ? error : new BackupError('FOLDER_UNAVAILABLE') }
      const db = this.db()
      db.transaction(() => {
        db.prepare('UPDATE backup_config SET folder1=?, folder2=? WHERE id=1').run(...validated.paths)
        validated.paths.forEach((path, index) => {
          if (path !== (index === 0 ? config.folder1 : config.folder2)) {
            db.prepare(`UPDATE backup_state SET auto_day=NULL, last_attempt=NULL, last_success=NULL,
              last_kind=NULL, error=NULL, file_name=NULL, retry_after=0, attempt_day=NULL, attempt_count=0 WHERE slot=?`).run(index + 1)
          }
        })
      }).immediate()
      this.folders.clear()
      this.record('config', 'success')
      return this.getStatus()
    })
  }

  async runManual() { return this.runCycle('manual') }
  async runAutomatic() {
    if (this.busy || this.storage.getStatus().state !== 'ready') return
    const config = this.config()
    if (!config.folder1 || !config.folder2) return
    return this.runCycle('auto')
  }
  private async runCycle(kind: 'auto' | 'manual') {
    return this.exclusive(async () => {
      const config = this.config()
      if (!config.folder1 || !config.folder2) throw new BackupError('NOT_CONFIGURED')
      const db = this.db()
      const now = this.now()
      const day = localDay(now)
      const rows = db.prepare<[], TargetRow>('SELECT * FROM backup_state ORDER BY slot').all()
      for (const row of rows) {
        if (kind === 'auto' && (row.auto_day === day ||
          (row.attempt_day === day && (row.attempt_count >= 4 || row.retry_after > now.getTime())))) continue
        const folder = row.slot === 1 ? config.folder1 : config.folder2
        let file: string | null = null
        let error: BackupTarget['error'] = null
        try {
          const destination = validateDestination(folder, this.storage.getFile())
          // Revalidate separation against the other target when it is online.
          // An offline second target must not prevent this target succeeding.
          const other = row.slot === 1 ? config.folder2 : config.folder1
          let otherOnline = false
          try { directory(other); otherOnline = true } catch {}
          if (otherOnline) validateFolders([folder, other], this.storage.getFile(), false)
          file = await snapshot(db, destination, `${config.instance_id}-${kind}`, this.storage.manifest, now)
        } catch (cause) {
          error = cause instanceof BackupError ? cause.code : 'BACKUP_FAILED'
        }
        db.transaction(() => {
          db.prepare(`UPDATE backup_state SET last_attempt=?, last_success=CASE WHEN ? IS NULL THEN ? ELSE last_success END,
            last_kind=?, error=?, file_name=COALESCE(?,file_name) WHERE slot=?`)
            .run(now.toISOString(), error, now.toISOString(), kind, error, file ? basename(file) : null, row.slot)
          if (kind === 'auto') db.prepare(`UPDATE backup_state SET auto_day=CASE WHEN ? IS NULL THEN ? ELSE auto_day END,
            attempt_day=?, attempt_count=?, retry_after=? WHERE slot=?`)
            .run(error, day, day, row.attempt_day === day ? row.attempt_count + 1 : 1,
              error ? now.getTime() + retryInterval : 0, row.slot)
        }).immediate()
        if (file && kind === 'auto') {
          try { rotateAutomatic(folder, config.instance_id, this.storage.manifest) }
          catch { error = 'BACKUP_FAILED'; db.prepare('UPDATE backup_state SET error=? WHERE slot=?').run(error, row.slot) }
        }
        this.record(kind, error ? 'error' : 'success', row.slot, error)
      }
      return this.getStatus()
    })
  }

  start() {
    if (this.timer) return
    void this.runAutomatic().catch(() => { /* Status remains queryable; next bounded tick retries. */ })
    this.timer = setInterval(() => { void this.runAutomatic().catch(() => {}) }, retryInterval)
    this.timer.unref()
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  async retryStorage() {
    return this.exclusive(async () => {
      this.invalidateSelections()
      if (this.storage.getStatus().state !== 'ready') {
        try { await this.storage.reopen() } catch { /* Status retains the specific error. No automatic reset/retry loop. */ }
      }
      if (this.storage.getStatus().state === 'ready') this.start()
      return this.storage.getStatus()
    })
  }
  invalidateSelections() {
    this.folders.clear()
    if (this.restoreSelection) {
      try { unlinkSync(this.restoreSelection.staged) } catch { /* App-owned staging only; never remove a source. */ }
    }
    this.restoreSelection = undefined
  }

  async chooseRestore(pick: () => Promise<string | null>): Promise<RestoreSelection | null> {
    try { return await this.prepareRestore(pick) }
    catch (error) {
      this.record('restore', 'error', null, error instanceof BackupError ? error.code : 'RESTORE_FAILED')
      throw error
    }
  }
  private async prepareRestore(pick: () => Promise<string | null>): Promise<RestoreSelection | null> {
    return this.exclusive(async () => {
      if (this.storage.getStatus().state !== 'ready' && !this.storage.canRecover()) throw new BackupError('STORAGE_UNAVAILABLE')
      this.invalidateSelections()
      const selected = await pick()
      if (!selected) return null
      let version: number
      try {
        if (existsSync(this.storage.getFile()) && sameFile(selected, this.storage.getFile())) throw new BackupError('INVALID_BACKUP')
        version = inspectDatabase(selected, this.storage.manifest)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'UNSUPPORTED_SCHEMA') throw new BackupError('UNSUPPORTED_SCHEMA')
        throw new BackupError('INVALID_BACKUP')
      }
      const staging = join(dirname(this.storage.getFile()), 'staging')
      mkdirSync(staging, { recursive: true })
      const source = new Database(selected, { readonly: true, fileMustExist: true })
      let staged: string
      try { staged = await snapshot(source, staging, 'restore-source', this.storage.manifest) } finally { source.close() }
      const token = randomUUID()
      this.restoreSelection = { token, staged, fileName: basename(selected), schemaVersion: version, expires: this.now().getTime() + 5 * 60 * 1000 }
      return { token, fileName: basename(selected), schemaVersion: version }
    })
  }

  async confirmRestore(token: string, confirm: () => Promise<boolean>) {
    try {
      const result = await this.performRestore(token, confirm)
      this.record('restore', result.restored ? 'success' : 'cancelled', null, result.restored ? null : 'CANCELLED')
      return result
    } catch (error) {
      this.record('restore', 'error', null, error instanceof BackupError ? error.code : 'RESTORE_FAILED')
      throw error
    }
  }
  private async performRestore(token: string, confirm: () => Promise<boolean>) {
    return this.exclusive(async () => {
      const selected = this.restoreSelection
      this.restoreSelection = undefined // Consume once, including cancellation/failure.
      if (!selected || selected.token !== token || selected.expires < this.now().getTime()) {
        if (selected) { try { unlinkSync(selected.staged) } catch {} }
        throw new BackupError('INVALID_SELECTION')
      }
      const active = this.storage.getFile()
      const id = randomUUID()
      const paths = restoreFiles(active, id)
      let suspended = false
      const emergency = this.storage.canRecover()
      let preservation: ReturnType<typeof preserveDamagedSet> | undefined
      let incomingOwned = false
      try {
        if (!await confirm()) return { restored: false }
        inspectDatabase(selected.staged, this.storage.manifest)
        const config = emergency ? null : this.config()
        copyFileSync(selected.staged, paths.incoming, constants.COPYFILE_EXCL) // Closed snapshot, never the active WAL DB.
        incomingOwned = true
        inspectDatabase(paths.incoming, this.storage.manifest)
        syncFile(paths.incoming)
        if (emergency) {
          preservation = preserveDamagedSet(active, id)
          suspended = true
          beginEmergencyReplacement(active, id, preservation.moveOriginals)
          preservation.release()
        } else {
          const protection = join(dirname(active), 'protection')
          mkdirSync(protection, { recursive: true })
          await snapshot(this.db(), protection, 'protect-restore', this.storage.manifest, this.now())
          const checkpoint = this.db().pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[]
          if (checkpoint.some(row => row.busy !== 0)) throw new BackupError('BUSY')
          this.storage.close()
          suspended = true
          if (existsSync(active + '-wal') || existsSync(active + '-shm')) throw new BackupError('BUSY')
          beginReplacement(active, id)
        }
        await this.storage.reopen(false)
        // Destination choices belong to this installation; clear daily markers
        // so restored data receives a fresh automatic cycle.
        if (config) this.db().transaction(() => {
          this.db().prepare('INSERT OR REPLACE INTO backup_config(id,instance_id,folder1,folder2) VALUES (1,?,?,?)')
            .run(config.instance_id, config.folder1, config.folder2)
          this.db().exec(`UPDATE backup_state SET auto_day=NULL, retry_after=0, attempt_day=NULL, attempt_count=0,
            last_attempt=NULL, last_success=NULL, last_kind=NULL, error=NULL, file_name=NULL`)
        }).immediate()
        inspectDatabase(active, this.storage.manifest)
        unlinkSync(paths.journal) // Commit restore only after successful reopen.
        if (!emergency) try { unlinkSync(paths.previous) } catch { /* Protective online snapshot is retained regardless. */ }
        this.lastRestore = 'success'
        return { restored: true }
      } catch (error) {
        if (suspended) {
          try {
            this.storage.close()
            preservation?.release()
            recoverInterruptedRestore(active)
            try { await this.storage.reopen() } catch (cause) {
              // Restoring the original damaged/absent state is a successful
              // rollback, but it must remain behind the startup recovery screen.
              if (!emergency || !this.storage.canRecover()) throw cause
            }
            this.lastRestore = 'rolled-back'
          } catch { this.storage.failRecovery(); throw new BackupError('RECOVERY_REQUIRED') }
          throw new BackupError('RESTORE_FAILED')
        }
        throw error instanceof BackupError ? error : new BackupError(storageErrorCode(error) === 'BUSY' ? 'BUSY' : 'RESTORE_FAILED')
      } finally {
        preservation?.release()
        for (const file of [selected.staged, ...(incomingOwned ? [paths.incoming] : [])]) { try { unlinkSync(file) } catch {} }
      }
    })
  }
}
