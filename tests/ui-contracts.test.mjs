import test from 'node:test'
import assert from 'node:assert/strict'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { confirmModalClose, getCloseConfirmation, finishCloseConfirmation, cancelCloseConfirmation } from '../src/components/closeConfirmation.ts'

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
