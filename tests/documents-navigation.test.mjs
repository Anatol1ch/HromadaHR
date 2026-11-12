import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { journalRows, emptyLeaveFilters, contextualLeaveFilters } from '../src/components/leave/registry.ts'
import { personnelMessage } from '../src/employees/model.ts'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('shell has exactly six sections, two active home shortcuts and only the documents journal route', () => {
  const app = read('src/App.tsx')
  const sections = app.slice(app.indexOf('const sections ='), app.indexOf('type SectionId'))
  assert.deepEqual([...sections.matchAll(/id: '([^']+)'/g)].map(m => m[1]), ['home','overview','employees','documents','dictionaries','settings'])
  const shortcuts = app.slice(app.indexOf('className="workspace-shortcuts"'),app.indexOf('className="page-footer"'))
  assert.deepEqual([...shortcuts.matchAll(/id: '([^']+)'/g)].map(m => m[1]),['employees','documents'])
  assert.doesNotMatch(shortcuts,/locked|aria-disabled|available: false/)
  assert.doesNotMatch(app,/LeaveWorkspace|SeniorityRanksWorkspace|sectionDescriptions|active === '(leave|service)'/)
  assert.match(app,/active === 'documents' \?\s*<DocumentsWorkspace initialIntent=\{documentIntent\} navigationGuard=\{navigationGuard\}/)
  assert.match(app,/navigationGuard.current\(\(\) => \{ setEmployeeIntent\(undefined\);setActive\(id\)/)
  assert.match(app,/requestEmployeeNavigation\(issue,[\s\S]*navigationGuard.current/)
  assert.match(app,/className="sidebar-bottom"[\s\S]*section=\{settingsSection\}/)
  assert.match(personnelMessage('EMPLOYEE_HAS_CURRENT_RANK'),/вкладці «Ранги» особової картки/)
})

test('documents composes the unscoped journal and existing global form with explicit loading/error/retry', () => {
  const documents = read('src/components/documents/DocumentsWorkspace.tsx') + read('src/components/documents/LeaveDocumentsJournal.tsx')
  assert.match(documents,/>Документи<\/h1>/)
  assert.match(documents,/leave.listRecords\(null\)/)
  assert.match(documents,/personnel.listEmployees\(\)/)
  const journal = documents.slice(documents.indexOf('<LeaveJournal'), documents.indexOf('{active && creating &&'))
  assert.doesNotMatch(journal,/employeeId=|key=/)
  assert.match(journal,/onChanged=\{refresh\}/)
  assert.match(documents,/employeePicker=/)
  assert.match(documents,/onChange=\{id => \{ if \(id !== selected\) navigationGuard.current/)
  assert.match(documents,/key=\{selected \|\| 'new'\}/)
  assert.match(documents,/active && creating && \(!currentEmployees\?\.data \? <Modal/)
  assert.match(documents,/currentEmployees\?\.error \? <Alert/)
  assert.match(documents,/!people.length && <p>Додайте працівника/)
  assert.match(documents,/records\?\.revision === revision/)
  assert.match(documents,/employees\?\.revision === employeeRevision/)
  assert.equal((documents.match(/return \(\) => \{ active = false \}/g) ?? []).length,2)
  assert.doesNotMatch(documents,/savePeriods|registerLeave\(|updateLeave\(|cancelLeave\(|EmployeeChooser|<LeaveRights|<LeaveBalances/)
})

test('registration history suspends the same form; shared actions and personal isolation remain intact', () => {
  const documents = read('src/components/documents/DocumentsWorkspace.tsx') + read('src/components/documents/LeaveDocumentsJournal.tsx')
  assert.match(documents,/open: next => \{ setContext\(next\); refresh\(\) \}, suspended: !active \|\| context !== null/)
  assert.match(documents,/onResume=\{\(\) => setContext\(null\)\}/)
  assert.doesNotMatch(documents,/creating && !context|key=\{context/)
  assert.match(read('src/components/leave/LeaveRegistrationForm.tsx'),/if \(history.suspended\) return null/)
  const journal = read('src/components/leave/LeaveJournal.tsx')
  assert.match(journal,/contextView\?\.source === context/)
  assert.match(journal,/<LeaveRecordAction/)
  assert.match(journal,/record.status==='active'/)
  assert.match(journal,/!history.error && !history.loading/)
  assert.match(read('src/components/leave/ProfileLeaveWorkbench.tsx'),/leave.listRecords\(employeeId\)/)
  assert.match(journal,/leaveRecordBelongsToEmployee\(record, employeeId\)/)
  const profile = read('src/components/employees/EmployeeProfilePage.tsx')
  assert.match(profile,/<ProfileIndicatorPanel employee=\{employee\} kind="allowance"/)
  assert.match(profile,/<ProfileIndicatorPanel employee=\{employee\} kind="rank"/)
  assert.match(profile,/<ProfileLeaveWorkbench/)
})

test('global filters span workers; context roundtrip does not alter the normal journal selection', () => {
  const people=[{id:'a',lastName:'Коваль',firstName:'Анна',department:{id:'d1',name:'Рада'},position:{id:'p1',name:'Спеціаліст'}},
    {id:'b',lastName:'Шевченко',firstName:'Іван',department:{id:'d2',name:'Відділ'},position:{id:'p2',name:'Начальник'}}]
  const records=[{id:'1',employeeId:'a',leaveType:'annual_main',startDate:'2027-01-01',endDate:'2027-01-10',status:'active',usedDays:10,orderNumber:'12-р'},
    {id:'2',employeeId:'b',leaveType:'study_leave',startDate:'2028-01-01',endDate:'2028-01-10',status:'cancelled',usedDays:10}]
  const rows = (filters, context=false) => journalRows(records,people,filters,'startDate','desc',context).map(r=>r.id)
  assert.deepEqual(rows(emptyLeaveFilters),['2','1'])
  const normal={...emptyLeaveFilters,query:'Коваль 12',department:'d1',position:'p1',employee:'a',type:'annual_main',year:'2027',status:'active'}
  assert.deepEqual(rows(normal),['1'])
  assert.deepEqual(rows(contextualLeaveFilters({employeeId:'b',type:'study_leave',year:'2028'}),true),['2'])
  assert.deepEqual(rows(normal),['1'])
  assert.deepEqual(rows({...emptyLeaveFilters,status:'cancelled'}),['2'])
  assert.deepEqual(rows(emptyLeaveFilters),['2','1'])
})

test('retired UI files have no remaining imports; active profile and document editors remain available', () => {
  const removed = ['leave/LeaveWorkspace','seniority-ranks/SeniorityRanksWorkspace','seniority-ranks/IndicatorsCard',
    'leave/EmployeeChooser','leave/LeaveAccountingOverview','leave/LeaveTypeNavigation','leave/navigation','leave/employeePicker']
  for (const name of removed) {
    assert.equal(existsSync(new URL('../src/components/' + name + (name.endsWith('/navigation') || name.endsWith('/employeePicker') ? '.ts' : '.tsx'), import.meta.url)),false)
  }
  const root = new URL('../src/', import.meta.url)
  for (const entry of readdirSync(root, { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(entry.replaceAll('\\','/'),root),'utf8')
    const imports = [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map(match => match[1]).filter(path=>path.startsWith('.')).map(path=>new URL(path,new URL(entry.replaceAll('\\','/'),root)).pathname.replace(/\.tsx?$/,''))
    for (const name of removed) assert.equal(imports.includes(new URL('../src/components/'+name,import.meta.url).pathname), false, entry + ': ' + name)
  }
  for (const name of ['employees/EmployeeProfilePage','employees/EmployeeForm','leave/ProfileLeaveWorkbench','leave/LeaveJournal',
    'leave/LeaveRegistrationForm','leave/LeaveRecordAction','leave/LeaveRights','leave/LeaveBalances','seniority-ranks/IndicatorEditor',
    'seniority-ranks/FocusedIndicatorEditor','seniority-ranks/RankProjectionPanel','documents/DocumentsWorkspace']) {
    assert.equal(existsSync(new URL('../src/components/'+name+'.tsx',import.meta.url)),true)
  }
})
