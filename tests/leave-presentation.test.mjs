import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceSummary, allocationMessage } from '../src/components/leave/summary.ts'
test('summaries keep missing distinct from zero, count all registered days and isolate three types', () => {
  const rows = [{leaveType:'annual_main',periodStart:'2024-01-01',confirmedDays:40,usedDays:14,availableDays:26}, {leaveType:'children_social_additional',periodStart:'2024-01-01',confirmedDays:0,usedDays:0,availableDays:0}]
  const proposals = [{leaveType:'annual_main',periodStart:'2024-01-01'}, {leaveType:'annual_main',periodStart:'2025-01-01'}]
  assert.deepEqual(balanceSummary('annual_main',rows,proposals),{count:1,incomplete:true,entered:40n,accounted:14n,remaining:26n})
  assert.equal(balanceSummary('children_social_additional',rows,proposals).count,1)
  assert.equal(balanceSummary('children_social_additional',rows,proposals).remaining,0n)
  assert.equal(balanceSummary('oms_service_additional',rows,proposals).count,0)
})
test('allocation feedback distinguishes automatic, preserved, missing, excess and invalid inputs', () => {
  assert.match(allocationMessage(16,16,true,false),/автоматично/)
  assert.match(allocationMessage(16,16,true,true),/ручний/)
  assert.match(allocationMessage(16,12,true,true),/ще 4/)
  assert.match(allocationMessage(16,18,true,true),/зайві 2/)
  assert.match(allocationMessage(16,NaN,false,true),/Перевірте/)
})
