import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { backupOverview } from '../src/backup/presentation.ts'

function target(change = {}) {
  return { slot: 1, path: null, available: false, autoDay: null, lastAttempt: null, lastSuccess: null, lastKind: null, error: null, fileName: null, ...change }
}
test('backup overview distinguishes unconfigured, partial failure, same volume, and busy without implying disk protection', () => {
  assert.equal(backupOverview(null).configured, false)
  const status = { targets: [target(), target({ slot: 2 })], sameVolume: false, busy: false, lastRestore: null }
  assert.equal(backupOverview(status).label, 'Потрібно вибрати дві теки')
  status.targets = [target({ path: 'X:\\one', available: true, lastSuccess: '2026-11-02T10:00:00+02:00' }),
    target({ slot: 2, path: 'Y:\\two', available: false, lastSuccess: '2026-11-02T08:30:00Z', error: 'BACKUP_FAILED' })]
  const before = structuredClone(status)
  assert.deepEqual(backupOverview(status), { configured: true, successes: 1, lastSuccess: '2026-11-02T08:30:00Z', errors: 1, label: 'Потребує уваги' })
  assert.deepEqual(status, before)
  assert.equal(backupOverview(status).successes, 1)
  status.targets[1].error = null
  assert.equal(backupOverview(status).errors, 1) // unavailable remains visible without an error code
  status.targets[1].available = true
  status.sameVolume = true
  assert.equal(backupOverview(status).label, 'Теки доступні')
  status.busy = true
  assert.equal(backupOverview(status).label, 'Виконується операція')
})

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
function resolve(name) {
  const value = tokens[name]
  assert.ok(value, name)
  return value.startsWith('var(') ? resolve(value.slice(4, -1)) : value
}
function luminance(hex) {
  let digits = hex.slice(1)
  if (digits.length === 3) digits = [...digits].map(char => char + char).join('')
  const rgb = [0, 2, 4].map(offset => parseInt(digits.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
function contrast(a, b) {
  const values = [luminance(resolve(a)), luminance(resolve(b))].sort((x, y) => y - x)
  return (values[0] + .05) / (values[1] + .05)
}
test('lilac normal text and semantic feedback meet WCAG AA; focus is distinguishable on light surfaces', () => {
  for (const foreground of ['--color-text', '--color-text-secondary', '--color-text-muted', '--color-text-label', '--color-text-hint', '--accent', '--accent-hover']) {
    for (const background of ['--surface-card', '--surface-app', '--surface-panel', '--accent-soft']) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}: ${contrast(foreground, background)}`)
    }
  }
  for (const background of ['--accent', '--accent-hover']) assert.ok(contrast('--color-on-accent', background) >= 4.5)
  for (const kind of ['success', 'error', 'warning', 'info']) assert.ok(contrast(`--feedback-${kind}-text`, `--feedback-${kind}-bg`) >= 4.5, kind)
  assert.ok(contrast('--border-focus', '--surface-card') >= 3)
})
