import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { PersonnelError, PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'

const url = 'file:///app/dist/index.html'
const info = { name: 'HromadaHR', version: '0.1.0', mode: 'built' }

function setup(getInfo = () => info, allowedUrl = url, personnel) {
  const handlers = new Map()
  const contents = { isDestroyed: () => false, mainFrame: { url: allowedUrl } }
  let currentWindow = { isDestroyed: () => false, webContents: contents }
  let executions = 0
  registerIpcHandlers({ handle: (channel, handler) => {
    assert.equal(handlers.has(channel), false)
    handlers.set(channel, handler)
  } }, () => currentWindow, allowedUrl, () => { executions++; return getInfo() },
  () => ({ state: 'ready', created: false, schemaVersion: 1 }), {
    getStatus: () => ({ targets: [1, 2].map(slot => ({ slot, path: null, available: false, autoDay: null,
      lastAttempt: null, lastSuccess: null, lastKind: null, error: null, fileName: null })),
      busy: false, sameVolume: false, lastRestore: null }),
    chooseFolder: async () => null, chooseRestore: async () => null,
    saveConfig: async () => { throw new Error('Not selected') }, runManual: async () => { throw new Error('Not configured') },
    confirmRestore: async () => { throw new Error('Not selected') },
    retryStorage: async () => ({ state: 'ready', created: false, schemaVersion: 1 }),
  }, () => {}, personnel, { listPeriods: () => [], proposePeriods: () => [], savePeriods: () => [], deletePeriod: () => null })
  const event = { sender: contents, senderFrame: contents.mainFrame }
  return {
    handlers, event, contents,
    call: (eventOverride = event, ...args) => handlers.get(ipcChannels.systemGetInfo)(eventOverride, ...args),
    replaceWindow: (window) => { currentWindow = window },
    executions: () => executions,
  }
}

test('explicit diagnostic succeeds in built and dev, returns only public fields', () => {
  for (const allowedUrl of [url, 'http://127.0.0.1:5176/']) {
    const fixture = setup(() => info, allowedUrl)
    assert.deepEqual(fixture.call(), { ok: true, data: info })
    assert.equal(fixture.executions(), 1)
  }
})

test('Zod rejects every unexpected argument before execution', () => {
  const fixture = setup()
  for (const args of [[undefined], [null], [{}], ['x'], [1], [[], {}]]) {
    assert.deepEqual(fixture.call(fixture.event, ...args), { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
  }
  assert.equal(fixture.executions(), 0)
})

test('only allowlisted channel is registered; arbitrary channels have no handler', () => {
  const { handlers } = setup()
  assert.deepEqual([...handlers.keys()].sort(), Object.values(ipcChannels).sort())
  for (const channel of ['system:delete', 'employees:list', '__proto__', 'invoke']) {
    assert.equal(handlers.has(channel), false)
  }
})

test('recovery retry and quit retain sender/frame/URL checks and reject arbitrary filesystem arguments', async () => {
  const fixture = setup()
  for (const channel of [ipcChannels.storageRetry, ipcChannels.systemQuit, ipcChannels.backupChooseRestore, ipcChannels.backupConfirmRestore]) {
    const handler = fixture.handlers.get(channel)
    for (const event of [{ ...fixture.event, sender: {} }, { ...fixture.event, senderFrame: { url } }]) {
      assert.deepEqual(await handler(event), { ok: false, error: { code: 'FORBIDDEN' } })
    }
    assert.deepEqual(await handler(fixture.event, { path: 'C:\\arbitrary.db', confirmed: true }),
      { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
    fixture.contents.mainFrame.url = 'https://example.com/'
    assert.deepEqual(await handler(fixture.event), { ok: false, error: { code: 'FORBIDDEN' } })
    fixture.contents.mainFrame.url = url
  }
  assert.equal((await fixture.handlers.get(ipcChannels.storageRetry)(fixture.event)).data.state, 'ready')
})

test('foreign WebContents is rejected even with the trusted URL and frame', () => {
  const fixture = setup()
  assert.deepEqual(fixture.call({ ...fixture.event, sender: { mainFrame: fixture.event.senderFrame } }),
    { ok: false, error: { code: 'FORBIDDEN' } })
  assert.equal(fixture.executions(), 0)
})

test('subframe, missing frame and unexpected document are rejected', () => {
  const fixture = setup()
  for (const senderFrame of [{ url }, null]) {
    assert.deepEqual(fixture.call({ ...fixture.event, senderFrame }), { ok: false, error: { code: 'FORBIDDEN' } })
  }
  fixture.contents.mainFrame.url = 'https://example.com/'
  assert.deepEqual(fixture.call(), { ok: false, error: { code: 'FORBIDDEN' } })
  assert.equal(fixture.executions(), 0)
})

test('closed, destroyed and replaced windows cannot invoke', () => {
  for (const replacement of [null, { isDestroyed: () => true }, {
    isDestroyed: () => false, webContents: { isDestroyed: () => false, mainFrame: { url } },
  }]) {
    const fixture = setup()
    fixture.replaceWindow(replacement)
    assert.deepEqual(fixture.call(), { ok: false, error: { code: 'FORBIDDEN' } })
    assert.equal(fixture.executions(), 0)
  }
  const fixture = setup()
  fixture.contents.isDestroyed = () => true
  assert.deepEqual(fixture.call(), { ok: false, error: { code: 'FORBIDDEN' } })
})

test('exceptions and invalid output become controlled errors without leaked details', () => {
  for (const operation of [() => { throw new Error('secret path') }, () => ({ ...info, path: 'secret' }), () => ({ ...info, mode: 'other' })]) {
    assert.deepEqual(setup(operation).call(), { ok: false, error: { code: 'INTERNAL_ERROR' } })
  }
})

function preload(invoke) {
  const exposed = new Map()
  runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs', import.meta.url), 'utf8'), {
    require: (name) => {
      assert.equal(name, 'electron', 'sandbox preload must not require local/Node modules')
      return {
        contextBridge: { exposeInMainWorld: (key, value) => exposed.set(key, value) },
        ipcRenderer: { invoke },
      }
    },
  })
  assert.deepEqual([...exposed.keys()], ['hromadaHR'])
  return exposed.get('hromadaHR')
}

test('built preload exposes only the typed method and invokes the real handler', async () => {
  const fixture = setup()
  const calls = []
  const api = preload(async (channel, ...args) => {
    calls.push([channel, ...args])
    return fixture.handlers.get(channel)(fixture.event, ...args)
  })
  assert.deepEqual(Object.keys(api).sort(), ['backup', 'documents', 'leave', 'personnel', 'personnelControl', 'seniorityRanks', 'storage', 'system'])
  assert.deepEqual(Object.keys(api.backup).sort(), ['chooseFolder', 'chooseRestore', 'confirmRestore', 'getHistory', 'getStatus', 'listCopies', 'openBackupFolder', 'runManual', 'saveConfig', 'selectCopy'])
  assert.deepEqual(Object.keys(api.system).sort(), ['getInfo', 'getZoom', 'openContact', 'quit', 'setZoom'])
  assert.deepEqual(Object.keys(api.storage).sort(), ['getStatus', 'retry'])
  assert.deepEqual(await api.system.getInfo(), { ok: true, data: info })
  // JS callers cannot smuggle a channel/arguments through the public method.
  await api.system.getInfo('system:delete', { path: 'secret' })
  assert.deepEqual(calls, [[ipcChannels.systemGetInfo], [ipcChannels.systemGetInfo]])
  assert.deepEqual(await api.storage.getStatus(), { ok: true, data: { state: 'ready', created: false, schemaVersion: 1 } })
  for (const key of ['invoke', 'send', 'on', 'ipcRenderer', 'require', 'fs']) assert.equal(api[key], undefined)
})

test('preload normalizes transport rejection', async () => {
  const api = preload(async () => { throw new Error('private transport details') })
  assert.equal(JSON.stringify(await api.system.getInfo()), JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE' } }))
  assert.equal(JSON.stringify(await api.storage.getStatus()), JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE' } }))
})

test('storage status uses the same sender, frame and argument validation', () => {
  const fixture = setup()
  const call = fixture.handlers.get(ipcChannels.storageGetStatus)
  assert.deepEqual(call(fixture.event), { ok: true, data: { state: 'ready', created: false, schemaVersion: 1 } })
  assert.deepEqual(call(fixture.event, {}), { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
  assert.deepEqual(call({ ...fixture.event, sender: {} }), { ok: false, error: { code: 'FORBIDDEN' } })
  assert.deepEqual(call({ ...fixture.event, senderFrame: { url } }), { ok: false, error: { code: 'FORBIDDEN' } })
})

test('every backup operation rejects foreign sender, subframe and foreign URL before execution', async () => {
  const fixture = setup()
  const uuid = '11111111-1111-4111-8111-111111111111'
  const operations = [
    [ipcChannels.backupGetStatus, []], [ipcChannels.backupChooseFolder, [1]],
    [ipcChannels.backupSaveConfig, [[null, null]]], [ipcChannels.backupRunManual, []],
    [ipcChannels.backupChooseRestore, []], [ipcChannels.backupConfirmRestore, [uuid]],
  ]
  for (const [channel, args] of operations) {
    const call = fixture.handlers.get(channel)
    for (const event of [{ ...fixture.event, sender: {} }, { ...fixture.event, senderFrame: { url } },
      { ...fixture.event, senderFrame: null }]) {
      assert.deepEqual(await call(event, ...args), { ok: false, error: { code: 'FORBIDDEN' } }, channel)
    }
    fixture.contents.mainFrame.url = 'https://example.com/'
    assert.deepEqual(await call(fixture.event, ...args), { ok: false, error: { code: 'FORBIDDEN' } }, channel)
    fixture.contents.mainFrame.url = url
  }
})

test('backup IPC validates tokens and operation signatures rather than accepting paths, SQL or confirmed flags', async () => {
  const { handlers, event } = setup()
  for (const [channel, args] of [
    [ipcChannels.backupGetStatus, ['C:\\private']], [ipcChannels.backupChooseFolder, ['C:\\private']],
    [ipcChannels.backupChooseFolder, [3]], [ipcChannels.backupSaveConfig, [['C:\\first', 'C:\\second']]],
    [ipcChannels.backupSaveConfig, [[null, null], { sql: 'DELETE' }]],
    [ipcChannels.backupRunManual, [{ path: 'C:\\private' }]],
    [ipcChannels.backupChooseRestore, ['C:\\private.db']],
    [ipcChannels.backupConfirmRestore, [{ confirmed: true, path: 'C:\\private.db' }]],
    [ipcChannels.backupConfirmRestore, ['not-a-token']],
  ]) assert.deepEqual(await handlers.get(channel)(event, ...args), { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
  for (const channel of ['fs:read', 'fs:write', 'backup:delete', 'sql:exec', 'invoke']) assert.equal(handlers.has(channel), false)
  const api = preload(async () => { throw new Error('private details') })
  for (const key of ['fs', 'readFile', 'writeFile', 'exec', 'invoke', 'sql', 'delete']) assert.equal(api.backup[key], undefined)
  assert.equal((await api.backup.runManual()).error.code, 'UNAVAILABLE')
})

test('every personnel channel enforces sender/frame/URL and strict argument schemas', async () => {
  let executions = 0
  const personnel = new Proxy({}, { get: () => () => { executions++; return [] } })
  const fixture = setup(() => info, url, personnel)
  const id = '11111111-1111-4111-8111-111111111111'
  const details = { lastName: 'Тест', firstName: 'Тест', middleName: null, birthDate: null,
    employeeType: 'official', positionId: id, departmentId: id, positionStartedOn: null, positionCategory: null, hireDate: '2026-01-01' }
  const operations = {
    deleteEmployee: [id],
    listEmployees: [], getEmployee: [id], createEmployee: [details],
    updateEmployee: [id, details], listDepartments: [],
    createDepartment: [{ name: 'Тест' }],
    listPositions: [], createPosition: [{ name: 'Тест' }],
    getDictionary: ['department'], renameDictionaryEntry: ['department', id, 'Тест', 0],
    deleteDictionaryEntry: ['position', id, 0], reorderDictionary: ['position', [id], 0],
  }
  for (const [method, args] of Object.entries(operations)) {
    const call = fixture.handlers.get(`personnel:${method}`)
    for (const event of [{ ...fixture.event, sender: {} }, { ...fixture.event, senderFrame: { url } },
      { ...fixture.event, senderFrame: null }]) {
      assert.deepEqual(await call(event, ...args), { ok: false, error: { code: 'FORBIDDEN' } }, method)
    }
    fixture.contents.mainFrame.url = 'https://example.com/'
    assert.deepEqual(await call(fixture.event, ...args), { ok: false, error: { code: 'FORBIDDEN' } })
    fixture.contents.mainFrame.url = url
    for (const invalid of [method==='updateEmployee'?[...args,false,undefined]:[...args,undefined], [{ sql: 'DELETE', path: 'C:\\private' }]]) {
      assert.deepEqual(await call(fixture.event, ...invalid), { ok: false, error: { code: 'INVALID_ARGUMENTS' } }, method)
    }
  }
  assert.equal(executions, 0)
  const create = fixture.handlers.get(ipcChannels.personnelCreateEmployee)
  for (const change of [{ positionStartedOn: null, positionCategory: null, hireDate: '2026-02-30' }, { firstName: ' ' }, { birthDate: '2027-01-01' }, { unexpected: true }]) {
    assert.deepEqual(await create(fixture.event, { ...operations.createEmployee[0], ...change }),
      { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
  }
})

test('personnel IPC validates responses and preserves controlled domain errors without leaking exceptions', async () => {
  for (const [operation, expected] of [
    [() => [], { ok: true, data: [] }],
    [() => [{ id: 'bad', path: 'secret' }], { ok: false, error: { code: 'INTERNAL_ERROR' } }],
    [() => { throw new Error('private SQL') }, { ok: false, error: { code: 'INTERNAL_ERROR' } }],
    [() => { throw new PersonnelError('CONFLICT') }, { ok: false, error: { code: 'CONFLICT' } }],
    [() => { throw new PersonnelError('STORAGE_UNAVAILABLE') }, { ok: false, error: { code: 'STORAGE_UNAVAILABLE' } }],
  ]) {
    const f = setup(() => info, url, { listEmployees: operation })
    assert.deepEqual(await f.handlers.get(ipcChannels.personnelListEmployees)(f.event), expected)
  }
})

test('preload personnel methods expose exactly the allowlist and fixed argument signatures', async () => {
  const calls = []
  const api = preload(async (channel, ...args) => { calls.push([channel, ...args]); return { ok: true, data: null } })
  const methods = Object.values(ipcChannels).filter(c => c.startsWith('personnel:')).map(c => c.split(':')[1])
  assert.deepEqual(Object.keys(api.personnel).sort(), methods.sort())
  const sizes = { updateEmployee: 3, getDictionary: 1, renameDictionaryEntry: 4, deleteDictionaryEntry: 3, reorderDictionary: 3 }
  for (const method of methods) {
    const args = ['id', 'input', 'third', 'fourth', 'extra']
    await api.personnel[method](...args)
    const expectedArgs = args.slice(0, sizes[method] ?? (method.startsWith('list') ? 0 : method.startsWith('update') ? 2 : 1))
    assert.deepEqual(calls.at(-1), [`personnel:${method}`, ...expectedArgs])
  }
  for (const key of ['invoke', 'sql', 'fs', 'database', 'send']) assert.equal(api.personnel[key], undefined)
})

test('built preload → IPC → personnel → isolated SQLite supports current employee CRUD', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-personnel-ipc-'))
  const connection = await openStorageSafely(join(root, 'test.db'))
  t.after(() => {
    connection.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-personnel-ipc-'))
    rmSync(root, { recursive: true, force: true })
  })
  const service = new PersonnelService({ getDatabase: () => connection.database }, () => false)
  const f = setup(() => info, url, service)
  const api = preload(async (channel, ...args) => f.handlers.get(channel)(f.event, ...args)).personnel
  const department = (await api.createDepartment({ name: 'Відділ' })).data
  const position = (await api.createPosition({ name: 'Посада' })).data
  const input = { lastName: 'Тест', firstName: 'Тест', middleName: null, birthDate: null,
    employeeType: 'official', positionId: position.id, departmentId: department.id, positionStartedOn: null, positionCategory: null, hireDate: '2026-01-01' }
  const created = await api.createEmployee(input)
  assert.equal(created.ok, true)
  const { id } = created.data
  assert.equal((await api.listEmployees()).data[0].id, id)
  const newPosition = (await api.createPosition({ name: 'Інша посада' })).data
  const updated = await api.updateEmployee(id, { ...input, positionId: newPosition.id, positionStartedOn: null, positionCategory: null, hireDate: '2026-02-01' })
  assert.equal(updated.ok, true)
  assert.equal(updated.data.position.id, newPosition.id)
  assert.equal(updated.data.hireDate, '2026-02-01')
  assert.deepEqual(await api.getEmployee(id), updated)
  for (const extra of [{ category: null }, { startDate: input.hireDate }, { note: null }]) {
    assert.equal((await api.createEmployee({ ...input, ...extra })).error.code, 'INVALID_ARGUMENTS')
    assert.equal((await api.updateEmployee(id, { ...input, ...extra })).error.code, 'INVALID_ARGUMENTS')
  }
  assert.equal((await api.deleteEmployee(id)).ok, true)
  assert.equal((await api.getEmployee(id)).error.code, 'NOT_FOUND')
  assert.equal((await api.listDepartments()).data.length, 1)
  assert.equal((await api.listPositions()).data.length, 2)
  assert.equal((await api.getDictionary('invalid')).error.code, 'INVALID_ARGUMENTS')
  const directory = (await api.getDictionary('position')).data
  assert.equal((await api.reorderDictionary('position', [newPosition.id, newPosition.id], directory.revision)).error.code, 'INVALID_ARGUMENTS')
  assert.deepEqual((await api.reorderDictionary('position', [newPosition.id, position.id], directory.revision)).data.entries.map(row => row.id), [newPosition.id, position.id])
  assert.equal((await api.renameDictionaryEntry('position', newPosition.id, 'Перейменована посада', 0)).ok, true)
  assert.equal((await api.deleteDictionaryEntry('position', newPosition.id, 1)).ok, true)
  assert.equal(Object.keys(api).length, 13)
  for (const method of ['getHistory', 'createAssignment', 'updateAssignment', 'deleteAssignment']) {
    assert.equal(api[method], undefined)
    assert.equal(f.handlers.has('personnel:' + method), false)
  }
})
