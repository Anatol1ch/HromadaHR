import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { ZoomController } from '../dist-electron/electron/zoom.js'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'
import { zoomPercents } from '../dist-electron/shared/zoom.js'

test('zoom IPC accepts only allowed values/trusted callers; shortcuts share persistent isolated state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hr-zoom-'))
  try {
    const file = join(root, 'built', 'interface-settings.json'), applied = []
    const contents = { isDestroyed: () => false, mainFrame: { url: 'file:///hr/index.html' }, setZoomFactor: value => applied.push(value) }
    const controller = new ZoomController(file, () => contents)
    const handlers = new Map(), event = { sender: contents, senderFrame: contents.mainFrame }
    registerIpcHandlers({ handle: (channel, handler) => handlers.set(channel, handler) },
      () => ({ isDestroyed: () => false, webContents: contents }), contents.mainFrame.url,
      () => ({}), () => ({}), {}, () => {}, {}, { listPeriods: () => [], proposePeriods: () => [], savePeriods: () => [], deletePeriod: () => null }, undefined, undefined, controller)
    const get = handlers.get(ipcChannels.systemGetZoom), set = handlers.get(ipcChannels.systemSetZoom)
    for (const value of [0, 79, 81, 120, 200, NaN, Infinity, '125', null, undefined, {}]) {
      assert.equal((await set(event, value)).error.code, 'INVALID_ARGUMENTS')
    }
    assert.equal((await get(event, 'file:///arbitrary')).error.code, 'INVALID_ARGUMENTS')
    assert.equal((await set(event, 125, {})).error.code, 'INVALID_ARGUMENTS')
    for (const foreign of [{ ...event, sender: {} }, { ...event, senderFrame: null }, { ...event, senderFrame: { url: contents.mainFrame.url } }]) {
      assert.equal((await get(foreign)).error.code, 'FORBIDDEN')
      assert.equal((await set(foreign, 125)).error.code, 'FORBIDDEN')
    }
    contents.mainFrame.url = 'https://foreign.test'
    assert.equal((await set(event, 125)).error.code, 'FORBIDDEN')
    contents.mainFrame.url = 'file:///hr/index.html'
    assert.deepEqual(applied, [])
    for (const percent of zoomPercents) {
      assert.deepEqual(await set(event, percent), { ok: true, data: { percent, saved: true } })
      assert.equal(applied.at(-1), percent / 100)
      assert.equal(new ZoomController(file, () => null).get().percent, percent)
    }
    const input = { type: 'keyDown', control: true, alt: false, meta: false, isComposing: false, key: '+', code: 'Equal' }
    controller.set(100)
    assert.equal(controller.shortcut({ ...input, shift: true }), true)
    assert.equal(controller.get().percent, 110)
    controller.shortcut({ ...input, code: 'NumpadAdd' })
    assert.equal(controller.get().percent, 125)
    controller.shortcut({ ...input, key: '-', code: 'NumpadSubtract' })
    assert.equal(controller.get().percent, 110)
    controller.shortcut({ ...input, key: '0', code: 'Digit0' })
    assert.equal(controller.get().percent, 100)
    for (const ignored of [{ ...input, key: 'Enter', code: 'Enter' }, { ...input, control: false }, { ...input, alt: true }, { ...input, isComposing: true }, { ...input, type: 'keyUp' }]) {
      assert.equal(controller.shortcut(ignored), false)
    }
    assert.deepEqual(await get(event), { ok: true, data: { percent: 100, saved: true } })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { zoom: 100 })
    assert.equal(new ZoomController(join(root, 'dev', 'interface-settings.json'), () => null).get().percent, 100)
    controller.set(125)
    assert.equal(new ZoomController(file, () => null).get().percent, 125)
    assert.equal(new ZoomController(join(root, 'dev', 'interface-settings.json'), () => null).get().percent, 100)
    const invalid = join(root, 'invalid.json'); writeFileSync(invalid, '{"zoom":120}')
    assert.deepEqual(new ZoomController(invalid, () => null).get(), { percent: 100, saved: false })
    const blocked = join(root, 'directory'); mkdirSync(blocked)
    assert.equal(new ZoomController(blocked, () => contents).set(90).saved, false)
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-zoom-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  }
})
