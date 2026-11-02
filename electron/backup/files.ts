import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { accessSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  realpathSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { BackupErrorCode } from '../../shared/backup.js'
import { inspectDatabase } from '../storage/validation.js'
import { migrations } from '../storage/migrations.js'
import type { Migration } from '../storage/migrations.js'
import { moveNoReplace } from './windows-files.js'

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) { super(code) }
}

export function pathKey(path: string) {
  const value = resolve(path)
  return process.platform === 'win32' ? value.toLowerCase() : value
}
function overlaps(a: string, b: string) {
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep) || b.startsWith(a.endsWith(sep) ? a : a + sep)
}
export function directory(path: string, writeProbe = false) {
  if (!isAbsolute(path) || !statSync(path).isDirectory()) throw new BackupError('INVALID_FOLDERS')
  const normalized = realpathSync.native(path)
  accessSync(normalized, constants.W_OK | constants.R_OK)
  if (writeProbe) {
    const probe = join(normalized, `.hromadahr-write-${randomUUID()}.tmp`)
    const fd = openSync(probe, 'wx')
    try { fsyncSync(fd) } finally { closeSync(fd); unlinkSync(probe) }
  }
  return normalized
}
export function validateFolders(folders: [string, string], activeFile: string, writeProbe = true) {
  const paths = folders.map(path => directory(path, writeProbe)) as [string, string]
  const keys = paths.map(pathKey)
  const active = pathKey(realpathSync.native(dirname(activeFile)))
  if (overlaps(keys[0], keys[1]) || keys.some(key => overlaps(key, active))) throw new BackupError('INVALID_FOLDERS')
  return { paths, sameVolume: statSync(paths[0]).dev === statSync(paths[1]).dev }
}

export function validateDestination(folder: string, activeFile: string) {
  const normalized = directory(folder, true)
  if (overlaps(pathKey(normalized), pathKey(realpathSync.native(dirname(activeFile))))) throw new BackupError('INVALID_FOLDERS')
  return normalized
}

export function sameFile(first: string, second: string) {
  const a = statSync(first), b = statSync(second)
  return pathKey(realpathSync.native(first)) === pathKey(realpathSync.native(second)) || (a.dev === b.dev && a.ino === b.ino)
}

export function syncFile(path: string) {
  const fd = openSync(path, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

// Only a closed, verified SQLite snapshot is published via a same-directory,
// no-replace Windows move; no hardlink or exists-then-rename fallback.
export async function snapshot(db: Database.Database, folder: string, label: string,
  manifest: readonly Migration[] = migrations, now = new Date()) {
  const fileName = `hromadahr-${label}-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.db`
  const final = join(folder, fileName)
  const temporary = join(folder, `.${fileName}.partial`)
  closeSync(openSync(temporary, 'wx'))
  try {
    await db.backup(temporary)
    // Normalize the standalone snapshot out of WAL before publication, so it
    // never depends on sidecars and readonly checks do not leave -wal/-shm.
    const complete = new Database(temporary, { fileMustExist: true })
    try {
      complete.pragma('wal_checkpoint(TRUNCATE)')
      if (complete.pragma('journal_mode=DELETE', { simple: true }) !== 'delete') throw new BackupError('BACKUP_FAILED')
    } finally { complete.close() }
    inspectDatabase(temporary, manifest)
    syncFile(temporary)
    moveNoReplace(temporary, final)
    return final
  } finally {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try { unlinkSync(temporary + suffix) } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
  }
}

export async function protectMigration(db: Database.Database, activeFile: string, migration: Migration,
  manifest: readonly Migration[] = migrations) {
  const folder = join(dirname(activeFile), 'protection')
  mkdirSync(folder, { recursive: true })
  await snapshot(db, folder, `protect-migration-v${migration.version}`, manifest)
}

export function rotateAutomatic(folder: string, instanceId: string, manifest: readonly Migration[] = migrations) {
  // Namespace belongs to this database lineage, never another profile/app.
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  if (!new RegExp(`^${uuid}$`).test(instanceId)) throw new BackupError('BACKUP_FAILED')
  const owned = new RegExp(`^hromadahr-${instanceId}-auto-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-${uuid}\\.db$`)
  const valid = readdirSync(folder).filter(name => owned.test(name)).sort().reverse().filter(name => {
    const path = join(folder, name)
    try {
      if (!lstatSync(path).isFile()) return false
      inspectDatabase(path, manifest)
      const copy = new Database(path, { readonly: true, fileMustExist: true })
      try {
        const config = copy.prepare<[], { instance_id: string }>('SELECT instance_id FROM backup_config WHERE id=1').get()
        return config?.instance_id === instanceId
      } finally { copy.close() }
    } catch { return false }
  })
  for (const name of valid.slice(14)) unlinkSync(join(folder, basename(name)))
}
