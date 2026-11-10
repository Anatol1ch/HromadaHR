import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChanges, hasNewEntitlement, historicalBalancePeriods, saveBalanceDraft, serviceDraftRows, setManualStart } from '../src/components/leave/draft.ts'

test('manual service dates suggest a clamped anniversary and preserve an edited end', () => {
  const row = { id: 1, start: '29.02.2024', startIso: '', end: '', endIso: '', days: '' }
  const suggested = setManualStart(row, '2024-02-29')
  assert.equal(suggested.endIso, '2025-02-27')
  const custom = { ...suggested, endIso: '2024-12-31', end: '31.12.2024', endEdited: true }
  assert.equal(setManualStart(custom, '2024-03-01').endIso, '2024-12-31')
  assert.equal(setManualStart({ ...custom, endEdited: false }, '2024-03-01').endIso, '2025-02-28')
})

test('confirmation is limited to new entitlements, including explicit zero and mixed batches', () => {
  const entitlement = { leaveType: 'annual_main', periodStart: '2027-01-01', periodEnd: '2027-12-31', accountingBasis: 'confirmed_entitlement', status: 'proposed' }
  const confirmed = { ...entitlement, status: 'confirmed', confirmedDays: 8, referenceEntitlementDays: null }
  const initial = { ...entitlement, accountingBasis: 'initial_balance', periodStart: '2026-01-01', periodEnd: '2026-12-31' }
  const historical = { period: initial, days: '3' }
  const correction = { period: confirmed, days: '6' }
  const next = { ...entitlement, periodStart: '2028-01-01', periodEnd: '2028-12-31' }
  assert.equal(hasNewEntitlement(buildChanges([historical, correction]), [initial, confirmed]), false)
  assert.equal(hasNewEntitlement(buildChanges([historical, correction, { period: next, days: '0' }]), [initial, confirmed, next]), true)
  assert.equal(hasNewEntitlement(buildChanges([{ period: next, days: '' }]), [next]), false)
})

const proposal = { status: 'proposed', leaveType: 'annual_main', accountingBasis: 'initial_balance',
  periodStart: '2026-06-15', periodEnd: '2027-06-14' }
const confirmed = { ...proposal, status: 'confirmed', confirmedDays: 7, referenceEntitlementDays: 24 }

test('historical editing retains initial drafts and existing confirmations, including zero', () => {
  const newRight = { ...proposal, accountingBasis: 'confirmed_entitlement', periodStart: '2027-06-15', periodEnd: '2028-06-14' }
  const savedRight = { ...newRight, status: 'confirmed', confirmedDays: 0, referenceEntitlementDays: null }
  assert.deepEqual(historicalBalancePeriods([proposal, confirmed, newRight, savedRight]), [proposal, confirmed, savedRight])
  const correction = buildChanges([{ period: savedRight, days: '4' }])
  const manual = { id: 0, start: '01.01.2027', end: '31.12.2027', days: '0' }
  assert.equal(hasNewEntitlement(correction, [savedRight]), false)
  assert.equal(hasNewEntitlement(buildChanges([manual]), [savedRight]), true)
})

test('leave drafts send only new or changed confirmations, including explicit zero', () => {
  assert.deepEqual(buildChanges([{ period: proposal, days: '' }, { period: confirmed, days: '7' }]), [])
  assert.deepEqual(buildChanges([{ period: proposal, days: '0' }]), [{
    leaveType: 'annual_main', accountingBasis: 'initial_balance', periodStart: '2026-06-15',
    periodEnd: '2027-06-14', confirmedDays: 0, referenceEntitlementDays: null,
  }])
  const [change] = buildChanges([{ period: confirmed, days: '5' }])
  assert.equal(change.confirmedDays, 5)
  assert.equal(change.referenceEntitlementDays, 24)
  assert.deepEqual(buildChanges([{ period: { ...confirmed, confirmedDays: 5 }, days: '5' }]), [])
})

test('invalid drafts and clearing saved days fail without modifying the input', () => {
  for (const days of ['', '-1', '1.5', '1e2', '9007199254740992']) {
    const rows = [{ period: confirmed, days }]
    const before = structuredClone(rows)
    assert.throws(() => buildChanges(rows))
    assert.deepEqual(rows, before)
  }
  const manual = { id: 0, start: '29.02.2028', startIso: '2028-02-29', end: '28.02.2029', endIso: '2029-02-28', days: '0' }
  assert.equal(buildChanges([manual])[0].accountingBasis, 'confirmed_entitlement')
  assert.throws(() => buildChanges([{ ...manual, start: '31.02.2028' }]))
  assert.throws(() => buildChanges([manual, { ...manual, id: 1 }]))
})

test('service preview preserves confirmed periods and keeps entered days when the date changes', () => {
  const saved = { ...confirmed, leaveType: 'oms_service_additional', periodStart: '2024-02-29', periodEnd: '2025-02-27' }
  const original = [{ period: saved, days: '7' }]
  const preview = serviceDraftRows(original, '2024-02-29', '2027-01-01', [], false)
  assert.equal(preview.rows[0], original[0])
  assert.deepEqual(preview.rows.slice(1).map(row => [row.period.periodStart, row.period.periodEnd, row.days]), [
    ['2025-02-28', '2026-02-27', ''], ['2026-02-28', '2027-02-27', ''], ['2027-02-28', '2028-02-27', ''],
  ])
  const edited = { ...preview.rows[1], days: '0' }
  const changed = serviceDraftRows([original[0], edited], '2025-06-01', '2027-01-01', [], true)
  assert.equal(changed.rows[0], original[0])
  assert.equal(changed.detached.has(edited), true)
  assert.equal(changed.rows.some(row => row.period.periodStart === '2027-06-01'), false)
  assert.equal(serviceDraftRows([original[0], { ...edited, days: '' }], '2025-06-01', '2027-01-01', [], false).detached.size, 0)
  const manual = { id: 1, start: '01.06.2024', end: '31.12.2024', days: '1' }
  assert.throws(() => buildChanges([...original, manual]), error => error.row === 1 && /перекриває/.test(error.message))
})

test('a failed second write retains the saved date and retry writes days alone', async () => {
  const changes = buildChanges([{ period: proposal, days: '0' }])
  const calls = []
  const api = {
    saveServiceLeaveStart: async (id, date) => { calls.push(['date', id, date]); return { ok: true, data: date } },
    savePeriods: async (id, days) => { calls.push(['days', id, days]); return { ok: false, error: { code: 'PERIOD_IN_USE' } } },
  }
  const first = await saveBalanceDraft(api, 'worker', '2024-02-29', changes)
  assert.deepEqual(first, { failed: 'days', code: 'PERIOD_IN_USE', savedDate: '2024-02-29' })
  api.savePeriods = async (id, days) => { calls.push(['retry', id, days]); return { ok: true, data: [] } }
  assert.deepEqual(await saveBalanceDraft(api, 'worker', undefined, changes), { savedDate: undefined })
  assert.deepEqual(calls, [['date', 'worker', '2024-02-29'], ['days', 'worker', changes], ['retry', 'worker', changes]])
  api.saveServiceLeaveStart = async () => ({ ok: false, error: { code: 'UNAVAILABLE' } })
  assert.deepEqual(await saveBalanceDraft(api, 'worker', null, changes), { failed: 'date', code: 'UNAVAILABLE' })
  assert.equal(calls.length, 3)
})
