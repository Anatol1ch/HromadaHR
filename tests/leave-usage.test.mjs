import test from 'node:test'
import assert from 'node:assert/strict'
import { annualUsage } from '../src/components/leave/usage.ts'

const record = (changes = {}) => ({ employeeId:'a', leaveType:'veteran_special_leave', startDate:'2027-12-25', endDate:'2028-01-07', usedDays:14, status:'active', ...changes })

test('event accounting attributes a full duration once to the start year, excludes cancellations and isolates employee/type', () => {
  const records = [record(),record({status:'cancelled',usedDays:10}),record({employeeId:'b'}),record({leaveType:'chernobyl_special_leave',usedDays:16})]
  const usage = annualUsage(records,'a','veteran_special_leave','2027')
  assert.equal(usage.history.length,2)
  assert.equal(usage.activeCount,1)
  assert.equal(usage.cancelledCount,1)
  assert.equal(usage.days,14)
  assert.equal(usage.limit,14)
  assert.equal(usage.alreadyGranted,true)
  assert.equal('availableDays' in usage,false)
  const empty = annualUsage(records,'a','veteran_special_leave','2028')
  assert.deepEqual(empty.history,[])
  assert.equal(empty.activeCount,0)
  assert.equal(empty.days,0)
  assert.equal(annualUsage(records,'a','chernobyl_special_leave','2027').limit,16)
  const cancelledOnly = annualUsage([record({status:'cancelled'})],'a','veteran_special_leave','2027')
  assert.equal(cancelledOnly.alreadyGranted,false)
  assert.equal(cancelledOnly.history.length,1)
  assert.equal(cancelledOnly.days,0)
  assert.equal(cancelledOnly.cancelledCount,1)
})

test('study counts separate events without a universal limit or fictitious available balance', () => {
  const records = [record({leaveType:'study_leave',usedDays:30}),record({leaveType:'study_leave',usedDays:40,startDate:'2027-05-01'})]
  const usage=annualUsage(records,'a','study_leave','2027')
  assert.equal(usage.days,70)
  assert.equal(usage.activeCount,2)
  assert.equal(usage.limit,null)
  assert.equal(usage.alreadyGranted,false)
  assert.equal('remaining' in usage,false)
})
