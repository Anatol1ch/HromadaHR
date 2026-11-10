import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accountingYears, annualUsage, matchesEmployeeName, sortedLeaveYears } from '../src/components/leave/usage.ts'

test('leave year selectors list distinct years in ascending order', () => {
  assert.deepEqual(sortedLeaveYears(['2029','2027','2028','2027']), ['2027','2028','2029'])
})

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

test('editing and cancellation change the active summary without hiding the cancelled record', () => {
  const original = record({ leaveType: 'study_leave', usedDays: 5 })
  const edited = { ...original, usedDays: 3 }
  const cancelled = { ...edited, status: 'cancelled' }
  assert.equal(annualUsage([original], 'a', 'study_leave', '2027').days, 5)
  assert.equal(annualUsage([edited], 'a', 'study_leave', '2027').days, 3)
  const summary = annualUsage([cancelled], 'a', 'study_leave', '2027')
  assert.deepEqual([summary.activeCount, summary.days, summary.cancelledCount], [0, 0, 1])
  assert.deepEqual(summary.history, [cancelled])
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

test('employee search matches all name parts without choosing a default employee', () => {
  assert.equal(matchesEmployeeName('Коваль Олена Іванівна','  оЛеНа   коваль '),true)
  assert.equal(matchesEmployeeName('Коваль Олена Іванівна','Петро'),false)
  const source=readFileSync(new URL('../src/components/leave/EmployeeChooser.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(source,/onSelect\(results\[0\]|onSelect\(employees\[0\]/)
  assert.match(source,/onChange=\{onSelect\}/)
  assert.match(source,/searchable matchesSearch=\{matchesEmployeeOption\}/)
  assert.match(source,/<Select/)
})

test('editor actions are contextual and rights keep a single guarded explicit save', () => {
  const editor=readFileSync(new URL('../src/components/leave/BalanceEditor.tsx',import.meta.url),'utf8')
  assert.match(editor,/hasRowActions = type === 'oms_service_additional' && rows.some/)
  assert.match(editor,/hasRowActions \? \[\{label:'Дії'/)
  assert.match(editor,/hasRowActions && <td/)
  const rights=readFileSync(new URL('../src/components/leave/LeaveRights.tsx',import.meta.url),'utf8')
  assert.match(rights,/role="radiogroup"/)
  assert.match(rights,/useUnsavedChanges\(changes.length>0/)
  assert.match(rights,/disabled=\{!saved\|\|!changes.length\|\|busy\}/)
  assert.equal((rights.match(/saveRights\(/g)??[]).length,1)
  assert.doesNotMatch(rights,/<Select/)
})

test('accounting years include the operating range and later recorded start years for the selected employee', () => {
  const records = [record(), record({ startDate: '2032-01-01' }), record({ employeeId: 'b', startDate: '2033-01-01' })]
  assert.deepEqual(accountingYears(records, 'a', '2029'), ['2027', '2028', '2029', '2030', '2032'])
  assert.deepEqual(accountingYears([], 'a', '2027'), ['2027', '2028'])
})
