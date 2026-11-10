import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceSummary, allocationDraft, futureAllocationPeriod, formatLeaveDays } from '../src/components/leave/summary.ts'
test('summaries keep missing distinct from zero, count all registered days and isolate three types', () => {
  const rows = [{leaveType:'annual_main',periodStart:'2024-01-01',confirmedDays:40,usedDays:14,availableDays:26}, {leaveType:'children_social_additional',periodStart:'2024-01-01',confirmedDays:0,usedDays:0,availableDays:0}]
  const proposals = [{leaveType:'annual_main',periodStart:'2024-01-01'}, {leaveType:'annual_main',periodStart:'2025-01-01'}]
  assert.deepEqual(balanceSummary('annual_main',rows,proposals),{count:1,incomplete:true,entered:40n,accounted:14n,remaining:26n,positiveCount:1,oldestPositive:rows[0]})
  assert.equal(balanceSummary('children_social_additional',rows,proposals).count,1)
  assert.equal(balanceSummary('children_social_additional',rows,proposals).remaining,0n)
  assert.equal(balanceSummary('oms_service_additional',rows,proposals).count,0)
  assert.equal(formatLeaveDays(0n),'0 днів')
  assert.equal(formatLeaveDays(21),'21 день')
})
test('oldest positive period ignores exhausted balances and other types regardless of row order', () => {
  const row = (periodStart, availableDays, leaveType = 'annual_main') => ({ periodStart, availableDays, leaveType, confirmedDays: 10, usedDays: 10 - availableDays })
  const oldest = row('2025-01-01', 2)
  const rows = [row('2026-01-01', 7), row('2024-01-01', 0), oldest, row('2023-01-01', 8, 'children_social_additional')]
  const summary = balanceSummary('annual_main', rows, [])
  assert.equal(summary.positiveCount, 2)
  assert.equal(summary.oldestPositive, oldest)
  assert.equal(summary.remaining, 9n)
  assert.equal(balanceSummary('annual_main', [rows[1]], []).oldestPositive, null)
})
test('manual allocation starts empty, validates row limits and counts only eligible period IDs', () => {
  const rows = [{ id: 'old', availableDays: 4 }, { id: 'next', availableDays: 4 }]
  const draft = { old: '2', next: '4' }
  const initial = allocationDraft(rows, {}, 6)
  assert.deepEqual(initial.values, [])
  assert.equal(initial.total, 0)
  assert.equal(initial.complete, false)
  assert.match(initial.message, /6 днів/)
  assert.equal(allocationDraft(rows, { old: '4' }, 6).complete, false)
  assert.match(allocationDraft(rows, { old: '4', next: '4' }, 6).message, /прибрати 2/)
  assert.equal(allocationDraft(rows, { old: '5', next: '1' }, 6).complete, false)
  assert.equal(allocationDraft(rows, { old: '2.5', next: '4' }, 6).invalid.has('old'), true)
  assert.equal(allocationDraft(rows, draft, 6).complete, true)
  assert.deepEqual(allocationDraft(rows, draft, 6).values, [{ periodId: 'old', days: 2 }, { periodId: 'next', days: 4 }])
  const revised = allocationDraft(rows.slice(0, 1), draft, 6)
  assert.equal(revised.ignored, true)
  assert.equal(revised.shortfall, 2)
  assert.equal(revised.total, 2)
  assert.equal(allocationDraft(rows, draft, 6).shortfall, 0)
  assert.deepEqual(draft, { old: '2', next: '4' })
})

test('resumed allocation requires explicit removal of unavailable period values', () => {
  const rows = [{ id: 'retained', availableDays: 6 }]
  const draft = { retained: '6', removed: '1' }
  assert.equal(allocationDraft(rows, draft, 6).complete, true)
  const resumed = allocationDraft(rows, draft, 6, true)
  assert.equal(resumed.ignored, true)
  assert.equal(resumed.complete, false)
  assert.match(resumed.message, /недоступні списання/)
  assert.equal(allocationDraft(rows, { retained: '6' }, 6, true).complete, true)
  assert.equal(allocationDraft([{ ...rows[0], availableDays: 5 }], draft, 6, true).complete, false)
  assert.deepEqual(draft, { retained: '6', removed: '1' })
})

test('future proposal remains informational until a saved period exists, including confirmed zero', () => {
  const first = { leaveType: 'annual_main', periodStart: '2027-01-01', status: 'proposed' }
  const next = { ...first, periodStart: '2028-01-01' }
  assert.equal(futureAllocationPeriod([first, next], [], '2027-01-01'), next)
  const confirmed = { ...next, id: 'real-id', status: 'confirmed', confirmedDays: 0 }
  assert.equal(futureAllocationPeriod([first, next], [confirmed], '2027-01-01'), confirmed)
  assert.equal(futureAllocationPeriod([first], [], '2027-01-01'), undefined)
})
