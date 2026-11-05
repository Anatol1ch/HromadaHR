import { initialRegistry } from '../src/employees/registry.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../src/employees/workspace.ts'
import { confirmModalClose, getCloseConfirmation, finishCloseConfirmation, cancelCloseConfirmation } from '../src/components/closeConfirmation.ts'

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const employee = { id: ids[0], lastName: 'Синтетичний', firstName: 'Приклад', middleName: null }

test('nested form cancellation retains the parent card and registry options; only creation opens a new card', () => {
  const registry = { ...initialRegistry(), query: 'СИНТЕТИЧНИЙ', departmentId: ids[1], positionId: ids[0], filtersOpen: true }
  let state = workspaceReducer(initialWorkspace, { type: 'registry', registry })
  state = workspaceReducer(state, { type: 'card', id: employee.id })
  const card = state
  state = workspaceReducer(state, { type: 'form', form: { kind: 'edit', employee } })
  assert.equal(state.cardId, card.cardId)
  assert.equal(state.registry, card.registry)
  state = workspaceReducer(state, { type: 'form', form: null })
  assert.deepEqual(state, card)
  state = workspaceReducer(state, { type: 'saved', employee, created: false })
  assert.equal(state.cardId, employee.id)
  assert.equal(state.revision, 1)
  assert.equal(state.registry, card.registry)
  state = workspaceReducer(state, { type: 'card', id: null })
  state = workspaceReducer(state, { type: 'action', action: { kind: 'edit', id: employee.id } })
  state = workspaceReducer(state, { type: 'saved', employee, created: false })
  assert.equal(state.cardId, null)
  assert.equal(state.action, null)
  state = workspaceReducer(state, { type: 'saved', employee, created: true })
  assert.equal(state.cardId, employee.id)
  state = workspaceReducer(state, { type: 'deleted', id: employee.id })
  assert.equal(state.cardId, null)
  assert.deepEqual(state.registry, registry)
  assert.deepEqual(initialWorkspace.registry, initialRegistry())
})

test('authoritative mutation replies replace list entries without duplicating or mutating existing rows', () => {
  const rows = [employee, { ...employee, id: ids[1] }]
  const saved = { ...employee, firstName: 'Оновлений', hireDate: '2000-01-01', position: { name: 'Нова' } }
  const merged = mergeEmployee(rows, saved)
  assert.equal(merged.length, 2)
  assert.equal(merged[0], saved)
  assert.equal(merged[1], rows[1])
  assert.equal(rows[0], employee)
  assert.deepEqual(mergeEmployee([], saved), [saved])
})

function ownerLayer(state, owner) {
  return { dirty: () => state.dirty, busy: () => state.busy, confirm: (dirty, proceed) => confirmModalClose(dirty, proceed, owner) }
}
function discard() { const request = getCloseConfirmation(); assert.ok(request); finishCloseConfirmation(request, true) }

test('explicit modal owners isolate nested cancel, Escape/close requests and a single pending discard dialog', () => {
  const guards = createCloseGuards()
  const parent = ownerLayer({ dirty: true, busy: false }, { isConnected: true })
  const childOwner = { isConnected: true }
  const child = ownerLayer({ dirty: true, busy: false }, childOwner)
  guards.register(parent)
  const unregister = guards.register(child)
  let closed = 0
  guards.request(parent, () => { throw new Error('Parent cannot close behind child') })
  assert.equal(getCloseConfirmation(), null)
  guards.request(child, () => closed++)
  assert.equal(getCloseConfirmation().owner, childOwner)
  const request = getCloseConfirmation()
  guards.request(child, () => closed++)
  assert.equal(getCloseConfirmation(), request)
  finishCloseConfirmation(request, false)
  assert.equal(closed, 0)
  guards.request(child, () => closed++)
  discard()
  assert.equal(closed, 1)
  unregister()
  guards.request(parent, () => closed++)
  discard()
  assert.equal(closed, 2)
})

test('sidebar navigation confirms dirty layers top-down and never leaves after cancellation', () => {
  const guards = createCloseGuards()
  const parentOwner = { isConnected: true }, childOwner = { isConnected: true }
  guards.register(ownerLayer({ dirty: true, busy: false }, parentOwner))
  guards.register(ownerLayer({ dirty: true, busy: false }, childOwner))
  let navigated = false
  guards.requestAll(() => { navigated = true })
  assert.equal(getCloseConfirmation().owner, childOwner)
  discard()
  assert.equal(getCloseConfirmation().owner, parentOwner)
  finishCloseConfirmation(getCloseConfirmation(), false)
  assert.equal(navigated, false)
  guards.requestAll(() => { navigated = true })
  discard(); discard()
  assert.equal(navigated, true)
})

test('busy operations block closure and unload; a changed or disconnected stack invalidates pending navigation', () => {
  const guards = createCloseGuards()
  const state = { dirty: true, busy: true }, owner = { isConnected: true }
  const parent = ownerLayer(state, owner)
  guards.register(parent)
  let left = false
  guards.requestAll(() => { left = true })
  guards.request(parent, () => { left = true })
  assert.equal(getCloseConfirmation(), null)
  assert.equal(guards.shouldBlockUnload(), true)
  state.busy = false
  guards.requestAll(() => { left = true })
  const removeChild = guards.register(ownerLayer({ dirty: false, busy: false }, { isConnected: true }))
  discard()
  assert.equal(left, false)
  removeChild()
  guards.requestAll(() => { left = true })
  state.busy = true
  discard()
  assert.equal(left, false)
  state.busy = false
  guards.requestAll(() => { left = true })
  cancelCloseConfirmation(owner)
  assert.equal(getCloseConfirmation(), null)
  assert.equal(left, false)
  guards.requestAll(() => { left = true })
  owner.isConnected = false
  discard()
  assert.equal(left, false)
  state.dirty = false
  assert.equal(guards.shouldBlockUnload(), false)
})
