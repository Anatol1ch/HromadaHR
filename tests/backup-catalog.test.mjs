import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readdirSync, copyFileSync, writeFileSync, readFileSync, unlinkSync, renameSync, symlinkSync, statSync, utimesSync, openSync, writeSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
if (!process.versions.electron) {
  const { test } = await import('node:test')
  test('available backup API pins file identity and retains the existing protected restore lifecycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'hr-backup-catalog-'))
    try {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
      const result = spawnSync(require('electron'), [fileURLToPath(import.meta.url), root], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 })
      assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout)
      assert.match(result.stdout, /BACKUP_CATALOG_OK/)
    } finally {
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-backup-catalog-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    }
  })
} else {
  const { app, dialog } = require('electron'), root = process.argv[2]
  assert.ok(root && resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-backup-catalog-'))
  for (const [key, folder] of [['userData', 'profile'], ['sessionData', 'session'], ['logs', 'logs'], ['crashDumps', 'crashes']]) app.setPath(key, join(root, folder))
  app.disableHardwareAcceleration()
  void app.whenReady().then(async () => {
    const { Storage } = await import('../dist-electron/electron/storage/index.js')
    const { BackupService } = await import('../dist-electron/electron/backup/service.js')
    const { BackupController } = await import('../dist-electron/electron/backup/controller.js')
    const { registerIpcHandlers } = await import('../dist-electron/electron/ipc.js')
    const { ipcChannels } = await import('../dist-electron/shared/ipc.js')
    const Database = require('better-sqlite3')
    const storage = new Storage(), file = join(root, 'data', 'app.db')
    const code = expected => error => error.code === expected
    let service
    try {
      await storage.initializeSafely(() => file)
      assert.equal(storage.getStatus().state, 'ready')
      service = new BackupService(storage)
      const folders = [join(root, 'one'), join(root, 'two')]; folders.forEach(folder => mkdirSync(folder))
      const picks = []
      for (const slot of [1, 2]) picks.push(await service.chooseFolder(slot, async () => folders[slot - 1]))
      await service.saveConfig(picks.map(pick => pick.token))
      storage.getDatabase().exec("CREATE TABLE test_value(v); INSERT INTO test_value VALUES ('snapshot')")
      await service.runManual(); await service.runAutomatic()
      // Keep this security fixture in the legacy format: independent snapshots
      // must remain separate even when their timestamps happen to coincide.
      for (const folder of folders) for (const original of readdirSync(folder)) {
        if (!original.endsWith('.db')) continue
        const legacy = original.replace(/-[0-9a-f]{64}\.db$/, '-' + randomUUID() + '.db').replace(/-[0-9a-f-]{36}\.db$/, '-' + randomUUID() + '.db')
        renameSync(join(folder, original), join(folder, legacy))
      }
      const initial = await service.listCopies()
      assert.equal(initial.copies.length, 4)
      assert.ok(initial.copies.every(item => !('path' in item) && item.available))
      assert.deepEqual((await service.listCopies()).copies, initial.copies) // Stable IDs for unchanged files.
      const first = initial.copies.find(item => item.slot === 1 && item.kind === 'manual')
      const source = join(folders[0], readdirSync(folders[0]).find(name => name.includes('-manual-')))
      const instance = storage.getDatabase().prepare('SELECT instance_id FROM backup_config WHERE id=1').get().instance_id
      const name = () => `hromadahr-${instance}-manual-2026-11-04T12-00-00-000Z-${randomUUID()}.db`
      writeFileSync(join(folders[0], 'unrelated.db'), 'foreign')
      for (const suffix of ['.partial', '.previous', '.rejected']) copyFileSync(source, join(folders[0], basename(source) + suffix))
      copyFileSync(source, join(folders[0], basename(source).replace('-manual-', '-protect-restore-')))
      copyFileSync(source, join(folders[0], basename(source).replace(instance, randomUUID())))
      const foreign = join(folders[0], name()); copyFileSync(source, foreign)
      const foreignDb = new Database(foreign); foreignDb.prepare('UPDATE backup_config SET instance_id=?').run(randomUUID()); foreignDb.close()
      const bad = join(folders[0], name()); writeFileSync(bad, 'not sqlite')
      assert.equal((await service.listCopies()).copies.length, 4)
      await assert.rejects(service.selectCopy(randomUUID()), code('INVALID_SELECTION'))
      await assert.rejects(service.selectCopy(source), code('INVALID_SELECTION'))
      // Unchanged bytes with restored mtime must still fail after an in-place rewrite.
      const stamp = statSync(source), contents = readFileSync(source)
      writeFileSync(source, contents); utimesSync(source, stamp.atime, stamp.mtime)
      await assert.rejects(service.selectCopy(first.id), code('INVALID_SELECTION'))
      let fresh = (await service.listCopies()).copies.find(item => item.slot === 1 && item.kind === 'manual')
      renameSync(source, source + '.moved'); copyFileSync(source + '.moved', source)
      await assert.rejects(service.selectCopy(fresh.id), code('INVALID_SELECTION'))
      fresh = (await service.listCopies()).copies.find(item => item.slot === 1 && item.kind === 'manual')
      unlinkSync(source)
      await assert.rejects(service.selectCopy(fresh.id), code('INVALID_SELECTION'))
      copyFileSync(source + '.moved', source)
      fresh = (await service.listCopies()).copies.find(item => item.slot === 1 && item.kind === 'manual')
      // Junction substitution is exercised without Windows symlink privileges.
      const outside = join(root, 'outside'); mkdirSync(outside); copyFileSync(source, join(outside, basename(source)))
      renameSync(folders[0], folders[0] + '-saved'); symlinkSync(outside, folders[0], 'junction')
      try { await assert.rejects(service.selectCopy(fresh.id), code('INVALID_SELECTION')); assert.equal((await service.listCopies()).targets[0].available, false) }
      finally { unlinkSync(folders[0]); renameSync(folders[0] + '-saved', folders[0]) }
      const junctionFile = join(folders[0], name()); symlinkSync(outside, junctionFile, 'junction')
      try { assert.equal((await service.listCopies()).copies.length, 4) } finally { unlinkSync(junctionFile) }
      // A damaged SQLite with a readable lineage row is only metadata-eligible,
      // and is rejected by the unchanged full preparation integrity check.
      const corrupt = join(folders[0], name()); copyFileSync(source, corrupt)
      const damaged = new Database(corrupt)
      damaged.exec('CREATE TABLE broken_fixture(value BLOB); INSERT INTO broken_fixture VALUES (zeroblob(8000))')
      const page = damaged.prepare("SELECT rootpage FROM sqlite_schema WHERE name='broken_fixture'").get().rootpage
      const pageSize = damaged.pragma('page_size', { simple: true }); damaged.close()
      const fd = openSync(corrupt, 'r+'); try { writeSync(fd, Buffer.from([255]), 0, 1, (page - 1) * pageSize) } finally { closeSync(fd) }
      const listed = await service.listCopies()
      const corruptId = listed.copies.find(item => !initial.copies.some(old => old.id === item.id) && item.slot === 1 && item.kind === 'manual' && item.time === '2026-11-04T12:00:00.000Z').id
      await assert.rejects(service.selectCopy(corruptId), code('INVALID_BACKUP'))
      unlinkSync(corrupt)
      fresh = (await service.listCopies()).copies.find(item => item.slot === 1 && item.kind === 'manual')
      // Strict IPC: no path/object/extra argument, no foreign sender or frame.
      const handlers = new Map(), window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, mainFrame: { url: 'file:///hr/index.html' }, reload: () => { reloads++ } } }
      let reloads = 0, resumed = 0, response = 0, prompts = 0
      const controller = new BackupController(service, () => window, () => { resumed++ })
      registerIpcHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, () => window, window.webContents.mainFrame.url,
        () => ({}), () => ({}), controller, () => {}, {},
        { listPeriods: () => [], proposePeriods: () => [], savePeriods: () => [], deletePeriod: () => null })
      const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
      const select = handlers.get(ipcChannels.backupSelectCopy), list = handlers.get(ipcChannels.backupListCopies)
      for (const args of [[], [source], [{ id: fresh.id, path: source }], [fresh.id, source]]) assert.equal((await select(trusted, ...args)).error.code, 'INVALID_ARGUMENTS')
      assert.equal((await list(trusted, source)).error.code, 'INVALID_ARGUMENTS')
      for (const handler of [select, list]) {
        for (const event of [{ ...trusted, sender: {} }, { ...trusted, senderFrame: null }, { ...trusted, senderFrame: { url: trusted.senderFrame.url } }]) assert.equal((await handler(event, fresh.id)).error.code, 'FORBIDDEN')
      }
      window.webContents.mainFrame.url = 'https://foreign.test'
      assert.equal((await select(trusted, fresh.id)).error.code, 'FORBIDDEN')
      assert.equal((await list(trusted)).error.code, 'FORBIDDEN')
      window.webContents.mainFrame.url = 'file:///hr/index.html'
      const publicList = await list(trusted)
      assert.equal(publicList.ok, true)
      assert.ok(publicList.data.copies.every(copy => !('path' in copy) && !('fileName' in copy)))
      // Configuration changes invalidate old IDs even if the file is online.
      storage.getDatabase().prepare('UPDATE backup_config SET folder1=?').run(outside)
      await assert.rejects(service.selectCopy(fresh.id), code('INVALID_SELECTION'))
      storage.getDatabase().prepare('UPDATE backup_config SET folder1=?').run(folders[0])
      const selected = await select(trusted, fresh.id)
      assert.equal(selected.ok, true); assert.equal(selected.data.fileName, basename(source)); assert.equal(selected.data.schemaVersion, 6)
      assert.equal(prompts, 0)
      const originalPrompt = dialog.showMessageBox
      dialog.showMessageBox = async (_window, options) => {
        prompts++; assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0); assert.equal(options.buttons[0], 'Скасувати'); return { response }
      }
      try {
        assert.deepEqual(await controller.confirmRestore(selected.data.token), { restored: false })
        await assert.rejects(controller.confirmRestore(selected.data.token), code('INVALID_SELECTION'))
        assert.equal(prompts, 1)
        const ready = await service.selectCopy(fresh.id)
        storage.getDatabase().exec("UPDATE test_value SET v='current'")
        // Captured staged source remains immutable after external deletion.
        unlinkSync(source); response = 1
        assert.deepEqual(await controller.confirmRestore(ready.token), { restored: true })
        assert.equal(storage.getDatabase().prepare('SELECT v FROM test_value').get().v, 'snapshot')
        assert.equal(resumed, 1); assert.equal(prompts, 2)
        await new Promise(resolve => setTimeout(resolve, 130)); assert.equal(reloads, 1)
        assert.ok(readdirSync(join(root, 'data', 'protection')).some(name => name.includes('protect-restore')))
        assert.ok(service.getHistory().events.some(event => event.operation === 'restore' && event.result === 'success'))
        const reloadService = new BackupService(storage)
        assert.ok(reloadService.getHistory().events.some(event => event.operation === 'restore' && event.result === 'success'))
        const rollbackCopy = (await service.listCopies()).copies.find(item => item.kind === 'manual')
        const rollbackSelection = await service.selectCopy(rollbackCopy.id)
        storage.getDatabase().exec("UPDATE test_value SET v='rollback-original'")
        const reopen = storage.reopen.bind(storage)
        storage.reopen = async recover => { if (recover === false) throw new Error('Injected reopen failure'); return reopen(recover) }
        try { await assert.rejects(controller.confirmRestore(rollbackSelection.token), code('RESTORE_FAILED')) } finally { storage.reopen = reopen }
        assert.equal(storage.getDatabase().prepare('SELECT v FROM test_value').get().v, 'rollback-original')
        assert.equal(service.getStatus().lastRestore, 'rolled-back')
        assert.equal(service.getHistory().events[0].operation, 'restore'); assert.equal(service.getHistory().events[0].result, 'error')
        assert.deepEqual(storage.getDatabase().pragma('integrity_check'), [{ integrity_check: 'ok' }])
        assert.deepEqual(storage.getDatabase().pragma('foreign_key_check'), [])
      } finally { dialog.showMessageBox = originalPrompt }
      console.log('BACKUP_CATALOG_OK')
    } finally { service?.stop(); service?.invalidateSelections(); storage.close() }
    app.exit(0)
  }).catch(error => { console.error(error); app.exit(1) })
}
