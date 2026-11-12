import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leaveRecordBelongsToEmployee, journalRows, emptyLeaveFilters, contextualLeaveFilters } from '../src/components/leave/registry.ts'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { confirmModalClose, getCloseConfirmation, finishCloseConfirmation } from '../src/components/closeConfirmation.ts'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('personal scope survives cleared/context filters and never admits another employee; global journal stays unscoped', () => {
  const records = [
    {id:'a',employeeId:'e',leaveType:'study_leave',startDate:'2027-03-01',endDate:'2027-03-05',usedDays:5,status:'active',orderNumber:'125'},
    {id:'b',employeeId:'other',leaveType:'study_leave',startDate:'2027-04-01',endDate:'2027-04-05',usedDays:5,status:'active'},
    {id:'c',employeeId:'e',leaveType:'veteran_special_leave',startDate:'2028-01-01',endDate:'2028-01-14',usedDays:14,status:'cancelled'},
  ]
  const scoped = records.filter(r => leaveRecordBelongsToEmployee(r,'e'))
  const rows = filters => journalRows(scoped,[],filters,'startDate','desc',true).map(r=>r.id)
  assert.deepEqual(rows(emptyLeaveFilters),['c','a'])
  assert.deepEqual(rows({...emptyLeaveFilters,query:'125'}),['a'])
  assert.deepEqual(rows({...emptyLeaveFilters,type:'veteran_special_leave',status:'cancelled',year:'2028'}),['c'])
  assert.deepEqual(rows(contextualLeaveFilters({employeeId:'other',type:'study_leave',year:'2027'})),[])
  assert.equal(leaveRecordBelongsToEmployee(records[1],'e'),false)
  assert.equal(leaveRecordBelongsToEmployee(records[1],''),false)
  assert.equal(records.filter(r=>leaveRecordBelongsToEmployee(r)).length,3)
  assert.deepEqual(records.map(r=>r.id),['a','b','c'])
})

test('suspended registration retains the same draft guard; cancel keeps draft and busy blocks navigation', () => {
  const guards=createCloseGuards(), draft={start:'2027-03-01',days:5,order:'125'}
  let destination='registration', busy=false
  guards.register({dirty:()=>true,busy:()=>busy,confirm:(dirty,proceed)=>confirmModalClose(dirty,proceed,{isConnected:true})})
  // Opening history hides the form, without unregistering its guard or changing its draft.
  destination='history'
  guards.requestAll(()=>{destination='general'})
  const confirmation=getCloseConfirmation(); assert.ok(confirmation)
  finishCloseConfirmation(confirmation,false)
  assert.equal(destination,'history');assert.deepEqual(draft,{start:'2027-03-01',days:5,order:'125'})
  destination='registration';busy=true
  guards.requestAll(()=>{destination='list'});assert.equal(destination,'registration');assert.equal(getCloseConfirmation(),null)
  busy=false;guards.requestAll(()=>{destination='list'});finishCloseConfirmation(getCloseConfirmation(),true)
  assert.equal(destination,'list')
})

test('profile composes the existing editors with fixed identity, retained registration and scoped record reads', () => {
  const page=read('src/components/employees/EmployeeProfilePage.tsx')
  const workbench=read('src/components/leave/ProfileLeaveWorkbench.tsx')
  const journal=read('src/components/leave/LeaveJournal.tsx')
  const action=read('src/components/leave/LeaveRecordAction.tsx')
  const registration=read('src/components/leave/LeaveRegistrationForm.tsx')
  assert.match(page,/<ProfileLeaveWorkbench key=\{id\} employee=\{employee\}/)
  for (const component of ['LeaveOverview','LeaveRights','LeaveBalances','LeaveEventAccounting','LeaveJournal','LeaveRegistrationForm']) assert.match(workbench,new RegExp('<'+component+' '))
  assert.doesNotMatch(workbench,/EmployeeChooser|employeePicker|listEmployees|savePeriods|registerLeave|cancelLeave|updateLeave/)
  assert.match(workbench,/listRecords\(employeeId\)/)
  assert.match(workbench,/if \(next.employeeId !== employeeId\) return/)
  assert.match(workbench,/suspended: context !== null/)
  assert.match(workbench,/\{creating && <LeaveRegistrationForm/)
  assert.doesNotMatch(workbench,/creating && view|LeaveRegistrationForm key=/)
  assert.match(workbench,/return \(\) => \{ active = false \}/)
  assert.match(workbench,/records\?\.key === readKey/)
  assert.match(workbench,/navigationGuard.current\(\(\) =>/)
  assert.match(registration,/if \(history.suspended\) return null/)
  assert.match(registration,/history.open\(\{ employeeId, type, year: '' \}\)/)
  assert.match(journal,/expectedEmployeeId=\{employeeId\}/)
  assert.ok(action.indexOf('!leaveRecordBelongsToEmployee(record.data, expectedEmployeeId)') < action.indexOf('const [employee, balances, documentLink]'))
  assert.match(action,/record.status === 'cancelled'/)
  assert.match(read('src/components/documents/DocumentsWorkspace.tsx') + read('src/components/documents/LeaveDocumentsJournal.tsx'),/listRecords\(null\)/)
  assert.match(read('src/components/documents/DocumentsWorkspace.tsx') + read('src/components/documents/LeaveDocumentsJournal.tsx'),/employeePicker=/)
})
