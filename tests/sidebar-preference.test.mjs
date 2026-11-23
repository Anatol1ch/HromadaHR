import test from 'node:test'
import assert from 'node:assert/strict'
import { isCompactSidebar, readCompactSidebar, SIDEBAR_PREFERENCE_KEY, writeCompactSidebar } from '../src/lib/sidebar-preference.ts'

test('sidebar preference persists the desktop choice while narrow viewports remain compact', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(readCompactSidebar(storage), false)
  writeCompactSidebar(storage, true)
  assert.equal(values.get(SIDEBAR_PREFERENCE_KEY), 'compact')
  assert.equal(readCompactSidebar(storage), true)
  assert.equal(isCompactSidebar(true, false), true)
  assert.equal(isCompactSidebar(false, true), true)
  assert.equal(isCompactSidebar(false, false), false)
  writeCompactSidebar(storage, false)
  assert.equal(isCompactSidebar(false, readCompactSidebar(storage)), false)
})

test('sidebar preference storage failures do not break navigation', () => {
  assert.equal(readCompactSidebar({ getItem() { throw new Error('blocked') } }), false)
  assert.doesNotThrow(() => writeCompactSidebar({ setItem() { throw new Error('blocked') } }, true))
})
