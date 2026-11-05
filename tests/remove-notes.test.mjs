import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-remove-notes-'))
  const file = join(root, 'data', 'app.db')
  const handles = []
  t.after(() => { for (const handle of handles) handle.close(); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-remove-notes-')); rmSync(root, { recursive: true, force: true }) })
  const legacy = await openStorageSafely(file, migrations.slice(0, 3))
  handles.push(legacy)
  const ids = { employee: randomUUID(), department: randomUUID(), position: randomUUID(), assignment: randomUUID() }
  legacy.database.prepare('INSERT INTO departments VALUES (?, ?, ?)').run(ids.department, 'Умовний відділ', 'умовний відділ')
  legacy.database.prepare('INSERT INTO positions VALUES (?, ?, ?)').run(ids.position, 'Умовна посада', 'умовна посада')
  legacy.database.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?)').run(ids.employee, 'Синтетичний', 'Приклад', 'Умовний', '2000-02-29', 'official', 'Стара тестова примітка')
  legacy.database.prepare('INSERT INTO employee_positions VALUES (?, ?, ?, ?, ?, ?)').run(ids.assignment, ids.employee, ids.department, ids.position, 'Історична категорія', '2024-02-29')
  const ledger = legacy.database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
  legacy.close()
  return { root, file, handles, ids, ledger }
}
const integrity = db => { assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); assert.deepEqual(db.pragma('foreign_key_check'), []) }

test('v3 → v4 removes only note atomically, preserves all personnel/FK/STRICT/ledger, and verifies the v3 protective copy', async t => {
  const f = await fixture(t)
  assert.equal(migrations[3].requiresBackup, true)
  assert.equal(migrations[3].sql, 'ALTER TABLE employees DROP COLUMN note')
  const current = await openStorageSafely(f.file, migrations.slice(0, 4))
  f.handles.push(current)
  const db = current.database
  assert.equal(current.schemaVersion, 4)
  assert.deepEqual(db.pragma('table_info(employees)').map(row => row.name), ['id', 'last_name', 'first_name', 'middle_name', 'birth_date', 'employee_type'])
  assert.equal(db.pragma('table_list').find(row => row.name === 'employees').strict, 1)
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=3 ORDER BY version').all(), f.ledger)
  assert.equal(db.prepare('SELECT first_name FROM employees WHERE id=?').get(f.ids.employee).first_name, 'Приклад')
  assert.equal(db.prepare('SELECT category FROM employee_positions WHERE id=?').get(f.ids.assignment).category, 'Історична категорія')
  integrity(db)
  const copy = join(f.root, 'data', 'protection', readdirSync(join(f.root, 'data', 'protection')).find(name => name.includes('protect-migration-v4-')))
  assert.equal(inspectDatabase(copy), 3)
  const snapshot = new Database(copy, { readonly: true })
  try { assert.equal(snapshot.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка'); integrity(snapshot) } finally { snapshot.close() }
})

test('v4 cannot remove notes if verified protection fails; SQL failure after DROP rolls back the complete schema', async t => {
  const f = await fixture(t)
  const protection = join(f.root, 'data', 'protection')
  renameSync(protection, join(f.root, 'data', 'saved-protection'))
  writeFileSync(protection, 'blocked')
  await assert.rejects(openStorageSafely(f.file))
  let db = new Database(f.file, { readonly: true })
  try { assert.equal(db.pragma('user_version', { simple: true }), 3); assert.equal(db.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка'); integrity(db) } finally { db.close() }
  rmSync(protection)
  const failing = [...migrations.slice(0, 3), { ...migrations[3], sql: migrations[3].sql + '; INVALID SQL' }]
  await assert.rejects(openStorageSafely(f.file, failing), error => error.code === 'MIGRATION_FAILED')
  db = new Database(f.file, { readonly: true })
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 3)
    assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), f.ledger)
    assert.equal(db.prepare('SELECT note FROM employees').get().note, 'Стара тестова примітка')
    assert.equal(db.prepare('SELECT category FROM employee_positions').get().category, 'Історична категорія')
    integrity(db)
  } finally { db.close() }
})
