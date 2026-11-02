import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync, existsSync, openSync, closeSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import * as fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import Database from 'better-sqlite3'
import { Storage } from '../dist-electron/electron/storage/index.js'
import { storageErrorCode } from '../dist-electron/electron/storage/errors.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { snapshot } from '../dist-electron/electron/backup/files.js'
import { moveNoReplace, openPreservationHandle } from '../dist-electron/electron/backup/windows-files.js'
import { preserveDamagedSet, beginEmergencyReplacement, recoverInterruptedRestore, restoreFiles } from '../dist-electron/electron/backup/recovery.js'

const code = expected => error => error.code === expected
function fixtureTest(name, run) {
  test(name, async () => {
    const root = mkdtempSync(join(tmpdir(), 'hromadahr-reliability-'))
    const file = join(root, 'data', 'app.db'), copies = join(root, 'backups')
    mkdirSync(copies)
    const storages = [], services = []
    async function start() {
      const storage = new Storage(); storages.push(storage)
      await storage.initializeSafely(() => file)
      const service = new BackupService(storage); services.push(service)
      return { storage, service }
    }
    const first = await start()
    first.storage.getDatabase().exec("CREATE TABLE test_payload(value TEXT); INSERT INTO test_payload VALUES ('restored')")
    const source = await snapshot(first.storage.getDatabase(), copies, 'fixture')
    first.storage.close()
    try { await run({ root, file, source, start, copies }) }
    finally {
      for (const service of services) { service.stop(); service.invalidateSelections() }
      for (const storage of storages) storage.close()
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-reliability-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
}
function damagedBytes(file) {
  const bytes = readFileSync(file); bytes[100] = 0xff; writeFileSync(file, bytes); return bytes
}

fixtureTest('Windows same-directory publication refuses an existing destination without replacing either file', async ({ root }) => {
  const a = join(root, 'a.partial'), b = join(root, 'ready.db')
  writeFileSync(a, 'verified snapshot'); writeFileSync(b, 'previous backup')
  assert.throws(() => moveNoReplace(a, b), code('EEXIST'))
  assert.equal(readFileSync(b, 'utf8'), 'previous backup')
  assert.equal(readFileSync(a, 'utf8'), 'verified snapshot')
  unlinkSync(b); moveNoReplace(a, b)
  assert.equal(existsSync(a), false)
  assert.equal(readFileSync(b, 'utf8'), 'verified snapshot')
})

fixtureTest('publication failure preserves previous backups and leaves no ready incomplete snapshot', async ({ root, file, copies, start }) => {
  const { storage } = await start()
  const before = readdirSync(copies)
  const unavailable = join(root, 'absent')
  await assert.rejects(snapshot(storage.getDatabase(), unavailable, 'auto'))
  assert.deepEqual(readdirSync(copies), before)
  const handle = openSync(file, 'r'); closeSync(handle)
})

fixtureTest('online publication needs no hardlinks and cleans its partial file on disk-full failure', async ({ copies, start }) => {
  const { storage } = await start()
  const db = storage.getDatabase()
  const before = readdirSync(copies)
  const backup = db.backup
  db.backup = async temporary => {
    writeFileSync(temporary, 'unfinished')
    throw Object.assign(new Error('Injected disk full'), { code: 'ENOSPC' })
  }
  try { await assert.rejects(snapshot(db, copies, 'manual'), code('ENOSPC')) }
  finally { db.backup = backup }
  assert.deepEqual(readdirSync(copies), before)
  // Disable hardlinks globally: the real SQLite online backup still succeeds.
  const { mock } = await import('node:test')
  const link = mock.method(fs.default, 'linkSync', () => { throw new Error('Hardlinks unavailable') })
  try {
    const result = await snapshot(db, copies, 'manual')
    assert.ok(existsSync(result))
    assert.equal(link.mock.callCount(), 0)
    assert.equal(readdirSync(copies).some(name => name.endsWith('.partial')), false)
  } finally { link.mock.restore() }
})

fixtureTest('valid-header structural corruption can be restored with its exact original bytes retained', async ({ root, file, source, start }) => {
  const original = damagedBytes(file)
  const { storage, service } = await start()
  assert.deepEqual(storage.getStatus(), { state: 'error', code: 'CORRUPT' })
  const selection = await service.chooseRestore(async () => source)
  assert.deepEqual(await service.confirmRestore(selection.token, async () => true), { restored: true })
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_payload').get().value, 'restored')
  const protection = join(root, 'data', 'protection')
  const raw = readdirSync(protection).find(name => name.startsWith('raw-'))
  assert.deepEqual(readFileSync(join(protection, raw, 'database.db')), original)
})

fixtureTest('invalid header preserves the complete db/wal/shm/journal diagnostic set before replacement', async ({ root, file, source, start }) => {
  const expected = { '': Buffer.from('invalid header'), '-wal': Buffer.from('wal diagnostic bytes'),
    '-shm': Buffer.from('shm diagnostic bytes'), '-journal': Buffer.from('rollback diagnostic bytes') }
  for (const [suffix, bytes] of Object.entries(expected)) writeFileSync(file + suffix, bytes)
  const { storage, service } = await start()
  assert.equal(storage.getStatus().code, 'CORRUPT')
  const choice = await service.chooseRestore(async () => source)
  await service.confirmRestore(choice.token, async () => true)
  const protection = join(root, 'data', 'protection')
  const raw = readdirSync(protection).find(name => name.startsWith('raw-'))
  const manifest = JSON.parse(readFileSync(join(protection, raw, 'manifest.json')))
  assert.equal(manifest.files.length, 4)
  for (const [suffix, bytes] of Object.entries(expected)) {
    assert.deepEqual(readFileSync(join(protection, raw, 'database.db' + suffix)), bytes)
    assert.equal(manifest.files.find(entry => entry.suffix === suffix).sha256, createHash('sha256').update(bytes).digest('hex'))
  }
})

fixtureTest('unsupported active schema is distinguished from corruption and may be explicitly replaced', async ({ file, source, start }) => {
  const db = new Database(file); db.pragma('user_version=999'); db.close()
  const { storage, service } = await start()
  assert.equal(storage.getStatus().code, 'UNSUPPORTED_SCHEMA')
  const choice = await service.chooseRestore(async () => source)
  await service.confirmRestore(choice.token, async () => true)
  assert.equal(storage.getStatus().state, 'ready')
})

fixtureTest('known missing database is never recreated on startup/retry and can be recovered from backup', async ({ file, source, start }) => {
  unlinkSync(file)
  const { storage, service } = await start()
  assert.equal(storage.getStatus().code, 'MISSING_DATABASE')
  await service.retryStorage()
  assert.equal(existsSync(file), false)
  const choice = await service.chooseRestore(async () => source)
  await service.confirmRestore(choice.token, async () => true)
  assert.equal(storage.getDatabase().prepare('SELECT value FROM test_payload').get().value, 'restored')
})

fixtureTest('filesystem/access/full/busy errors are not classified as corruption or allowed destructive recovery', async ({ file, source, start }) => {
  unlinkSync(file); mkdirSync(file)
  const { storage, service } = await start()
  assert.equal(storage.getStatus().code, 'FILESYSTEM')
  assert.equal(storage.canRecover(), false)
  let pickerCalled = false
  await assert.rejects(service.chooseRestore(async () => { pickerCalled = true; return source }), code('STORAGE_UNAVAILABLE'))
  assert.equal(pickerCalled, false)
  for (const input of ['EACCES', 'EPERM', 'ENOSPC', 'SQLITE_FULL', 'SQLITE_CANTOPEN', 'SQLITE_IOERR']) {
    assert.equal(storageErrorCode({ code: input }), 'FILESYSTEM')
  }
  assert.equal(storageErrorCode({ code: 'EBUSY' }), 'BUSY')
})

fixtureTest('an unreadable short file reports access failure rather than diagnosing its bytes as corruption', async ({ file, start }) => {
  writeFileSync(file, 'short file')
  const { mock } = await import('node:test')
  const original = fs.default.openSync
  const patched = mock.method(fs.default, 'openSync', (path, ...args) => {
    if (path === file) throw Object.assign(new Error('Injected read access refusal'), { code: 'EACCES' })
    return original(path, ...args)
  })
  syncBuiltinESMExports()
  try {
    const { storage } = await start()
    assert.equal(storage.getStatus().code, 'FILESYSTEM')
    assert.equal(storage.canRecover(), false)
  } finally { patched.mock.restore(); syncBuiltinESMExports() }
  assert.equal(readFileSync(file, 'utf8'), 'short file')
})

fixtureTest('failure to preserve the original refuses emergency replacement without changing any original bytes', async ({ root, file, source, start }) => {
  writeFileSync(file, 'damaged original')
  const { storage, service } = await start()
  const selected = await service.chooseRestore(async () => source)
  writeFileSync(join(root, 'data', 'protection'), 'unrelated object blocks protective directory')
  await assert.rejects(service.confirmRestore(selected.token, async () => true), code('RESTORE_FAILED'))
  assert.equal(readFileSync(file, 'utf8'), 'damaged original')
  assert.equal(storage.getStatus().code, 'CORRUPT')
  assert.equal(existsSync(file + '.restore-journal'), false)
})

fixtureTest('corrupt or incompatible source and user cancellation leave damaged originals unchanged', async ({ root, file, source, start }) => {
  const original = Buffer.from('preserve original'); writeFileSync(file, original)
  const { service } = await start()
  const bad = join(root, 'bad.db'); writeFileSync(bad, 'bad source')
  await assert.rejects(service.chooseRestore(async () => bad), code('INVALID_BACKUP'))
  const future = join(root, 'future.db')
  const db = new Database(future); db.exec('CREATE TABLE test_future(id)'); db.pragma('user_version=999'); db.close()
  await assert.rejects(service.chooseRestore(async () => future), code('UNSUPPORTED_SCHEMA'))
  assert.equal(await service.chooseRestore(async () => null), null)
  const selected = await service.chooseRestore(async () => source)
  assert.deepEqual(await service.confirmRestore(selected.token, async () => false), { restored: false })
  assert.deepEqual(readFileSync(file), original)
  assert.equal(existsSync(join(root, 'data', 'protection')), false)
})

fixtureTest('exclusive preservation refuses another process capable of modifying the damaged file', async ({ file, source, start }) => {
  writeFileSync(file, 'damaged original')
  const { service } = await start()
  const selected = await service.chooseRestore(async () => source)
  const child = spawn(process.execPath, ['-e',
    "const f=require('node:fs');const h=f.openSync(process.argv[1],'r+');console.log('ready');process.stdin.resume();process.stdin.on('end',()=>{f.closeSync(h);process.exit(0)})", file],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  try {
    await once(child.stdout, 'data')
    await assert.rejects(service.confirmRestore(selected.token, async () => true), code('BUSY'))
    assert.equal(readFileSync(file, 'utf8'), 'damaged original')
  } finally { const exited = once(child, 'exit'); child.stdin.end(); await exited }
})

fixtureTest('failed candidate reopen restores damaged original bytes and stays in the recovery state', async ({ file, source, start }) => {
  const original = damagedBytes(file)
  const { storage, service } = await start()
  const selection = await service.chooseRestore(async () => source)
  const reopen = storage.reopen.bind(storage)
  storage.reopen = async recover => {
    if (recover === false) throw new Error('Injected candidate reopen failure')
    return reopen(recover)
  }
  try { await assert.rejects(service.confirmRestore(selection.token, async () => true), code('RESTORE_FAILED')) }
  finally { storage.reopen = reopen }
  assert.deepEqual(readFileSync(file), original)
  assert.equal(storage.getStatus().code, 'CORRUPT')
  await service.retryStorage()
  assert.deepEqual(readFileSync(file), original)
  assert.equal(storage.getStatus().code, 'CORRUPT')
})

fixtureTest('journal rollback handles interruption before, between and after emergency file renames', async ({ root, file, source }) => {
  const expected = { '': Buffer.from('original damaged db'), '-wal': Buffer.from('original wal'), '-shm': Buffer.from('original shm') }
  for (const phase of ['intent', 'one-original-moved', 'installed']) {
    for (const [suffix, bytes] of Object.entries(expected)) writeFileSync(file + suffix, bytes)
    const id = randomUUID(), paths = restoreFiles(file, id)
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { writeFileSync, readFileSync } from 'node:fs';
      import { preserveDamagedSet, beginEmergencyReplacement, restoreFiles } from './dist-electron/electron/backup/recovery.js';
      import { moveNoReplace } from './dist-electron/electron/backup/windows-files.js';
      const [file, source, id, phase] = process.argv.slice(1);
      const paths = restoreFiles(file, id), preservation = preserveDamagedSet(file, id);
      writeFileSync(paths.incoming, readFileSync(source));
      if (phase === 'installed') beginEmergencyReplacement(file, id, preservation.moveOriginals);
      else {
        writeFileSync(paths.journal, JSON.stringify({ id, version: 2, raw: true }));
        if (phase === 'one-original-moved') { preservation.release(); moveNoReplace(file, paths.previous); }
      }
      // Exit without normal cleanup: Windows must release outstanding handles.
      process.exit(73);
    `, file, source, id, phase], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let errors = ''; child.stderr.on('data', chunk => { errors += chunk })
    const [exit] = await once(child, 'exit')
    assert.equal(exit, 73, errors)
    const storage = new Storage()
    try {
      await storage.initializeSafely(() => file)
      assert.equal(storage.getStatus().code, 'CORRUPT', phase)
      for (const [suffix, bytes] of Object.entries(expected)) assert.deepEqual(readFileSync(file + suffix), bytes, phase + suffix)
      assert.equal(existsSync(paths.journal), false)
    } finally { storage.close() }
  }
  assert.ok(readdirSync(join(root, 'data', 'protection')).length >= 3)
})

fixtureTest('corrupted preserved evidence prevents rollback from touching active names', async ({ file, source }) => {
  writeFileSync(file, 'original damaged file')
  const id = randomUUID(), paths = restoreFiles(file, id)
  const preservation = preserveDamagedSet(file, id)
  try {
    writeFileSync(paths.incoming, readFileSync(source))
    beginEmergencyReplacement(file, id, preservation.moveOriginals)
  } finally { preservation.release() }
  const candidate = readFileSync(file)
  writeFileSync(join(preservation.folder, 'database.db'), 'altered evidence')
  assert.throws(() => recoverInterruptedRestore(file), code('RECOVERY_REQUIRED'))
  assert.deepEqual(readFileSync(file), candidate)
  assert.equal(existsSync(paths.journal), true)
})

fixtureTest('closed-file preservation handle copies bytes and denies incompatible opens until closed', async ({ root }) => {
  const source = join(root, 'bytes.db'), destination = join(root, 'preserved.db')
  writeFileSync(source, Buffer.alloc(150000, 0x53))
  const handle = openPreservationHandle(source)
  try {
    assert.throws(() => openSync(source, 'r+'))
    assert.equal(handle.copyTo(destination).size, 150000)
  } finally { handle.close() }
  assert.deepEqual(readFileSync(source), readFileSync(destination))
})
