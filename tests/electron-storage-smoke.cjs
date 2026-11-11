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
  const { LeaveService } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/leave/service.js')).href)
  const { BackupService } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/backup/service.js')).href)
  const { BackupController } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/backup/controller.js')).href)
  const { snapshot } = await import(pathToFileURL(join(__dirname, '../dist-electron/electron/backup/files.js')).href)
  assert.ok(process.versions.electron)
  // Resume the startup scheduler only after a confirmed successful recovery.
  let resumed = 0, restored = false
  const controller = new BackupController({ confirmRestore: async () => ({ restored }) }, () => null, () => { resumed++ })
  await controller.confirmRestore('smoke')
  assert.equal(resumed, 0)
  restored = true
  await controller.confirmRestore('smoke')
  assert.equal(resumed, 1)
  const file = join(root, 'data', 'smoke.db')
  const first = await openStorageSafely(file)
  let source, employeeId, input
  try {
    assert.equal(first.schemaVersion, 14)
    first.database.exec("CREATE TABLE test_smoke(value TEXT); INSERT INTO test_smoke VALUES ('persisted')")
    assert.equal(typeof first.database.backup, 'function')
    const personnel = new PersonnelService({ getDatabase: () => first.database }, () => false)
    const department = personnel.createDepartment({ name: 'Тестовий відділ' })
    const position = personnel.createPosition({ name: 'Тестова посада' })
    input = { departmentId: department.id, positionId: position.id, hireDate: '2026-01-01',
      lastName: 'Тестовий', firstName: 'Умовний', middleName: null, birthDate: null, employeeType: 'staff' }
    employeeId = personnel.createEmployee(input).id
    new LeaveService({ getDatabase: () => first.database }, () => false).savePeriods(employeeId, [
      { leaveType: 'annual_main', periodStart: '2026-01-01', periodEnd: '2026-12-31', accountingBasis: 'initial_balance', confirmedDays: 5, referenceEntitlementDays: null },
    ])
    const leave = new LeaveService({ getDatabase: () => first.database }, () => false)
    const period = leave.getBalances(employeeId)[0]
    const registration = leave.registerLeave({ requestId: require('node:crypto').randomUUID(), employeeId, leaveType: 'annual_main',
      startDate: '2027-04-05', endDate: '2027-04-06', usedDays: 2, orderNumber: null, orderDate: null,
      durationExplanation: null, allocations: [{periodId: period.id, days: 2}] })
    const corrected = leave.updateLeave({ id: registration.id, expectedRevision: registration.revision,
      leaveType: registration.leaveType, startDate: registration.startDate, endDate: registration.endDate,
      usedDays: 1, orderNumber: null, orderDate: null, durationExplanation: 'Уточнення',
      allocations: [{ periodId: period.id, days: 1 }] })
    leave.cancelLeave(corrected.id, corrected.revision, 'Скасовано кадровиком')
    const eventInput = { requestId: require('node:crypto').randomUUID(), employeeId, leaveType: 'study_leave',
      startDate: '2027-05-01', endDate: '2027-05-03', usedDays: 3, orderNumber: null, orderDate: null,
      durationExplanation: null, allocations: [], grantBasis: 'Довідка-виклик № 5' }
    const study = leave.registerLeave(eventInput)
    assert.deepEqual(study.allocations, [])
    const { requestId: studyRequestId, employeeId: studyEmployeeId, ...editableStudy } = eventInput
    const changedStudy = leave.updateLeave({ ...editableStudy, id: study.id,
      expectedRevision: study.revision, grantBasis: 'Довідка-виклик № 6' })
    leave.cancelLeave(changedStudy.id, changedStudy.revision, 'Помилка')
    leave.registerLeave({ ...eventInput, requestId: require('node:crypto').randomUUID(), leaveType: 'veteran_special_leave',
      startDate: '2027-06-01', endDate: '2027-06-14', usedDays: 14, grantBasis: 'Статус перевірено' })
    leave.registerLeave({ ...eventInput, requestId: require('node:crypto').randomUUID(), leaveType: 'chernobyl_special_leave',
      startDate: '2027-07-01', endDate: '2027-07-16', usedDays: 16, grantBasis: 'Категорію перевірено' })
    assert.equal(leave.getBalances(employeeId)[0].availableDays, 5)
    assert.deepEqual(leave.listRights(employeeId), [])
    leave.saveRights(employeeId,[{leaveType:'annual_main',status:'has_right'},{leaveType:'study_leave',status:'no_right'}])
    const copies = join(root, 'backups')
    mkdirSync(copies)
    source = await snapshot(first.database, copies, 'electron-smoke')
  } finally { first.close() }
  const second = await openStorageSafely(file)
  try {
    assert.equal(second.created, false)
    assert.equal(second.database.prepare('SELECT value FROM test_smoke').get().value, 'persisted')
    const personnel = new PersonnelService({ getDatabase: () => second.database }, () => false)
    assert.equal(personnel.updateEmployee(employeeId, { ...input, firstName: 'Інше ім’я' }).firstName, 'Інше ім’я')
    assert.throws(() => personnel.updateEmployee(employeeId, { ...input, hireDate: '2026-02-01' }), error => error.code === 'HIRE_DATE_HAS_LEAVE_PERIODS')
    personnel.deleteEmployee(employeeId)
    assert.equal(second.database.prepare('SELECT count(*) n FROM employees').get().n, 0)
    assert.equal(second.database.prepare('SELECT count(*) n FROM leave_period_balances').get().n, 0)
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
    const leave = new LeaveService(storage, () => service.isBusy())
    assert.equal(personnel.getEmployee(employeeId).hireDate, '2026-01-01')
    assert.equal(leave.listRights(employeeId).length, 2)
    assert.equal(leave.listRights(employeeId).find(row=>row.leaveType==='study_leave').status, 'no_right')
    assert.equal(leave.listPeriods(employeeId)[0].confirmedDays, 5)
    assert.equal(leave.getBalances(employeeId)[0].availableDays, 5)
    assert.equal(leave.listRecords(employeeId).length, 4)
    const annual = leave.listRecords(employeeId).find(record => record.leaveType === 'annual_main')
    const study = leave.listRecords(employeeId).find(record => record.leaveType === 'study_leave')
    assert.equal(study.status, 'cancelled')
    assert.equal(study.grantBasis, 'Довідка-виклик № 6')
    assert.deepEqual(study.allocations, [])
    assert.deepEqual(storage.getDatabase().pragma('foreign_key_check'), [])
    assert.deepEqual(storage.getDatabase().pragma('integrity_check'), [{ integrity_check: 'ok' }])
    assert.equal(annual.status, 'cancelled')
    assert.equal(annual.revision, 3)
    assert.equal(annual.allocations[0].days, 1)
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
