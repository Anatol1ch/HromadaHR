import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { PersonnelError, PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  }, () => {}, personnel)
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
  assert.deepEqual(Object.keys(api).sort(), ['backup', 'personnel', 'storage', 'system'])
  assert.deepEqual(Object.keys(api.backup).sort(), ['chooseFolder', 'chooseRestore', 'confirmRestore', 'getHistory', 'getStatus', 'runManual', 'saveConfig'])
  assert.deepEqual(Object.keys(api.system).sort(), ['getInfo', 'openContact', 'quit'])
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
    employeeType: 'official' }
  const assignmentInput = { departmentId: id, positionId: id, category: null, startDate: '2026-02-01' }
  const operations = {
    createAssignment: [id, assignmentInput], updateAssignment: [id, assignmentInput], deleteAssignment: [id], deleteEmployee: [id],
    listEmployees: [], getEmployee: [id], createEmployee: [{ ...details, positionId: id, departmentId: id, category: null, startDate: '2026-01-01' }],
    updateEmployee: [id, details], getHistory: [id], listDepartments: [],
    createDepartment: [{ name: 'Тест' }],
    listPositions: [], createPosition: [{ name: 'Тест' }],
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
    for (const invalid of [[...args, undefined], [{ sql: 'DELETE', path: 'C:\\private' }]]) {
      assert.deepEqual(await call(fixture.event, ...invalid), { ok: false, error: { code: 'INVALID_ARGUMENTS' } }, method)
    }
  }
  assert.equal(executions, 0)
  const create = fixture.handlers.get(ipcChannels.personnelCreateEmployee)
  for (const change of [{ startDate: '2026-02-30' }, { firstName: ' ' }, { birthDate: '2027-01-01' }, { unexpected: true }]) {
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
  for (const method of methods) {
    await api.personnel[method]('id', 'input', 'extra')
    const expectedArgs = method.startsWith('list') ? [] : (method.startsWith('update') || method === 'createAssignment') ? ['id', 'input'] : ['id']
    assert.deepEqual(calls.at(-1), [`personnel:${method}`, ...expectedArgs])
  }
  for (const key of ['invoke', 'sql', 'fs', 'database', 'send']) assert.equal(api.personnel[key], undefined)
})

test('built preload → IPC → personnel → isolated SQLite supports personal updates, history mutations and complete employee deletion', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-personnel-ipc-'))
  const connection = await openStorageSafely(join(root, 'test.db'))
  t.after(() => { connection.close(); rmSync(root, { recursive: true, force: true }) })
  const service = new PersonnelService({ getDatabase: () => connection.database }, () => false, () => '2026-11-02')
  const f = setup(() => info, url, service)
  const api = preload(async (channel, ...args) => f.handlers.get(channel)(f.event, ...args)).personnel
  const department = (await api.createDepartment({ name: 'Відділ' })).data
  const position = (await api.createPosition({ name: 'Посада' })).data
  const details = { lastName: 'Тест', firstName: 'Тест', middleName: null, birthDate: null,
    employeeType: 'official' }
  const result = await api.createEmployee({ ...details, positionId: position.id, departmentId: department.id, category: null, startDate: '2026-01-01' })
  assert.equal(result.ok, true)
  const employee = result.data
  assert.equal('note' in employee, false)
  assert.equal((await api.updateEmployee(employee.id, { ...details, note: 'removed' })).error.code, 'INVALID_ARGUMENTS')
  assert.equal((await api.createEmployee({ ...details, note: null, positionId: position.id, departmentId: department.id, category: null, startDate: '2026-01-01' })).error.code, 'INVALID_ARGUMENTS')
  assert.equal((await api.getHistory(employee.id)).data.length, 1)
  assert.equal((await api.listEmployees()).data[0].id, employee.id)
  assert.equal((await api.updateEmployee(employee.id, { ...details, middleName: 'Оновлено' })).data.middleName, 'Оновлено')
  assert.equal((await api.getEmployee(employee.id)).data.currentAssignment.position.id, position.id)
  assert.equal((await api.getEmployee(employee.id)).data.hireDate, '2026-01-01')
  const assignment = { positionId: position.id, departmentId: department.id, category: 'Інша', startDate: '2026-02-01' }
  assert.equal((await api.createAssignment(employee.id, assignment)).data.currentAssignment.category, 'Інша')
  const latest = (await api.getHistory(employee.id)).data[1]
  assert.equal((await api.updateAssignment(latest.id, { ...assignment, startDate: '2026-03-01' })).data.currentAssignment.startDate, '2026-03-01')
  assert.equal((await api.deleteAssignment(latest.id)).data.currentAssignment.startDate, '2026-01-01')
  assert.equal((await api.deleteAssignment((await api.getHistory(employee.id)).data[0].id)).error.code, 'LAST_ASSIGNMENT')
  assert.equal((await api.deleteEmployee(employee.id)).ok, true)
  assert.equal((await api.getEmployee(employee.id)).error.code, 'NOT_FOUND')
  assert.equal(connection.database.prepare('SELECT count(*) n FROM employee_positions').get().n, 0)
  assert.equal((await api.listDepartments()).data.length, 1)
  assert.equal((await api.listPositions()).data.length, 1)
  for (const method of ['addAssignment', 'updatePosition', 'deletePosition', 'updateDepartment', 'deleteDepartment']) {
    assert.equal(api[method], undefined)
    assert.equal(f.handlers.has('personnel:' + method), false)
  }
})

test('new personnel mutations reject malformed input and invalid privileged replies', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const input = { startDate: '2026-02-01', departmentId: id, positionId: id, category: null }
  const methods = ['createAssignment', 'updateAssignment', 'deleteAssignment', 'deleteEmployee']
  const fixture = setup(() => info, url, Object.fromEntries(methods.map(method => [method, () => undefined])))
  for (const method of methods) {
    const handler = fixture.handlers.get('personnel:' + method)
    const args = method.startsWith('delete') ? [id] : [id, input]
    assert.deepEqual(await handler(fixture.event, ...args), { ok: false, error: { code: 'INTERNAL_ERROR' } })
    assert.deepEqual(await handler(fixture.event, 'not-id', ...args.slice(1)), { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
    if (!method.startsWith('delete')) for (const change of [{ startDate: '2026-02-30' }, { category: '' }, { sql: 'DELETE' }, { employeeId: id }]) {
      assert.deepEqual(await handler(fixture.event, id, { ...input, ...change }), { ok: false, error: { code: 'INVALID_ARGUMENTS' } })
    }
  }
})
