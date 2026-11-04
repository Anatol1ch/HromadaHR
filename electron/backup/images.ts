import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, lstatSync, openSync, readSync, realpathSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Migration } from '../storage/migrations.js'
import { inspectDatabase } from '../storage/validation.js'
import { BackupError, pathKey, syncFile } from './files.js'
import { moveNoReplace, openPreservationHandle } from './windows-files.js'
import { backupName } from './names.js'

export function fileDigest(path: string) {
  const fd = openSync(path, 'r'), hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024)
  try {
    for (;;) { const count = readSync(fd, buffer, 0, buffer.length, null); if (!count) break; hash.update(buffer.subarray(0, count)) }
    return hash.digest('hex')
  } finally { closeSync(fd) }
}
function identity(path: string) {
  const file = lstatSync(path, { bigint: true })
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1n || pathKey(realpathSync.native(path)) !== pathKey(path)) throw new BackupError('INVALID_BACKUP')
  return `${file.dev}:${file.ino}:${file.birthtimeNs}:${file.ctimeNs}:${file.mtimeNs}:${file.size}`
}
function inspectImage(path: string, digest: string, instance: string, manifest: readonly Migration[]) {
  const before = identity(path)
  inspectDatabase(path, manifest)
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 0 })
  try { if (db.prepare<[], { instance_id: string }>('SELECT instance_id FROM backup_config WHERE id=1').get()?.instance_id !== instance) throw new BackupError('INVALID_BACKUP') }
  finally { db.close() }
  if (fileDigest(path) !== digest || before !== identity(path)) throw new BackupError('INVALID_BACKUP')
}
// Publish a byte-identical closed image independently at each destination.
// This does not invoke SQLite backup again and never overwrites a ready file.
export function publishImage(source: string, folder: string, name: string, instance: string, manifest: readonly Migration[], outputName = name) {
  const parsed = backupName(name)
  if (!parsed?.digest || parsed.instance !== instance) throw new BackupError('INVALID_BACKUP')
  const final = join(folder, outputName), temporary = join(folder, `.${randomUUID()}.partial`)
  let owned = false
  try {
    const before = identity(source), handle = openPreservationHandle(source)
    try {
      if (before !== identity(source)) throw new BackupError('INVALID_BACKUP')
      let digest: string
      try { digest = handle.copyTo(temporary).sha256; owned = true }
      catch (error) {
        // copyTo owns a new partial unless exclusive creation itself failed.
        owned = !(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
        throw error
      }
      if (digest !== parsed.digest) throw new BackupError('INVALID_BACKUP')
    } finally { handle.close() }
    inspectImage(temporary, parsed.digest, instance, manifest)
    syncFile(temporary)
    try { moveNoReplace(temporary, final) }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error
      // A prior publication may have succeeded before its state was committed.
      inspectImage(final, parsed.digest, instance, manifest)
    }
    return final
  } finally {
    if (owned) for (const suffix of ['', '-wal', '-shm', '-journal']) try { unlinkSync(temporary + suffix) } catch {}
  }
}
