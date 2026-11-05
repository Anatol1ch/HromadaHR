import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { BackupHistoryStore } from '../dist-electron/electron/backup/history.js'
import { BackupService } from '../dist-electron/electron/backup/service.js'
import { Storage } from '../dist-electron/electron/storage/index.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { openContact } from '../dist-electron/electron/contacts.js'

async function temporary(run) {
  const root = mkdtempSync(join(tmpdir(), 'hr-history-'))
  try { await run(root) } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-history-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  }
}
const event = { time: '2026-11-04T10:00:00.000Z', operation: 'manual', slot: 1, result: 'success', code: null }

test('contact IDs and history IPC enforce argument, sender, frame and URL boundaries', async () => {
  const handlers = new Map(), opened = []
  const contents = { isDestroyed: () => false, mainFrame: { url: 'file:///hr/index.html' } }
  const win = { isDestroyed: () => false, webContents: contents }
  const trusted = { sender: contents, senderFrame: contents.mainFrame }
  registerIpcHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, () => win,
    contents.mainFrame.url, () => ({}), () => ({}), {}, () => {}, {},
    { listPeriods: () => [], proposePeriods: () => [], savePeriods: () => [], deletePeriod: () => null },
    id => openContact(id, async uri => { opened.push(uri) }), () => ({ available: true, events: [event] }))
  const contact = handlers.get(ipcChannels.systemOpenContact), history = handlers.get(ipcChannels.backupGetHistory)
  for (const args of [['https://evil.test'], ['file:///x'], [{ id: 'phone' }], ['phone', 'https://evil.test'], ['__proto__'], []]) {
    assert.equal((await contact(trusted, ...args)).error.code, 'INVALID_ARGUMENTS')
  }
  for (const untrusted of [{ ...trusted, sender: {} }, { ...trusted, senderFrame: null },
    { ...trusted, senderFrame: { url: contents.mainFrame.url } }]) {
    assert.equal((await contact(untrusted, 'phone')).error.code, 'FORBIDDEN')
    assert.equal((await history(untrusted)).error.code, 'FORBIDDEN')
  }
  contents.mainFrame.url = 'https://evil.test'
  assert.equal((await contact(trusted, 'phone')).error.code, 'FORBIDDEN')
  contents.mainFrame.url = 'file:///hr/index.html'
  assert.equal(opened.length, 0)
  for (const id of ['phone', 'workEmail', 'personalEmail', 'telegram']) assert.deepEqual(await contact(trusted, id), { ok: true, data: true })
  assert.deepEqual(opened, ['tel:+380985196340', 'mailto:tech.vishnsrada@ukr.net', 'mailto:myronenko.anatoliu@gmail.com', 'https://t.me/antlmrnnk'])
  assert.equal(await openContact('https://evil.test', async () => assert.fail()), false)
  assert.equal(await openContact('phone', async () => { throw new Error('private system path') }), false)
  assert.equal((await history(trusted, '/arbitrary/path')).error.code, 'INVALID_ARGUMENTS')
  assert.deepEqual(await history(trusted), { ok: true, data: { available: true, events: [event] } })
})

test('history survives restart, bounds records and bytes, rejects corrupted or oversized input', () => temporary(async root => {
  const file = join(root, 'history.json'), store = new BackupHistoryStore(() => file)
  assert.deepEqual(store.get(), { available: true, events: [] })
  for (let index = 0; index < 205; index++) store.append({ ...event, time: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() })
  const restored = new BackupHistoryStore(() => file).get()
  assert.equal(restored.available, true); assert.equal(restored.events.length, 200)
  assert.equal(restored.events[0].time, new Date(Date.UTC(2026, 0, 1, 0, 204)).toISOString())
  assert.ok(statSync(file).size < 64 * 1024)
  writeFileSync(file, 'x'.repeat(65537))
  store.append(event)
  assert.equal(store.get().available, false); assert.equal(statSync(file).size, 65537)
  writeFileSync(file, '[{"private":"unexpected data"}]')
  assert.deepEqual(new BackupHistoryStore(() => file).get(), { available: false, events: [] })
}))

test('real backup results, skipped cycles, restore outcomes and persistence stay separate from SQLite', () => temporary(async root => {
  const storage = new Storage()
  await storage.initializeSafely(() => join(root, 'data', 'app.db'))
  const service = new BackupService(storage)
  const folders = [join(root, 'first'), join(root, 'second')]
  folders.forEach(path => mkdirSync(path))
  try {
    const tokens = []
    for (const [index, path] of folders.entries()) tokens.push((await service.chooseFolder(index + 1, async () => path)).token)
    await service.saveConfig(tokens)
    assert.equal(service.getHistory().events[0].operation, 'config')
    await service.runAutomatic()
    assert.equal(service.getHistory().events.filter(e => e.operation === 'auto' && e.result === 'success').length, 1)
    const before = service.getHistory().events.length
    service.getStatus(); await service.runAutomatic()
    assert.equal(service.getHistory().events.length, before)
    const status = await service.runManual()
    assert.equal(service.getHistory().events.filter(e => e.operation === 'manual').length, 1)
    const source = join(folders[0], status.targets[0].fileName)
    let selection = await service.chooseRestore(async () => source)
    assert.deepEqual(await service.confirmRestore(selection.token, async () => false), { restored: false })
    assert.equal(service.getHistory().events[0].result, 'cancelled')
    selection = await service.chooseRestore(async () => source)
    assert.deepEqual(await service.confirmRestore(selection.token, async () => true), { restored: true })
    assert.equal(service.getHistory().events[0].result, 'success')
    assert.ok(new BackupService(storage).getHistory().events.some(e => e.operation === 'config'))
    await assert.rejects(service.chooseRestore(async () => join(root, 'missing.db')))
    assert.equal(service.getHistory().events[0].code, 'INVALID_BACKUP')
    renameSync(folders[1], folders[1] + '-offline')
    await service.runManual()
    const latest = service.getHistory().events[0]
    assert.equal(latest.result, 'partial')
    assert.equal(latest.slot, null)
    assert.equal(latest.locations.find(e => e.slot === 1).result, 'success')
    assert.equal(latest.locations.find(e => e.slot === 2).result, 'error')
    assert.equal(storage.getDatabase().pragma('integrity_check', { simple: true }), 'ok')
  } finally { service.invalidateSelections(); service.stop(); storage.close() }
}))

test('history write failure cannot cancel successful backup or restore', () => temporary(async root => {
  const storage = new Storage()
  await storage.initializeSafely(() => join(root, 'data', 'app.db'))
  const blocked = join(root, 'blocked'); mkdirSync(blocked)
  const store = new BackupHistoryStore(() => blocked)
  const service = new BackupService(storage, () => new Date(), store)
  try {
    const tokens = []
    for (const slot of [1, 2]) {
      const folder = join(root, `target-${slot}`); mkdirSync(folder)
      tokens.push((await service.chooseFolder(slot, async () => folder)).token)
    }
    await service.saveConfig(tokens)
    const status = await service.runManual()
    assert.ok(status.targets.every(target => target.error === null && target.lastSuccess))
    assert.equal(status.lastBackup.result, 'success'); assert.equal(status.lastBackup.copies, 2)
    assert.equal(service.getHistory().available, false)
    const selected = await service.chooseRestore(async () => join(status.targets[0].path, status.targets[0].fileName))
    assert.deepEqual(await service.confirmRestore(selected.token, async () => true), { restored: true })
    assert.equal(service.getHistory().available, false)
    assert.equal(storage.getDatabase().pragma('integrity_check', { simple: true }), 'ok')
  } finally { service.invalidateSelections(); storage.close() }
}))
