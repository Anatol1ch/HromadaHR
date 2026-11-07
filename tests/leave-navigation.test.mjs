import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leaveGroupOptions, specialOptions, groupForType, matchesLeaveGroup, selectedLeaveType, leaveLabels } from '../src/components/leave/presentation.ts'
import { leaveTypes } from '../shared/leave.ts'
test('five visible groups preserve all six actual types and explicit special selection', () => {
  assert.deepEqual(leaveGroupOptions.map(item => item.label), ['Щорічна основна','Додаткова за стаж','Додаткова на дітей','Додаткова на навчання','Соціальні та інші'])
  assert.equal(selectedLeaveType('other',''),null)
  assert.equal(selectedLeaveType('other','annual_main'),null)
  assert.equal(specialOptions.length,2)
  for (const type of leaveTypes) {
    const group = groupForType(type)
    assert.equal(selectedLeaveType(group,group === 'other' ? type : ''),type)
    assert.equal(matchesLeaveGroup(type,group),true)
    assert.equal(matchesLeaveGroup(type,''),true)
    assert.equal(matchesLeaveGroup(type,'study_leave'),type === 'study_leave')
  }
  assert.equal(matchesLeaveGroup('veteran_special_leave','other'),true)
  assert.equal(matchesLeaveGroup('chernobyl_special_leave','other'),true)
  assert.notEqual(leaveLabels.veteran_special_leave,leaveLabels.chernobyl_special_leave)
})
test('employee-card leave boundary mounts the read-only module without mutation imports', () => {
  const card=readFileSync(new URL('../src/components/employees/EmployeeCard.tsx',import.meta.url),'utf8')
  const overview=readFileSync(new URL('../src/components/leave/LeaveOverview.tsx',import.meta.url),'utf8')
  assert.match(card,/<LeaveOverview /)
  assert.doesNotMatch(card,/LeaveBalances|LeaveRegistrationForm|LeaveRecordAction|BalanceEditor/)
  assert.doesNotMatch(overview,/LeaveBalances|LeaveRegistrationForm|LeaveRecordAction|BalanceEditor|savePeriods|deletePeriod|registerLeave|updateLeave|cancelLeave/)
  assert.match(overview,/balanceSummary/)
  const workspace=readFileSync(new URL('../src/components/leave/LeaveWorkspace.tsx',import.meta.url),'utf8')
  assert.match(workspace,/section === 'balances' && employee && <LeaveBalances/)
  assert.ok(workspace.includes('navigationGuard.current(() => setSection(value))'))
})
