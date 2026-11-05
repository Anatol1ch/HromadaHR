import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { registerIpcHandlers } from '../dist-electron/electron/ipc.js'
import { LeaveService } from '../dist-electron/electron/leave/service.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { ipcChannels } from '../dist-electron/shared/ipc.js'

const url = 'file:///hr/index.html'
function preload(invoke) {
  const exposed = new Map()
  runInNewContext(readFileSync(new URL('../dist-electron/preload.cjs', import.meta.url), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron')
      return { contextBridge: { exposeInMainWorld: (key, value) => exposed.set(key, value) }, ipcRenderer: { invoke } }
    },
  })
  return exposed.get('hromadaHR')
}

test('typed leave IPC validates sender and payloads and completes service roundtrip', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-leave-ipc-'))
  const connection = await openStorageSafely(join(root, 'test.db'))
  t.after(() => {
    connection.close()
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-leave-ipc-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })
  const storage = { getDatabase: () => connection.database }
  const personnel = new PersonnelService(storage, () => false)
  const leave = new LeaveService(storage, () => false)
  const department = personnel.createDepartment({ name: 'Відділ' })
  const position = personnel.createPosition({ name: 'Посада' })
  const employee = personnel.createEmployee({ lastName: 'Тест', firstName: 'Приклад', middleName: null, birthDate: null,
    employeeType: 'official', hireDate: '2026-06-01', departmentId: department.id, positionId: position.id })
  const handlers = new Map()
  const contents = { isDestroyed: () => false, mainFrame: { url } }
  const win = { isDestroyed: () => false, webContents: contents }
  registerIpcHandlers({ handle: (channel, handler) => handlers.set(channel, handler) }, () => win, url,
    () => ({ name: 'HromadaHR', version: '0.1.0', mode: 'built' }), () => ({ state: 'ready', created: false, schemaVersion: 6 }),
    { getStatus: () => ({}), listCopies: () => ({}), selectCopy: () => ({}), openBackupFolder: () => null,
      chooseFolder: () => null, saveConfig: () => ({}), runManual: () => ({}), chooseRestore: () => null,
      confirmRestore: () => ({}), retryStorage: () => ({}) }, () => {}, personnel, leave)
  const event = { sender: contents, senderFrame: contents.mainFrame }
  const api = preload(async (channel, ...args) => handlers.get(channel)(event, ...args))
  assert.deepEqual(Object.keys(api.leave).sort(), ['deletePeriod', 'listPeriods', 'proposePeriods', 'savePeriods'])
  const proposal = await api.leave.proposePeriods(employee.id, '2028-01-01', 'annual_main')
  assert.equal(proposal.ok, true)
  assert.equal(proposal.data[0].status, 'proposed')
  assert.equal(proposal.data[0].periodStart, '2026-06-01')
  assert.equal(Object.hasOwn(proposal.data[0], 'confirmedDays'), false)
  const value = { leaveType: 'annual_main', periodStart: '2026-06-01', periodEnd: '2027-05-31',
    accountingBasis: 'initial_balance', confirmedDays: 0, referenceEntitlementDays: null }
  const saved = await api.leave.savePeriods(employee.id, [value])
  assert.equal(saved.ok, true)
  assert.equal(saved.data[0].status, 'confirmed')
  assert.equal(saved.data[0].confirmedDays, 0)
  assert.equal((await api.leave.listPeriods(employee.id)).data.length, 1)
  assert.equal((await api.leave.deletePeriod(saved.data[0].id)).ok, true)
  assert.equal((await api.leave.listPeriods(employee.id)).data.length, 0)

  const save = handlers.get(ipcChannels.leaveSavePeriods)
  for (const args of [[employee.id], [employee.id, [value, value, { ...value, id: 'extra' }]],
    [employee.id, [{ ...value, periodStart: '2026-02-30' }]], ['not-uuid', [value]], [employee.id, [value], 'extra']]) {
    assert.equal((await save(event, ...args)).error.code, 'INVALID_ARGUMENTS')
  }
  for (const badEvent of [{ ...event, sender: {} }, { ...event, senderFrame: null }, { ...event, senderFrame: { url } }]) {
    assert.equal((await save(badEvent, employee.id, [value])).error.code, 'FORBIDDEN')
  }
  contents.mainFrame.url = 'https://example.test/'
  assert.equal((await save(event, employee.id, [value])).error.code, 'FORBIDDEN')
  contents.mainFrame.url = url
})
