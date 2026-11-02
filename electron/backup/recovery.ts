import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { StorageError } from '../storage/errors.js'
import { syncFile } from './files.js'

export function restoreFiles(file: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new StorageError('RECOVERY_REQUIRED')
  return { journal: `${file}.restore-journal`, previous: `${file}.previous-${id}`, incoming: `${file}.incoming-${id}` }
}
export function beginReplacement(file: string, id: string) {
  const paths = restoreFiles(file, id)
  if (existsSync(paths.journal) || existsSync(paths.previous)) throw new StorageError('RECOVERY_REQUIRED')
  // Durable intent precedes any rename of the active database.
  writeFileSync(paths.journal, JSON.stringify({ id }), { flag: 'wx' })
  syncFile(paths.journal)
  renameSync(file, paths.previous)
  renameSync(paths.incoming, file)
}

export function recoverInterruptedRestore(file: string) {
  const journal = `${file}.restore-journal`
  if (!existsSync(journal)) return
  try {
    const record: unknown = JSON.parse(readFileSync(journal, 'utf8'))
    if (!record || typeof record !== 'object' || !('id' in record) || typeof record.id !== 'string') {
      throw new Error('Invalid journal')
    }
    const paths = restoreFiles(file, record.id)
    if (existsSync(paths.previous)) {
      // Retain the rejected candidate and any WAL/SHM for technical recovery.
      const rejected = `${file}.rejected-${randomUUID()}`
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(file + suffix)) renameSync(file + suffix, rejected + suffix)
      }
      renameSync(paths.previous, file)
    }
    if (!existsSync(file)) throw new Error('Missing original')
    unlinkSync(journal)
  } catch { throw new StorageError('RECOVERY_REQUIRED') }
}
