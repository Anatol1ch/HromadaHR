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
  assert.ok(workspace.replace(/\s/g,'').includes("section==='balances'&&employee"))
  assert.ok(workspace.replace(/\s/g,'').includes('navigationGuard.current(()=>openSection(value))'))
})


test('three sections share employee context; general registration starts empty and read-only card remains separate',()=>{
  const source=readFileSync(new URL('../src/components/leave/LeaveWorkspace.tsx',import.meta.url),'utf8').replace(/\s/g,'')
  assert.ok(source.includes("['journal','balances','rights']"))
  assert.ok(source.includes("setCreateEmployee('');setCreating(true)"))
  assert.ok(source.includes("section==='rights'&&employee?<LeaveRights"))
  assert.ok(source.includes("section==='balances'&&employee?<divclassName=\"leave-balances-workbench\">"))
  assert.ok(source.includes('<LeaveTypeNavigationvalue={periodType}'))
  assert.ok(source.includes('navigationGuard.current(()=>{setPeriodType(type)})'))
  assert.ok(source.includes('<LeaveBalanceskey={employee.id+periodType}'))
  assert.doesNotMatch(source,/EventUsage/)
  const nav=readFileSync(new URL('../src/components/leave/LeaveTypeNavigation.tsx',import.meta.url),'utf8')
  assert.match(nav,/periodLeaveTypes/)
  assert.doesNotMatch(nav,/eventLeaveTypes/)
  assert.ok(source.includes('<EmployeeChooser'))
  assert.ok(source.includes('if(id!==selected)navigationGuard.current(()=>setSelected(id))'))
  assert.ok(source.includes('navigationGuard.current(()=>openSection(value))'))
  const rights=readFileSync(new URL('../src/components/leave/LeaveRights.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(rights,/Періоди та залишки|onPeriods/)
})
