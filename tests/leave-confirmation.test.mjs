import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmationChanges, confirmationPeriods } from '../src/components/leave/confirmation.ts'

const input = {
  requestId: 'request', employeeId: 'employee', leaveType: 'annual_main', startDate: '2027-01-14', endDate: '2027-01-19',
  usedDays: 6, allocations: [{ periodId: 'previous', days: 2 }, { periodId: 'current', days: 4 }],
  grantBasis: null, durationExplanation: null, orderNumber: '12-р', orderDate: '2027-01-13',
}
const current = { id: 'current', status: 'confirmed', employeeId: input.employeeId, leaveType: input.leaveType, periodStart: '2027-01-01', periodEnd: '2027-12-31' }
const previous = { ...current, id: 'previous', periodStart: '2026-01-01', periodEnd: '2026-12-31' }

test('confirmation resolves exactly the payload allocations in their existing order', () => {
  assert.deepEqual(confirmationPeriods(input, [current, previous, { ...current, id: 'unused' }]), [
    { periodId: 'previous', start: previous.periodStart, end: previous.periodEnd, days: 2 },
    { periodId: 'current', start: current.periodStart, end: current.periodEnd, days: 4 },
  ])
  assert.deepEqual(confirmationPeriods({ ...input, usedDays: 4, allocations: input.allocations.slice(1) }, [current, previous]), [
    { periodId: 'current', start: current.periodStart, end: current.periodEnd, days: 4 },
  ])
  for (const leaveType of ['study_leave', 'veteran_special_leave', 'chernobyl_special_leave']) {
    assert.deepEqual(confirmationPeriods({ ...input, leaveType, allocations: [] }, []), [])
  }
})

test('missing or inconsistent allocations cannot form a valid confirmation', () => {
  assert.equal(confirmationPeriods(input, [current]), null)
  for (const change of [{ employeeId: 'someone-else' }, { leaveType: 'oms_service_additional' }, { status: 'proposed' },
    { periodEnd: '2026-02-29' }, { periodEnd: '2025-12-31' }]) {
    assert.equal(confirmationPeriods(input, [current, { ...previous, ...change }]), null)
  }
  assert.equal(confirmationPeriods({ ...input, usedDays: 7 }, [current, previous]), null)
  assert.equal(confirmationPeriods({ ...input, allocations: [{ periodId: 'previous', days: 6 }, { periodId: 'previous', days: 0 }] }, [previous]), null)
})

test('edit indicators compare saved values by period ID and omit unchanged fields', () => {
  const original = { ...input, allocations: [...input.allocations].reverse() }
  assert.deepEqual(confirmationChanges(input, original), [])
  assert.deepEqual(confirmationChanges({ ...input, endDate: '2027-01-18', usedDays: 5,
    allocations: [{ periodId: 'previous', days: 5 }], orderNumber: null, durationExplanation: 'Уточнення' }, original),
  ['Дати', 'Тривалість', 'Розподіл днів', 'Розпорядження', 'Пояснення тривалості'])
  assert.deepEqual(confirmationChanges({ ...input, leaveType: 'study_leave', grantBasis: 'Довідка' }, original),
    ['Вид відпустки', 'Підстава надання'])
})
