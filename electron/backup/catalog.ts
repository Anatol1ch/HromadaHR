import { backupName } from './names.js'
import { fileDigest } from './images.js'
import { inspectDatabase } from '../storage/validation.js'
import type { Migration } from '../storage/migrations.js'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync, openSync, readSync, closeSync, unlinkSync } from 'node:fs'
import { opendir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { AvailableBackups, BackupSlot } from '../../shared/backup.js'
import { BackupError, pathKey } from './files.js'
import { openPreservationHandle } from './windows-files.js'

type Config = { instance_id: string; folder1: string | null; folder2: string | null }
type Entry = { id: string; slot: BackupSlot; folder: string; name: string; instance: string; identity: string; directory: string }
function metadata(folder: string, name: string) {
  const root = lstatSync(folder, { bigint: true }), path = join(folder, name)
  if (!root.isDirectory() || root.isSymbolicLink() || pathKey(realpathSync.native(folder)) !== pathKey(folder)) throw new BackupError('INVALID_SELECTION')
  const file = lstatSync(path, { bigint: true })
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1n || pathKey(dirname(realpathSync.native(path))) !== pathKey(folder)) throw new BackupError('INVALID_SELECTION')
  return { directory: `${root.dev}:${root.ino}:${root.birthtimeNs}`, identity: `${file.dev}:${file.ino}:${file.birthtimeNs}:${file.ctimeNs}:${file.mtimeNs}:${file.size}` }
}
// Read only a small header and lineage row; never integrity_check during listing.
function belongs(path: string, instance: string) {
  const fd = openSync(path, 'r'), header = Buffer.alloc(100)
  try {
    if (readSync(fd, header, 0, header.length, 0) !== 100 || header.subarray(0, 16).toString() !== 'SQLite format 3\0' || header[18] !== 1 || header[19] !== 1) return false
  } finally { closeSync(fd) }
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 0 })
  try {
    db.pragma('trusted_schema=OFF'); db.pragma('query_only=ON')
    if (db.prepare<[], { type: string }>("SELECT type FROM sqlite_schema WHERE name='backup_config'").get()?.type !== 'table') return false
    return db.prepare<[], { instance_id: string }>('SELECT instance_id FROM backup_config WHERE rowid=1 AND id=1').get()?.instance_id === instance
  } finally { db.close() }
}
export class BackupCatalog {
  private entries = new Map<string, Entry>()
  private groups = new Map<string, Entry[]>()
  async list(config: Config): Promise<AvailableBackups> {
    const next = new Map<string, Entry>(), groups = new Map<string, Entry[]>(), keys = new Map<string, string>(), copies: AvailableBackups['copies'] = [], targets: AvailableBackups['targets'] = []
    let limited = false
    for (const slot of [1, 2] as const) {
      const folder = slot === 1 ? config.folder1 : config.folder2
      if (!folder) { targets.push({ slot, available: false }); continue }
      try {
        const root = lstatSync(folder)
        if (!root.isDirectory() || root.isSymbolicLink() || pathKey(realpathSync.native(folder)) !== pathKey(folder)) throw new Error('Unavailable')
        const candidates: { name: string; kind: 'auto' | 'manual'; time: string }[] = []
        let scanned = 0
        for await (const item of await opendir(folder)) {
          if (++scanned > 4096) { limited = true; break }
          const parsed = backupName(item.name)
          if (!item.isFile() || !parsed || parsed.instance !== config.instance_id) continue
          candidates.push({ name: item.name, kind: parsed.kind, time: parsed.time })
        }
        candidates.sort((a, b) => b.time.localeCompare(a.time) || a.name.localeCompare(b.name))
        if (candidates.length > 100) limited = true
        for (const candidate of candidates.slice(0, 100)) {
          try {
            const stamp = metadata(folder, candidate.name)
            if (!belongs(join(folder, candidate.name), config.instance_id)) continue
            const digest = backupName(candidate.name)!.digest
            if (digest && fileDigest(join(folder, candidate.name)) !== digest) continue
            const after = metadata(folder, candidate.name)
            if (stamp.identity !== after.identity || stamp.directory !== after.directory) continue
            const previous = [...this.entries.values()].find(item => item.slot === slot && item.folder === folder && item.name === candidate.name && item.instance === config.instance_id && item.identity === stamp.identity && item.directory === stamp.directory)
            const entry: Entry = { ...stamp, id: previous?.id ?? randomUUID(), slot, folder, name: candidate.name, instance: config.instance_id }
            next.set(entry.id, entry)
            // Only new content-addressed names establish a logical pair.
            // Legacy snapshots are never merged by time, name or lineage alone.
            const key = digest ? candidate.name : entry.id
            const groupId = keys.get(key)
            if (groupId) {
              groups.get(groupId)!.push(entry)
              copies.find(copy => copy.id === groupId)!.locations.push(slot)
            } else {
              keys.set(key, entry.id); groups.set(entry.id, [entry])
              copies.push({ id: entry.id, slot, kind: candidate.kind, time: candidate.time, available: true, locations: [slot] })
            }
          } catch { /* Unknown, inaccessible or changing files are not selectable. */ }
        }
        targets.push({ slot, available: true })
      } catch { targets.push({ slot, available: false }) }
    }
    this.entries = next; this.groups = groups
    copies.sort((a, b) => b.time.localeCompare(a.time) || a.slot - b.slot || a.id.localeCompare(b.id))
    return { copies, targets, limited }
  }
  capture(id: string, config: Config, destination: (name: string) => string, manifest: readonly Migration[]) {
    const entries = this.groups.get(id)
    if (!entries?.length) throw new BackupError('INVALID_SELECTION')
    let failure: unknown
    for (const entry of entries) {
      let captured: string | undefined
      try {
        this.captureEntry(entry, config, name => { captured = destination(name); return captured })
        // Full validation belongs to selection. A bad first copy may fall back
        // only to another recorded member of this exact logical snapshot.
        inspectDatabase(captured!, manifest)
        return entry.name
      } catch (error) {
        failure = error
        if (captured) try { unlinkSync(captured) } catch {}
      }
    }
    if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'UNSUPPORTED_SCHEMA') throw new BackupError('UNSUPPORTED_SCHEMA')
    throw failure instanceof BackupError ? failure : new BackupError('INVALID_BACKUP')
  }
  private captureEntry(entry: Entry, config: Config, destination: (name: string) => string) {
    if (entry.instance !== config.instance_id || entry.folder !== (entry.slot === 1 ? config.folder1 : config.folder2)) throw new BackupError('INVALID_SELECTION')
    const verify = () => {
      const stamp = metadata(entry.folder, entry.name)
      if (stamp.identity !== entry.identity || stamp.directory !== entry.directory) throw new BackupError('INVALID_SELECTION')
    }
    try {
      verify()
      // Existing Win32 handle denies writes/deletes and captures this exact file,
      // including while its original pathname could otherwise be replaced.
      const handle = openPreservationHandle(join(entry.folder, entry.name))
      let captured: string
      try { verify(); captured = destination(entry.name); handle.copyTo(captured) } finally { handle.close() }
      const digest = backupName(entry.name)!.digest
      if (digest && fileDigest(captured) !== digest) throw new BackupError('INVALID_BACKUP')
      if (!belongs(captured, config.instance_id)) throw new BackupError('INVALID_BACKUP')
    } catch (error) { throw error instanceof BackupError ? error : new BackupError('INVALID_SELECTION') }
  }
}
