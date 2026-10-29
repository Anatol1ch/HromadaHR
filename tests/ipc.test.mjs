import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'

const url = 'file:///app/dist/index.html'
const info = { name: 'HromadaHR', version: '0.1.0', mode: 'built' }

function setup(getInfo = () => info, allowedUrl = url) {
  const handlers = new Map()
  const contents = { isDestroyed: () => false, mainFrame: { url: allowedUrl } }
  let currentWindow = { isDestroyed: () => false, webContents: contents }
  let executions = 0
  registerIpcHandlers({ handle: (channel, handler) => {
    assert.equal(handlers.has(channel), false)
    handlers.set(channel, handler)
  } }, () => currentWindow, allowedUrl, () => { executions++; return getInfo() })
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
  assert.deepEqual([...handlers.keys()], [ipcChannels.systemGetInfo])
  for (const channel of ['system:delete', 'employees:list', '__proto__', 'invoke']) {
    assert.equal(handlers.has(channel), false)
  }
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
  assert.deepEqual(Object.keys(api), ['system'])
  assert.deepEqual(Object.keys(api.system), ['getInfo'])
  assert.deepEqual(await api.system.getInfo(), { ok: true, data: info })
  // JS callers cannot smuggle a channel/arguments through the public method.
  await api.system.getInfo('system:delete', { path: 'secret' })
  assert.deepEqual(calls, [[ipcChannels.systemGetInfo], [ipcChannels.systemGetInfo]])
  for (const key of ['invoke', 'send', 'on', 'ipcRenderer', 'require', 'fs']) assert.equal(api[key], undefined)
})

test('preload normalizes transport rejection', async () => {
  const api = preload(async () => { throw new Error('private transport details') })
  assert.equal(JSON.stringify(await api.system.getInfo()), JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE' } }))
})
