import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { backupEvent } from '../../shared/backupHistory.js'
import type { BackupEvent, BackupHistory } from '../../shared/backupHistory.js'

// Diagnostic history only. Never shares the SQLite recovery journal or backup files.
export class BackupHistoryStore {
  private failed = false
  constructor(private file: () => string) {}
  private read(): BackupEvent[] {
    const file = this.file()
    try {
      const info = statSync(file)
      if (!info.isFile() || info.size > 64 * 1024) throw new Error('Invalid history file')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
      throw error
    }
    return backupEvent.array().max(200).parse(JSON.parse(readFileSync(file, 'utf8')))
  }
  get(): BackupHistory {
    try { return { available: !this.failed, events: this.read().slice().reverse() } }
    catch { return { available: false, events: [] } }
  }
  append(event: BackupEvent): void {
    let temporary: string | undefined
    try {
      const events = [...this.read(), backupEvent.parse(event)].slice(-200)
      const file = this.file()
      mkdirSync(dirname(file), { recursive: true })
      let data = JSON.stringify(events)
      while (Buffer.byteLength(data) > 64 * 1024 && events.length > 1) { events.shift(); data = JSON.stringify(events) }
      if (Buffer.byteLength(data) > 64 * 1024) throw new Error('History size limit')
      temporary = file + '.tmp'
      writeFileSync(temporary, data, { mode: 0o600 })
      renameSync(temporary, file)
      this.failed = false
    } catch { this.failed = true }
    finally { if (temporary) try { unlinkSync(temporary) } catch { /* Own temporary file only. */ } }
  }
}
