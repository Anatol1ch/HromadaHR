import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync, openSync, readSync, closeSync } from 'node:fs'
import { opendir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { AvailableBackups, BackupSlot } from '../../shared/backup.js'
import { BackupError, pathKey } from './files.js'
import { openPreservationHandle } from './windows-files.js'

type Config = { instance_id: string; folder1: string | null; folder2: string | null }
type Entry = { id: string; slot: BackupSlot; folder: string; name: string; instance: string; identity: string; directory: string }
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const namespace = new RegExp(`^hromadahr-(${uuid})-(auto|manual)-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z)-${uuid}\\.db$`)
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
  async list(config: Config): Promise<AvailableBackups> {
    const next = new Map<string, Entry>(), copies: AvailableBackups['copies'] = [], targets: AvailableBackups['targets'] = []
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
          const match = namespace.exec(item.name)
          if (!item.isFile() || !match || match[1] !== config.instance_id) continue
          const time = match[3].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z')
          if (!Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) continue
          candidates.push({ name: item.name, kind: match[2] as 'auto' | 'manual', time })
        }
        candidates.sort((a, b) => b.time.localeCompare(a.time) || a.name.localeCompare(b.name))
        if (candidates.length > 100) limited = true
        for (const candidate of candidates.slice(0, 100)) {
          try {
            const stamp = metadata(folder, candidate.name)
            if (!belongs(join(folder, candidate.name), config.instance_id)) continue
            const after = metadata(folder, candidate.name)
            if (stamp.identity !== after.identity || stamp.directory !== after.directory) continue
            const previous = [...this.entries.values()].find(item => item.slot === slot && item.folder === folder && item.name === candidate.name && item.instance === config.instance_id && item.identity === stamp.identity && item.directory === stamp.directory)
            const entry: Entry = { ...stamp, id: previous?.id ?? randomUUID(), slot, folder, name: candidate.name, instance: config.instance_id }
            next.set(entry.id, entry)
            copies.push({ id: entry.id, slot, kind: candidate.kind, time: candidate.time, available: true })
          } catch { /* Unknown, inaccessible or changing files are not selectable. */ }
        }
        targets.push({ slot, available: true })
      } catch { targets.push({ slot, available: false }) }
    }
    this.entries = next
    copies.sort((a, b) => b.time.localeCompare(a.time) || a.slot - b.slot || a.id.localeCompare(b.id))
    return { copies, targets, limited }
  }
  capture(id: string, config: Config, destination: (name: string) => string) {
    const entry = this.entries.get(id)
    if (!entry || entry.instance !== config.instance_id || entry.folder !== (entry.slot === 1 ? config.folder1 : config.folder2)) throw new BackupError('INVALID_SELECTION')
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
      if (!belongs(captured, config.instance_id)) throw new BackupError('INVALID_BACKUP')
    } catch (error) { throw error instanceof BackupError ? error : new BackupError('INVALID_SELECTION') }
  }
}
