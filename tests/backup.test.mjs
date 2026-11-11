import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Storage, openStorageSafely, storagePath } from '../dist-electron/electron/storage/index.js'
import { migrations } from '../dist-electron/electron/storage/migrations.js'
import { inspectDatabase } from '../dist-electron/electron/storage/validation.js'
import { BackupService, localDay } from '../dist-electron/electron/backup/service.js'
import { validateFolders } from '../dist-electron/electron/backup/files.js'
import { beginReplacement, restoreFiles } from '../dist-electron/electron/backup/recovery.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'

const hasCode = code => error => error.code === code
function temporaryTest(name, run) {
  test(name, async () => {
    const root = mkdtempSync(join(tmpdir(), 'hromadahr-backup-'))
    const file = join(root, 'data', 'app.db')
    const storage = new Storage()
    const clock = { value: new Date(2026, 10, 2, 12) }
    await storage.initializeSafely(() => file)
    assert.equal(storage.getStatus().state, 'ready')
    const service = new BackupService(storage, () => new Date(clock.value))
    const folders = [join(root, 'first'), join(root, 'second')]
    folders.forEach(path => mkdirSync(path))
    const configure = async () => {
      const first = await service.chooseFolder(1, async () => folders[0])
      const second = await service.chooseFolder(2, async () => folders[1])
      return service.saveConfig([first.token, second.token])
    }
    try { await run({ root, file, storage, service, clock, folders, configure }) }
    finally {
      service.stop(); service.invalidateSelections(); storage.close()
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-backup-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}
const copies = (folder, kind) => readdirSync(folder).filter(name => name.includes(`-${kind}-`) && name.endsWith('.db'))

temporaryTest('configuration is atomic, persists across restart, and keeps dev/built separate', async ({ root, storage, service, folders, configure }) => {
  const saved = await configure()
  assert.deepEqual(saved.targets.map(target => target.path), folders)
  assert.equal(saved.sameVolume, true)
  await assert.rejects(service.saveConfig([randomUUID(), null]), hasCode('INVALID_SELECTION'))
  assert.deepEqual(service.getStatus().targets.map(target => target.path), folders)
  storage.close(); await storage.reopen()
  assert.deepEqual(service.getStatus().targets.map(target => target.path), folders)
  const other = new Storage()
  await other.initializeSafely(() => storagePath(root, true))
  try { assert.deepEqual(new BackupService(other).getStatus().targets.map(target => target.path), [null, null]) }
  finally { other.close() }
})

temporaryTest('canonical folder validation rejects duplicates, nested paths, active data and junction aliases', async ({ root, file, folders }) => {
  const nested = join(folders[0], 'nested'); mkdirSync(nested)
  for (const paths of [[folders[0], folders[0]], [folders[0], nested], [nested, folders[0]],
    [join(root, 'data'), folders[1]], [root, folders[0]]]) assert.throws(() => validateFolders(paths, file), hasCode('INVALID_FOLDERS'))
  if (process.platform === 'win32') {
    assert.throws(() => validateFolders([folders[0].toUpperCase() + '\\', folders[0]], file), hasCode('INVALID_FOLDERS'))
    const alias = join(root, 'alias')
    symlinkSync(folders[0], alias, 'junction')
    assert.throws(() => validateFolders([alias, folders[0]], file), hasCode('INVALID_FOLDERS'))
  }
  assert.equal(validateFolders(folders, file).sameVolume, true)
})

temporaryTest('folder choices require Main-issued tokens, expire, and cannot create arbitrary directories', async ({ root, service, clock, folders }) => {
  const absent = join(root, 'never-created')
  await assert.rejects(service.chooseFolder(1, async () => absent), hasCode('FOLDER_UNAVAILABLE'))
  assert.equal(existsSync(absent), false)
  const choice = await service.chooseFolder(1, async () => folders[0])
  await service.chooseFolder(2, async () => folders[1])
  clock.value = new Date(clock.value.getTime() + 11 * 60 * 1000)
  await assert.rejects(service.saveConfig([choice.token, null]), hasCode('INVALID_SELECTION'))
})

temporaryTest('online backup includes committed WAL data and publishes only complete verified snapshots', async ({ storage, service, configure, folders, file }) => {
  await configure()
  const db = storage.getDatabase()
  db.pragma('wal_autocheckpoint=0')
  db.exec("CREATE TABLE test_payload(id INTEGER PRIMARY KEY, text TEXT); INSERT INTO test_payload VALUES (1,'WAL data')")
  assert.ok(statSync(file + '-wal').size > 0)
  const result = await service.runManual()
  assert.ok(result.targets.every(target => !target.error))
  for (const folder of folders) {
    assert.equal(readdirSync(folder).some(name => name.includes('partial')), false)
    const copy = join(folder, copies(folder, 'manual')[0])
    assert.equal(inspectDatabase(copy), storage.getStatus().schemaVersion)
    const database = new Database(copy, { readonly: true })
    try {
      assert.equal(database.prepare('SELECT text FROM test_payload').get().text, 'WAL data')
      assert.equal(database.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, storage.getStatus().schemaVersion)
    } finally { database.close() }
  }
  assert.ok(result.targets.every(target => target.autoDay === null))
})

temporaryTest('partial daily cycle persists failure, backs up online target and retries only the failed target later', async ({ service, configure, folders, clock, storage }) => {
  await configure()
  renameSync(folders[1], folders[1] + '-offline')
  let status = await service.runAutomatic()
  const day = localDay(clock.value)
  assert.equal(status.targets[0].autoDay, day)
  assert.equal(status.targets[1].autoDay, null)
  assert.ok(status.targets[1].error)
  const attempt = status.targets[1].lastAttempt
  await service.runAutomatic()
  assert.equal(service.getStatus().targets[1].lastAttempt, attempt)
  storage.close(); await storage.reopen() // Retry history survives restart.
  renameSync(folders[1] + '-offline', folders[1])
  clock.value = new Date(clock.value.getTime() + 16 * 60 * 1000)
  status = await service.runAutomatic()
  assert.ok(status.targets.every(target => target.autoDay === day && !target.error))
  assert.equal(copies(folders[0], 'auto').length, 1)
  assert.equal(copies(folders[1], 'auto').length, 1)
  await service.runManual()
  assert.ok(service.getStatus().targets.every(target => target.autoDay === day))
  await service.runAutomatic()
  assert.equal(copies(folders[0], 'auto').length, 1)
})

temporaryTest('backup mutex prevents manual, automatic, configuration and restore operations overlapping', async ({ service, configure }) => {
  await configure()
  const running = service.runManual()
  assert.equal(service.isBusy(), true)
  await assert.rejects(service.runManual(), hasCode('BUSY'))
  await assert.rejects(service.chooseRestore(async () => null), hasCode('BUSY'))
  await assert.rejects(service.saveConfig([null, null]), hasCode('BUSY'))
  assert.equal(await service.runAutomatic(), undefined)
  await running
  assert.equal(service.isBusy(), false)
})

temporaryTest('automatic retries stop after four attempts per target/day and resume on the next local day', async ({ service, configure, folders, clock }) => {
  await configure()
  renameSync(folders[1], folders[1] + '-offline')
  for (let attempt = 0; attempt < 4; attempt++) {
    await service.runAutomatic()
    clock.value = new Date(clock.value.getTime() + 16 * 60 * 1000)
  }
  const lastAttempt = service.getStatus().targets[1].lastAttempt
  renameSync(folders[1] + '-offline', folders[1])
  await service.runAutomatic()
  assert.equal(service.getStatus().targets[1].lastAttempt, lastAttempt)
  assert.equal(copies(folders[1], 'auto').length, 0)
  await service.runManual()
  assert.equal(service.getStatus().targets[1].autoDay, null)
  clock.value = new Date(2026, 10, 3, 12)
  await service.runAutomatic()
  assert.equal(copies(folders[1], 'auto').length, 1)
})

temporaryTest('interrupted or invalid snapshot never becomes a ready file and temporary files are cleaned', async ({ storage, service, configure, folders }) => {
  await configure()
  const db = storage.getDatabase(), originalBackup = db.backup
  db.backup = async path => { writeFileSync(path, 'incomplete'); throw new Error('Injected write failure') }
  try {
    const failed = await service.runManual()
    assert.ok(failed.targets.every(target => target.error))
    assert.ok(folders.every(folder => readdirSync(folder).length === 0))
    db.backup = async path => { writeFileSync(path, 'invalid sqlite snapshot') }
    const invalid = await service.runManual()
    assert.ok(invalid.targets.every(target => target.error))
    assert.ok(folders.every(folder => readdirSync(folder).length === 0))
  } finally { db.backup = originalBackup }
})

temporaryTest('rotation retains 14 verified automatic copies, all manual copies, and unrelated files', async ({ service, configure, folders, clock }) => {
  await configure()
  await service.runManual(); await service.runManual()
  writeFileSync(join(folders[0], 'unrelated.db'), 'keep')
  writeFileSync(join(folders[0], `hromadahr-${randomUUID()}-auto-2020-01-01T00-00-00-000Z-${randomUUID()}.db`), 'keep')
  for (let index = 0; index < 17; index++) {
    clock.value = new Date(2026, 10, index + 2, 12)
    await service.runAutomatic()
  }
  assert.equal(copies(folders[1], 'auto').length, 14)
  assert.equal(copies(folders[0], 'auto').length, 15) // Includes the unrelated namespace.
  for (const folder of folders) assert.equal(copies(folder, 'manual').length, 2)
  assert.equal(readFileSync(join(folders[0], 'unrelated.db'), 'utf8'), 'keep')
})

temporaryTest('restore preparation refuses corruption and newer schema without touching the active database', async ({ root, service, storage }) => {
  const bad = join(root, 'bad.db'); writeFileSync(bad, 'not sqlite')
  const newer = join(root, 'newer.db')
  const db = new Database(newer)
  db.pragma('user_version=999'); db.exec('CREATE TABLE test_newer(id)'); db.close()
  storage.getDatabase().exec("CREATE TABLE test_keep(value TEXT); INSERT INTO test_keep VALUES ('original')")
  await assert.rejects(service.chooseRestore(async () => bad), hasCode('INVALID_BACKUP'))
  await assert.rejects(service.chooseRestore(async () => newer), hasCode('UNSUPPORTED_SCHEMA'))
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_keep').get().value, 'original')
})

temporaryTest('restore uses immutable staged source, explicit confirmation and a one-use expiring token', async ({ storage, service, configure, folders, clock }) => {
  await configure()
  storage.getDatabase().exec("CREATE TABLE test_data(value TEXT); INSERT INTO test_data VALUES ('before')")
  await service.runManual()
  const source = join(folders[0], copies(folders[0], 'manual')[0])
  const selected = await service.chooseRestore(async () => source)
  writeFileSync(source, 'external source changed after selection')
  storage.getDatabase().exec("UPDATE test_data SET value='after'")
  await assert.rejects(service.confirmRestore(randomUUID(), async () => true), hasCode('INVALID_SELECTION'))
  const retrySource = join(folders[1], copies(folders[1], 'manual')[0])
  const cancel = await service.chooseRestore(async () => retrySource)
  assert.deepEqual(await service.confirmRestore(cancel.token, async () => false), { restored: false })
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_data').get().value, 'after')
  const expired = await service.chooseRestore(async () => retrySource)
  clock.value = new Date(clock.value.getTime() + 6 * 60 * 1000)
  await assert.rejects(service.confirmRestore(expired.token, async () => true), hasCode('INVALID_SELECTION'))
  const ready = await service.chooseRestore(async () => retrySource)
  // Editing the external source cannot alter the already validated staged file.
  writeFileSync(retrySource, 'changed outside the app')
  assert.deepEqual(await service.confirmRestore(ready.token, async () => true), { restored: true })
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_data').get().value, 'before')
  await assert.rejects(service.confirmRestore(ready.token, async () => true), hasCode('INVALID_SELECTION'))
  assert.ok(selected.token)
})

temporaryTest('successful restore retains a verified protective copy and local destination configuration', async ({ storage, service, configure, folders, file }) => {
  await configure()
  const personnel = new PersonnelService(storage, () => service.isBusy())
  const department = personnel.createDepartment({ name: 'Тестовий відділ' })
  const position = personnel.createPosition({ name: 'Тестова посада' })
  const input = { lastName: 'Тестовий', firstName: 'Тест', middleName: null, birthDate: null,
    hireDate: '2026-01-01', employeeType: 'official', departmentId: department.id, positionId: position.id }
  const employee = personnel.createEmployee(input)
  storage.getDatabase().exec("CREATE TABLE test_data(value TEXT); INSERT INTO test_data VALUES ('snapshot')")
  await service.runManual()
  storage.getDatabase().prepare('DELETE FROM employees WHERE id=?').run(employee.id)
  storage.getDatabase().exec("UPDATE test_data SET value='current'")
  const selected = await service.chooseRestore(async () => join(folders[0], copies(folders[0], 'manual')[0]))
  await service.confirmRestore(selected.token, async () => true)
  assert.deepEqual(personnel.getEmployee(employee.id), employee)
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_data').get().value, 'snapshot')
  assert.deepEqual(service.getStatus().targets.map(target => target.path), folders)
  assert.equal(service.getStatus().lastRestore, 'success')
  assert.equal(existsSync(file + '.restore-journal'), false)
  const protection = join(file, '..', 'protection')
  const names = copies(protection, 'restore')
  assert.equal(names.length, 1)
  const copy = new Database(join(protection, names[0]), { readonly: true })
  try { assert.equal(copy.prepare('SELECT value FROM test_data').get().value, 'current') } finally { copy.close() }
})

temporaryTest('failed replacement reopen rolls back the actual SQLite files and retains protection', async ({ storage, service, configure, folders, file }) => {
  await configure()
  storage.getDatabase().exec("CREATE TABLE test_value(v); INSERT INTO test_value VALUES ('backup')")
  await service.runManual()
  storage.getDatabase().exec("UPDATE test_value SET v='original'")
  const selected = await service.chooseRestore(async () => join(folders[0], copies(folders[0], 'manual')[0]))
  const originalReopen = storage.reopen.bind(storage)
  storage.reopen = async recover => {
    if (recover === false) throw new Error('Injected failure after physical replacement, before reopening')
    return originalReopen(recover)
  }
  try { await assert.rejects(service.confirmRestore(selected.token, async () => true), hasCode('RESTORE_FAILED')) }
  finally { storage.reopen = originalReopen }
  assert.equal(storage.getDatabase().prepare('SELECT v FROM test_value').get().v, 'original')
  assert.equal(service.getStatus().lastRestore, 'rolled-back')
  assert.equal(existsSync(file + '.restore-journal'), false)
  assert.equal(copies(join(file, '..', 'protection'), 'restore').length, 1)
})

temporaryTest('interrupted restore journal recovers the original on next initialization', async ({ storage, service, configure, folders, file }) => {
  await configure()
  storage.getDatabase().exec("CREATE TABLE test_value(v); INSERT INTO test_value VALUES ('snapshot')")
  await service.runManual()
  storage.getDatabase().exec("UPDATE test_value SET v='original'")
  storage.getDatabase().pragma('wal_checkpoint(TRUNCATE)')
  storage.close()
  const id = randomUUID(), paths = restoreFiles(file, id)
  // Closed, verified snapshot only, never the active WAL database.
  const source = readFileSync(join(folders[0], copies(folders[0], 'manual')[0]))
  writeFileSync(paths.incoming, source)
  beginReplacement(file, id)
  await storage.reopen()
  assert.equal(storage.getDatabase().prepare('SELECT v FROM test_value').get().v, 'original')
})

temporaryTest('compatible older backup is migrated on restore without changing its source', async ({ root, storage, service, configure }) => {
  await configure()
  const legacyFile = join(root, 'legacy', 'source.db')
  const legacy = await openStorageSafely(legacyFile, [migrations[0]])
  legacy.database.exec("CREATE TABLE test_older(value TEXT); INSERT INTO test_older VALUES ('legacy')")
  legacy.close()
  const before = readFileSync(legacyFile)
  const selection = await service.chooseRestore(async () => legacyFile)
  assert.equal(selection.schemaVersion, 1)
  await service.confirmRestore(selection.token, async () => true)
  assert.equal(storage.getStatus().schemaVersion, 14)
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_older').get().value, 'legacy')
  assert.deepEqual(readFileSync(legacyFile), before)
})

temporaryTest('failed rollback leaves storage unavailable and durable journal allows recovery on next startup', async ({ storage, service, configure, folders, file }) => {
  await configure()
  storage.getDatabase().exec("CREATE TABLE test_recover(v); INSERT INTO test_recover VALUES ('backup')")
  await service.runManual()
  storage.getDatabase().exec("UPDATE test_recover SET v='original'")
  const selection = await service.chooseRestore(async () => join(folders[0], copies(folders[0], 'manual')[0]))
  const reopen = storage.reopen.bind(storage)
  storage.reopen = async () => { throw new Error('Injected open failure') }
  try { await assert.rejects(service.confirmRestore(selection.token, async () => true), hasCode('RECOVERY_REQUIRED')) }
  finally { storage.reopen = reopen }
  assert.deepEqual(storage.getStatus(), { state: 'error', code: 'RECOVERY_REQUIRED' })
  assert.throws(() => storage.getDatabase())
  // Recovery had already restored the original physical file before open failed.
  await storage.reopen()
  assert.equal(storage.getDatabase().prepare('SELECT v FROM test_recover').get().v, 'original')
  assert.equal(existsSync(file + '.restore-journal'), false)
})

temporaryTest('critical startup migration creates a verified pre-migration snapshot once and retains it on SQL failure', async ({ root }) => {
  const legacyFile = join(root, 'critical', 'legacy.db')
  const legacy = await openStorageSafely(legacyFile, [migrations[0]])
  legacy.database.exec("CREATE TABLE test_legacy(v); INSERT INTO test_legacy VALUES ('preserved')")
  legacy.close()
  const nextVersion = migrations.length + 1
  const critical = [...migrations, { version: nextVersion, name: 'test_critical', requiresBackup: true, sql: 'CREATE TABLE test_new(id INTEGER)' }]
  const upgraded = await openStorageSafely(legacyFile, critical); upgraded.close()
  const protection = join(root, 'critical', 'protection')
  const snapshots = critical.slice(1).filter(migration => migration.requiresBackup).length
  assert.equal(readdirSync(protection).length, snapshots)
  const copy = join(protection, readdirSync(protection).find(name => name.includes(`protect-migration-v${nextVersion}-`)))
  assert.equal(inspectDatabase(copy), nextVersion - 1)
  const reopened = await openStorageSafely(legacyFile, critical); reopened.close()
  assert.equal(readdirSync(protection).length, snapshots)
  const failed = [...critical, { version: nextVersion + 1, name: 'test_fail', requiresBackup: true, sql: 'CREATE TABLE test_fail(id); INVALID SQL' }]
  await assert.rejects(openStorageSafely(legacyFile, failed), hasCode('MIGRATION_FAILED'))
  assert.equal(readdirSync(protection).length, snapshots + 1)
  const healthy = await openStorageSafely(legacyFile, critical)
  try { assert.equal(healthy.schemaVersion, nextVersion) } finally { healthy.close() }
})

temporaryTest('critical migration never executes when protective-copy creation fails', async ({ root }) => {
  const file = join(root, 'critical-failure', 'app.db')
  const prior = await openStorageSafely(file); prior.close()
  renameSync(join(root, 'critical-failure', 'protection'), join(root, 'critical-failure', 'migration-protection'))
  writeFileSync(join(root, 'critical-failure', 'protection'), 'blocked')
  const critical = [...migrations, { version: migrations.length + 1, name: 'test_blocked', requiresBackup: true, sql: 'CREATE TABLE test_blocked(id)' }]
  await assert.rejects(openStorageSafely(file, critical))
  const after = await openStorageSafely(file)
  try {
    assert.equal(after.schemaVersion, 14)
    assert.equal(after.database.prepare("SELECT name FROM sqlite_schema WHERE name='test_blocked'").get(), undefined)
  } finally { after.close() }
})
