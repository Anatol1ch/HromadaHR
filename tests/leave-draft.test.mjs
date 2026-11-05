import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChanges } from '../src/components/leave/draft.ts'

const proposal = { status: 'proposed', leaveType: 'annual_main', accountingBasis: 'initial_balance',
  periodStart: '2026-06-15', periodEnd: '2027-06-14' }
const confirmed = { ...proposal, status: 'confirmed', confirmedDays: 7, referenceEntitlementDays: 24 }

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
