import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
if (!process.versions.electron) {
  const { test } = await import('node:test')
  test('backup folder IPC accepts only slots and revalidates saved directories without opening Explorer', () => {
    const root = mkdtempSync(join(tmpdir(), 'hr-open-folder-'))
    try {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
      const result = spawnSync(require('electron'), [fileURLToPath(import.meta.url), root], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 })
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stderr || result.stdout)
      assert.match(result.stdout, /OPEN_BACKUP_FOLDER_OK/)
    } finally {
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-open-folder-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    }
  })
} else {
  const { app } = require('electron'), root = process.argv[2]
  assert.ok(root && resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-open-folder-'))
  app.setPath('userData', join(root, 'profile'))
  app.setPath('sessionData', join(root, 'session'))
  app.setPath('logs', join(root, 'logs'))
  app.setPath('crashDumps', join(root, 'crashes'))
  app.disableHardwareAcceleration()
  void app.whenReady().then(async () => {
  try {
    const { BackupController } = await import('../dist-electron/electron/backup/controller.js')
    const { registerIpcHandlers } = await import('../dist-electron/electron/ipc.js')
    const { ipcChannels } = await import('../dist-electron/shared/ipc.js')
    const folders = [join(root, 'one'), join(root, 'two')]; folders.forEach(path => mkdirSync(path))
    const status = { busy: false, targets: folders.map((path, index) => ({ slot: index + 1, path, available: true })) }
    const opened = []; let shellError = ''
    const controller = new BackupController({ getStatus: () => status }, () => null, undefined, async path => { opened.push(path); return shellError })
    const handlers = new Map(), contents = { isDestroyed: () => false, mainFrame: { url: 'file:///hr/index.html' } }
    const trusted = { sender: contents, senderFrame: contents.mainFrame }
    registerIpcHandlers({ handle: (channel, handler) => handlers.set(channel, handler) },
      () => ({ isDestroyed: () => false, webContents: contents }), contents.mainFrame.url, () => ({}), () => ({}), controller, () => {}, {})
    const open = handlers.get(ipcChannels.backupOpenFolder)
    for (const args of [[], [0], [3], ['1'], [folders[0]], [{ slot: 1, path: folders[0] }], [1, folders[0]], [null]]) {
      assert.equal((await open(trusted, ...args)).error.code, 'INVALID_ARGUMENTS')
    }
    for (const event of [{ ...trusted, sender: {} }, { ...trusted, senderFrame: null }, { ...trusted, senderFrame: { url: contents.mainFrame.url } }]) {
      assert.equal((await open(event, 1)).error.code, 'FORBIDDEN')
    }
    contents.mainFrame.url = 'https://foreign.test'
    assert.equal((await open(trusted, 1)).error.code, 'FORBIDDEN')
    contents.mainFrame.url = 'file:///hr/index.html'
    assert.equal(opened.length, 0)
    for (const slot of [1, 2]) assert.deepEqual(await open(trusted, slot), { ok: true, data: null })
    assert.deepEqual(opened, folders.map(path => realpathSync.native(path)))
    status.targets[0].available = false
    assert.equal((await open(trusted, 1)).error.code, 'FOLDER_UNAVAILABLE')
    status.targets[0].available = true; status.targets[0].path = join(root, 'missing')
    assert.equal((await open(trusted, 1)).error.code, 'FOLDER_UNAVAILABLE')
    status.targets[0].path = null
    assert.equal((await open(trusted, 1)).error.code, 'NOT_CONFIGURED')
    assert.equal(opened.length, 2)
    status.targets[0].path = folders[0]; shellError = 'private shell failure details'
    assert.deepEqual(await open(trusted, 1), { ok: false, error: { code: 'FOLDER_UNAVAILABLE' } })
    status.busy = true
    assert.equal((await open(trusted, 2)).error.code, 'BUSY')
    console.log('OPEN_BACKUP_FOLDER_OK')
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
  }).catch(error => { console.error(error); app.exit(1) })
}
