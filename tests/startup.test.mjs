import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { STARTUP_MINIMUM_MS, waitForStartupGate } from '../src/lib/startup-timing.ts'
import { createStartup } from '../dist-electron/electron/startup.js'
import { Storage } from '../dist-electron/electron/storage/index.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('successful startup waits only the remaining two-second minimum', async () => {
  const waits = []
  const ready = { state: 'ready' }
  const result = await waitForStartupGate(100, STARTUP_MINIMUM_MS, async () => ready, () => 600, async ms => { waits.push(ms) })
  assert.equal(result, ready)
  assert.deepEqual(waits, [1500])
})

test('slow initialization remains pending, then opens without an extra minimum delay', async () => {
  const initialization = deferred()
  let finished = false
  const result = waitForStartupGate(100, STARTUP_MINIMUM_MS, () => initialization.promise, () => 5100, async () => assert.fail('No extra delay'))
  void result.then(() => { finished = true })
  await Promise.resolve()
  assert.equal(finished, false)
  initialization.resolve('ready')
  assert.equal(await result, 'ready')
})

test('critical storage error or rejected initialization bypasses the minimum', async () => {
  const error = { state: 'error', code: 'CORRUPT' }
  assert.equal(await waitForStartupGate(100, STARTUP_MINIMUM_MS, async () => error, () => 101,
    async () => assert.fail('Error must not wait'), value => value.state === 'error'), error)
  await assert.rejects(waitForStartupGate(0, STARTUP_MINIMUM_MS, async () => { throw new Error('failed') }, () => 1,
    async () => assert.fail('Rejection must not wait')), /failed/)
})

test('Main opens window first and coalesces startup; retry/personnel cannot open an initializing SQLite', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hr-startup-'))
  const storage = new Storage(), backup = new BackupService(storage)
  const window = deferred(), allowInitialization = deferred()
  const events = []
  const startup = createStartup({
    openWindow: async () => { events.push('window'); return window.promise },
    initializeStorage: async () => {
      events.push('initialize')
      await allowInitialization.promise
      await storage.initializeSafely(() => join(root, 'data', 'app.db'))
    },
    getStatus: () => storage.getStatus(), startBackups: () => events.push('backups'), isClosing: () => false,
  })
  try {
    const first = startup.start()
    assert.equal(startup.start(), first)
    assert.deepEqual(events, ['window'])
    assert.equal((await backup.retryStorage()).state, 'initializing')
    window.resolve(true)
    await Promise.resolve(); await Promise.resolve()
    assert.equal(startup.isInitializing(), true)
    assert.equal((await backup.retryStorage()).state, 'initializing')
    assert.throws(() => new PersonnelService(storage, () => false).listEmployees(), { code: 'STORAGE_UNAVAILABLE' })
    allowInitialization.resolve()
    await first
    assert.equal(storage.getStatus().state, 'ready')
    assert.deepEqual(events, ['window', 'initialize', 'backups'])
    assert.equal(startup.isInitializing(), false)
    await startup.start()
    assert.deepEqual(events, ['window', 'initialize', 'backups'])
  } finally {
    storage.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-startup-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  }
})

test('Main never starts backups after failed initialization or shutdown during startup', async () => {
  for (const scenario of ['error', 'closing', 'window-closed']) {
    let closing = false, initialized = 0
    const startup = createStartup({
      openWindow: async () => scenario !== 'window-closed',
      initializeStorage: async () => { initialized++; closing = scenario === 'closing' },
      getStatus: () => scenario === 'error' ? { state: 'error', code: 'CORRUPT' } : { state: 'ready' },
      startBackups: () => assert.fail('No automatic cycle'), isClosing: () => closing,
    })
    await startup.start()
    assert.equal(initialized, scenario === 'window-closed' ? 0 : 1)
    assert.equal(startup.isInitializing(), false)
  }
})
