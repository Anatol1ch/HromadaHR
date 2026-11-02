import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { StorageError } from '../storage/errors.js'
import { syncFile } from './files.js'
import { moveNoReplace, openPreservationHandle } from './windows-files.js'

const suffixes = ['', '-wal', '-shm', '-journal'] as const
const journalSchema = z.union([
  z.strictObject({ id: z.uuid() }), // Existing stage 2.4 journal.
  z.strictObject({ id: z.uuid(), version: z.literal(2), raw: z.literal(true) }),
])
const receiptSchema = z.strictObject({ version: z.literal(1), files: z.array(z.strictObject({
  suffix: z.enum(suffixes), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
})).max(4) })
function rawFolder(file: string, id: string) { restoreFiles(file, id); return join(dirname(file), 'protection', `raw-${id}`) }

export function preserveDamagedSet(file: string, id: string) {
  const folder = rawFolder(file, id)
  const handles: { suffix: typeof suffixes[number]; handle: ReturnType<typeof openPreservationHandle> }[] = []
  try {
    // Acquire ALL existing files before copying any of them. Incompatible
    // external SQLite handles cause a controlled refusal, never a live copy.
    for (const suffix of suffixes) {
      try {
        const stat = lstatSync(file + suffix)
        if (!stat.isFile()) throw new StorageError('FILESYSTEM')
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
        throw error
      }
      handles.push({ suffix, handle: openPreservationHandle(file + suffix) })
    }
    mkdirSync(folder, { recursive: true })
    const files = handles.map(({ suffix, handle }) => ({ suffix, ...handle.copyTo(join(folder, `database.db${suffix}`)) }))
    writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ version: 1, files }), { flag: 'wx' })
    syncFile(join(folder, 'manifest.json'))
    verifiedRaw(file, id)
    return { folder,
      moveOriginals(previous: string) { for (const entry of handles) entry.handle.renameTo(previous + entry.suffix) },
      release() { for (const entry of handles) entry.handle.close() },
    }
  } catch (error) { for (const entry of handles) entry.handle.close(); throw error }
}

function verifiedRaw(file: string, id: string) {
  const folder = rawFolder(file, id)
  const receipt = receiptSchema.parse(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')))
  if (new Set(receipt.files.map(entry => entry.suffix)).size !== receipt.files.length) throw new Error('Duplicate files')
  for (const entry of receipt.files) {
    const path = join(folder, `database.db${entry.suffix}`)
    if (!lstatSync(path).isFile()) throw new Error('Invalid preserved file')
    const bytes = readFileSync(path)
    if (bytes.length !== entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Invalid preservation checksum')
  }
  return { folder, files: receipt.files }
}

export function beginEmergencyReplacement(file: string, id: string, moveOriginals: (previous: string) => void) {
  const paths = restoreFiles(file, id)
  verifiedRaw(file, id)
  writeFileSync(paths.journal, JSON.stringify({ id, version: 2, raw: true }), { flag: 'wx' })
  syncFile(paths.journal)
  moveOriginals(paths.previous)
  moveNoReplace(paths.incoming, file)
}

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
  moveNoReplace(file, paths.previous)
  moveNoReplace(paths.incoming, file)
}

export function recoverInterruptedRestore(file: string) {
  const journal = `${file}.restore-journal`
  if (!existsSync(journal)) return
  try {
    const record = journalSchema.parse(JSON.parse(readFileSync(journal, 'utf8')))
    const paths = restoreFiles(file, record.id)
    if ('version' in record && record.version === 2 && 'raw' in record && record.raw === true) {
      const raw = verifiedRaw(file, record.id) // Verify every preserved byte before touching active names.
      const rejected = `${file}.rejected-${randomUUID()}`
      const current: { suffix: string; handle: ReturnType<typeof openPreservationHandle> }[] = []
      const replacements: { suffix: string; handle: ReturnType<typeof openPreservationHandle> }[] = []
      try {
        for (const entry of raw.files) {
          const temporary = `${file}.rollback-${randomUUID()}${entry.suffix}`
          copyFileSync(join(raw.folder, `database.db${entry.suffix}`), temporary, constants.COPYFILE_EXCL)
          syncFile(temporary)
          replacements.push({ suffix: entry.suffix, handle: openPreservationHandle(temporary) })
        }
        // Lock the entire current set before changing any of its names.
        for (const suffix of suffixes) if (existsSync(file + suffix)) current.push({ suffix, handle: openPreservationHandle(file + suffix) })
        for (const entry of current) entry.handle.renameTo(rejected + entry.suffix)
        for (const entry of replacements) entry.handle.renameTo(file + entry.suffix)
      } finally {
        for (const entry of [...current, ...replacements]) entry.handle.close()
      }
      // An originally absent DB is restored as absent, not as an empty SQLite.
      unlinkSync(journal)
      return
    }
    if (existsSync(paths.previous)) {
      // Retain the rejected candidate and any WAL/SHM for technical recovery.
      const rejected = `${file}.rejected-${randomUUID()}`
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(file + suffix)) moveNoReplace(file + suffix, rejected + suffix)
      }
      moveNoReplace(paths.previous, file)
    }
    if (!existsSync(file)) throw new Error('Missing original')
    unlinkSync(journal)
  } catch { throw new StorageError('RECOVERY_REQUIRED') }
}
