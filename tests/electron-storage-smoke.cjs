// Runs as a real Electron Main entry, without BrowserWindow or production profiles.
const { app } = require('electron')
const { mkdirSync, writeFileSync, readFileSync, readdirSync } = require('node:fs')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const root = process.argv[2]
assert.ok(root)
app.setPath('userData', join(root, 'electron-profile'))
app.setPath('sessionData', join(root, 'session'))
app.setPath('logs', join(root, 'logs'))
app.setPath('crashDumps', join(root, 'crashes'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const { openStorageSafely, Storage } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/storage/index.js')).href)
  const { PersonnelService } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/personnel/service.js')).href)
  const { BackupService } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/backup/service.js')).href)
  const { snapshot } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/backup/files.js')).href)
  assert.ok(process.versions.electron)
  const file = join(root, 'data', 'smoke.db')
  const first = await openStorageSafely(file)
  let source, employeeId, assignmentInput
  try {
    assert.equal(first.schemaVersion, 3)
    first.database.exec("CREATE TABLE test_smoke(value TEXT); INSERT INTO test_smoke VALUES ('persisted')")
    assert.equal(typeof first.database.backup, 'function')
    const personnel = new PersonnelService({ getDatabase: () => first.database }, () => false, () => '2026-11-02')
    const department = personnel.createDepartment({ name: 'Тестовий відділ' })
    const position = personnel.createPosition({ name: 'Тестова посада' })
    assignmentInput = { departmentId: department.id, positionId: position.id, category: 'Інша', startDate: '2026-02-01' }
    employeeId = personnel.createEmployee({ ...assignmentInput, category: null, startDate: '2026-01-01', lastName: 'Тестовий', firstName: 'Умовний', middleName: null, birthDate: null, note: null, employeeType: 'staff' }).id
    personnel.createAssignment(employeeId, assignmentInput)
    const copies = join(root, 'backups')
    mkdirSync(copies)
    source = await snapshot(first.database, copies, 'electron-smoke')
  } finally { first.close() }
  const second = await openStorageSafely(file)
  try {
    assert.equal(second.created, false)
    assert.equal(second.database.prepare('SELECT value FROM test_smoke').get().value, 'persisted')
    const personnel = new PersonnelService({ getDatabase: () => second.database }, () => false, () => '2026-11-02')
    const latest = personnel.getHistory(employeeId)[1]
    personnel.updateAssignment(latest.id, { ...assignmentInput, category: 'Виправлена' })
    personnel.deleteAssignment(latest.id)
    personnel.deleteEmployee(employeeId)
    assert.equal(second.database.prepare('SELECT count(*) n FROM employee_positions').get().n, 0)
  } finally { second.close() }
  // Real Electron loads Koffi and exercises exclusive Win32 preservation,
  // handle-based rename, online staging and emergency SQLite reopen.
  writeFileSync(file, 'damaged Electron fixture')
  const storage = new Storage()
  const service = new BackupService(storage)
  try {
    await storage.initializeSafely(() => file)
    assert.equal(storage.getStatus().code, 'CORRUPT')
    const selection = await service.chooseRestore(async () => source)
    await service.confirmRestore(selection.token, async () => true)
    assert.equal(storage.getDatabase().prepare('SELECT value FROM test_smoke').get().value, 'persisted')
    const personnel = new PersonnelService(storage, () => service.isBusy())
    assert.equal(personnel.getHistory(employeeId).length, 2)
    const protection = join(root, 'data', 'protection')
    const raw = readdirSync(protection).find(name => name.startsWith('raw-'))
    assert.equal(readFileSync(join(protection, raw, 'database.db'), 'utf8'), 'damaged Electron fixture')
  } finally { service.stop(); service.invalidateSelections(); storage.close() }
  console.log(`ELECTRON_STORAGE_OK Electron=${process.versions.electron} Node=${process.versions.node} arch=${process.arch}`)
}).catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  // The parent removes the temporary profile after Electron releases its files.
  app.exit(process.exitCode || 0)
})
