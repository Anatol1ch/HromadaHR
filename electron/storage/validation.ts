import Database from 'better-sqlite3'
import { closeSync, lstatSync, openSync, readSync } from 'node:fs'
import { StorageError } from './errors.js'
import { migrations, readSchemaVersion } from './migrations.js'
import type { Migration } from './migrations.js'

export function checkIntegrity(db: Database.Database) {
  const rows = db.pragma('integrity_check') as { integrity_check: string }[]
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok' ||
    (db.pragma('foreign_key_check') as unknown[]).length) throw new StorageError('CORRUPT')
}

export function validateExistingFile(path: string) {
  const stat = lstatSync(path)
  if (!stat.isFile()) throw new StorageError('FILESYSTEM')
  if (stat.size < 100) throw new StorageError('CORRUPT')
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(16)
    if (readSync(descriptor, header, 0, 16, 0) !== 16 || header.toString() !== 'SQLite format 3\0') throw new StorageError('CORRUPT')
  } finally { closeSync(descriptor) }
}

export function inspectDatabase(path: string, manifest: readonly Migration[] = migrations) {
  validateExistingFile(path)
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 5000 })
  try {
    checkIntegrity(db)
    const version = readSchemaVersion(db, manifest)
    if (version < 1) throw new StorageError('UNSUPPORTED_SCHEMA')
    return version
  } finally { db.close() }
}
