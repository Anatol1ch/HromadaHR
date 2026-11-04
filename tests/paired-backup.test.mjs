import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, copyFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
if (!process.versions.electron) {
  const { test } = await import('node:test')
  test('one online snapshot is mirrored, repaired, grouped and restored without losing legacy data', () => {
    const root = mkdtempSync(join(tmpdir(), 'hr-paired-backup-'))
    try {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
      const result = spawnSync(require('electron'), [fileURLToPath(import.meta.url), root], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 })
      assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout); assert.match(result.stdout, /PAIRED_BACKUP_OK/)
    } finally {
      assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-paired-backup-'))
      rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    }
  })
} else {
  const { app, dialog } = require('electron'), root = process.argv[2]
  assert.ok(root && resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hr-paired-backup-'))
  for (const [key, folder] of [['userData', 'profile'], ['sessionData', 'session'], ['logs', 'logs'], ['crashDumps', 'crashes']]) app.setPath(key, join(root, folder))
  app.disableHardwareAcceleration()
  void app.whenReady().then(async () => {
    const { Storage } = await import('../dist-electron/electron/storage/index.js')
    const { BackupService } = await import('../dist-electron/electron/backup/service.js')
    const { BackupController } = await import('../dist-electron/electron/backup/controller.js')
    const { inspectDatabase } = await import('../dist-electron/electron/storage/validation.js')
    const { BackupHistoryStore } = await import('../dist-electron/electron/backup/history.js')
    const { backupName } = await import('../dist-electron/electron/backup/names.js')
    const storage = new Storage(), file = join(root, 'data', 'app.db'), folders = [join(root, 'one'), join(root, 'two')]
    let service, clock = new Date(2026, 10, 4, 12)
    const names = folder => readdirSync(folder).filter(name => name.endsWith('.db'))
    try {
      await storage.initializeSafely(() => file)
      service = new BackupService(storage, () => new Date(clock))
      folders.forEach(folder => mkdirSync(folder))
      const picks = []
      for (const slot of [1, 2]) picks.push(await service.chooseFolder(slot, async () => folders[slot - 1]))
      await service.saveConfig(picks.map(pick => pick.token))
      storage.getDatabase().exec("CREATE TABLE test_value(v); INSERT INTO test_value VALUES ('original')")
      let backups = 0
      const db = storage.getDatabase(), original = db.backup
      db.backup = function (...args) { backups++; return original.apply(this, args) }
      // 1. Exactly one online backup, byte-identical, independently valid files.
      await service.runManual(); assert.equal(backups, 1)
      const manual = names(folders[0])[0]
      assert.equal(names(folders[1])[0], manual)
      assert.deepEqual(readFileSync(join(folders[0], manual)), readFileSync(join(folders[1], manual)))
      assert.equal(inspectDatabase(join(folders[0], manual)), 4); assert.equal(inspectDatabase(join(folders[1], manual)), 4)
      let list = await service.listCopies(); assert.equal(list.copies.length, 1); assert.equal(list.copies[0].locations.length, 2)
      assert.equal(service.getHistory().events.filter(event => event.operation === 'manual').length, 1)
      assert.equal(service.getHistory().events[0].result, 'success')
      // 2. One failed target preserves the other and records one partial event.
      renameSync(folders[1], folders[1] + '-offline')
      const partial = await service.runAutomatic(); assert.equal(backups, 2)
      assert.ok(partial.targets[0].fileName); assert.ok(partial.targets[1].error)
      assert.equal(partial.lastBackup.result, 'partial'); assert.equal(partial.lastBackup.copies, 1)
      const auto = partial.targets[0].fileName
      assert.equal(service.getHistory().events[0].locations.filter(item => item.result === 'success').length, 1)
      // 3. Repair after restart uses the old verified image, not newer live data.
      db.exec("UPDATE test_value SET v='newer-live-state'")
      // Manual backup must not hide the pending automatic image's identity.
      clock = new Date(clock.getTime() + 60 * 1000)
      await service.runManual(); assert.equal(backups, 3)
      renameSync(folders[1] + '-offline', folders[1]); clock = new Date(clock.getTime() + 16 * 60 * 1000)
      service = new BackupService(storage, () => new Date(clock))
      await service.runAutomatic(); assert.equal(backups, 3)
      assert.deepEqual(readFileSync(join(folders[0], auto)), readFileSync(join(folders[1], auto)))
      assert.equal(service.getHistory().events[0].duplicate, true); assert.equal(service.getHistory().events[0].result, 'success')
      list = await service.listCopies(); assert.equal(list.copies.length, 3)
      const logical = list.copies.find(copy => copy.kind === 'auto'); assert.equal(logical.locations.length, 2)
      // 4. Missing first member falls back only to the same recorded snapshot.
      unlinkSync(join(folders[0], auto))
      const selected = await service.selectCopy(logical.id)
      assert.equal(selected.fileName, auto)
      let prompts = 0, response = 0, resumed = 0
      const window = { isDestroyed: () => false, webContents: { reload: () => {} } }
      const controller = new BackupController(service, () => window, () => { resumed++ }), originalPrompt = dialog.showMessageBox
      dialog.showMessageBox = async (_window, options) => { prompts++; assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0); return { response } }
      try {
        assert.deepEqual(await controller.confirmRestore(selected.token), { restored: false })
        await assert.rejects(controller.confirmRestore(selected.token), error => error.code === 'INVALID_SELECTION')
        const selection = await service.selectCopy(logical.id); response = 1
        assert.deepEqual(await controller.confirmRestore(selection.token), { restored: true })
        assert.equal(prompts, 2); assert.equal(resumed, 1)
        assert.equal(storage.getDatabase().prepare('SELECT v FROM test_value').get().v, 'original')
        assert.ok(readdirSync(join(root, 'data', 'protection')).some(name => name.includes('protect-restore')))
        assert.ok(service.getHistory().events.some(event => event.operation === 'restore' && event.result === 'success'))
      } finally { dialog.showMessageBox = originalPrompt }
      // 5. No source available: a later cycle must get a different identity.
      clock = new Date(2026, 10, 5, 12)
      renameSync(folders[1], folders[1] + '-offline'); await service.runAutomatic()
      const lost = service.getStatus().targets[0].fileName
      unlinkSync(join(folders[0], lost)); renameSync(folders[1] + '-offline', folders[1])
      clock = new Date(clock.getTime() + 16 * 60 * 1000)
      await service.runAutomatic()
      const replacement = service.getStatus().targets[1].fileName
      assert.notEqual(backupName(lost).id, backupName(replacement).id)
      assert.equal(service.getHistory().events[0].duplicate, false)
      // Legacy same-time files stay separate; old diagnostic events stay intact.
      const legacy = manual.replace(/-[0-9a-f]{64}\.db$/, '-' + randomUUID() + '.db')
      for (const folder of folders) copyFileSync(join(folders[0], manual), join(folder, legacy))
      const legacyRows = (await service.listCopies()).copies.filter(copy => copy.time === backupName(manual).time && copy.kind === 'manual')
      assert.equal(legacyRows.length, 3); assert.equal(legacyRows.filter(copy => copy.locations.length === 1).length, 2)
      const old = { time: '2026-11-01T10:00:00.000Z', operation: 'manual', slot: 1, result: 'success', code: null }
      const historyFile = join(root, 'legacy-history.json'); writeFileSync(historyFile, JSON.stringify([old]))
      const history = new BackupHistoryStore(() => historyFile); assert.deepEqual(history.get().events, [old])
      const event = { ...old, slot: null, snapshotId: backupName(manual).id, locations: [{ slot: 1, result: 'success', code: null }, { slot: 2, result: 'error', code: 'FOLDER_UNAVAILABLE' }], result: 'partial' }
      history.append(event); assert.deepEqual(history.get().events[1], old)
      for (let n = 0; n < 250; n++) history.append(event)
      assert.ok(history.get().available); assert.ok(history.get().events.length <= 200); assert.ok(statSync(historyFile).size <= 64 * 1024)
      assert.deepEqual(storage.getDatabase().pragma('integrity_check'), [{ integrity_check: 'ok' }]); assert.deepEqual(storage.getDatabase().pragma('foreign_key_check'), [])
      console.log('PAIRED_BACKUP_OK')
    } finally { service?.stop(); service?.invalidateSelections(); storage.close() }
    app.exit(0)
  }).catch(error => { console.error(error); app.exit(1) })
}
