import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync,existsSync } from 'node:fs'
import { profileSections,profileSection,requestProfileSection } from '../src/employees/profile.ts'
import { requestEmployeeNavigation } from '../src/employees/navigation.ts'
import { initialWorkspace,workspaceReducer,mergeEmployee } from '../src/employees/workspace.ts'
import { createCloseGuards } from '../src/employees/closeGuards.ts'
import { confirmModalClose,getCloseConfirmation,finishCloseConfirmation } from '../src/components/closeConfirmation.ts'
const employee={id:'e',lastName:'Тест',firstName:'Анна',employeeType:'official',positionCategory:'VII',position:{id:'p',name:'Посада'},department:{id:'d',name:'Відділ'}}
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('profile sections follow the new order; existing intents retain semantic keys and staff cannot open rank',()=>{
 assert.deepEqual(profileSections('official').map(s=>s.id),['general','service','rank','leave'])
 assert.deepEqual(profileSections('staff').map(s=>s.id),['general','service','leave'])
 assert.equal(profileSection(profileSection('rank','staff'),'official'),'general')
 for(const tab of ['general','service','rank','leave']){
  let intent
  requestEmployeeNavigation({employeeId:'e',tab},8,proceed=>proceed(),v=>{intent=v})
  assert.deepEqual(intent,{employeeId:'e',tab,requestId:8})
  assert.equal(profileSection(intent.tab,'official'),tab)
  assert.equal(profileSection(intent.tab,'staff'),tab==='rank'?'general':tab)
 }
})
test('opening and leaving a profile preserve registry filters; edit updates the same record and delete returns to list',()=>{
 const registry={...initialWorkspace.registry,query:'Тест',departmentId:'d',positionId:'p',employeeType:'official',filtersOpen:true}
 let state=workspaceReducer(initialWorkspace,{type:'registry',registry})
 const retained=state.registry
 state=workspaceReducer(state,{type:'card',id:'e'});assert.equal(state.cardId,'e');assert.equal(state.registry,retained)
 const changed={...employee,lastName:'Нове прізвище',position:{id:'p',name:'Нова назва'}}
 state=workspaceReducer(state,{type:'form',form:{kind:'edit',employee}})
 state=workspaceReducer(state,{type:'saved',employee:changed,created:false})
 assert.equal(state.cardId,'e');assert.equal(state.form,null);assert.equal(state.revision,1);assert.equal(state.registry,retained)
 assert.deepEqual(mergeEmployee([employee],changed),[changed]);assert.equal(employee.lastName,'Тест')
 state=workspaceReducer(state,{type:'card',id:null});assert.equal(state.cardId,null);assert.equal(state.registry,retained)
 state=workspaceReducer(state,{type:'card',id:'e'})
 state=workspaceReducer(state,{type:'deleted',id:'e'});assert.equal(state.cardId,null);assert.equal(state.registry,retained)
})
test('section changes, back navigation and employee switching use one existing draft confirmation and respect busy',()=>{
 const guards=createCloseGuards(),owner={isConnected:true};let dirty=true,busy=false,section='service',switched
 guards.register({dirty:()=>dirty,busy:()=>busy,confirm:(changed,proceed)=>confirmModalClose(changed,proceed,owner)})
 const guard=proceed=>guards.requestAll(proceed)
 requestProfileSection(section,'leave','official',guard,next=>{section=next})
 const first=getCloseConfirmation();assert.ok(first);assert.equal(section,'service')
 // Repeated attempts share the same pending confirmation instead of opening another dialog.
 requestProfileSection(section,'rank','official',guard,next=>{section=next});assert.equal(getCloseConfirmation(),first)
 finishCloseConfirmation(first,false);assert.equal(section,'service')
 requestProfileSection(section,'leave','official',guard,next=>{section=next});finishCloseConfirmation(getCloseConfirmation(),true);assert.equal(section,'leave')
 requestEmployeeNavigation({employeeId:'other',tab:'general'},2,guard,v=>{switched=v});assert.equal(switched,undefined)
 finishCloseConfirmation(getCloseConfirmation(),false);assert.equal(switched,undefined)
 busy=true;requestProfileSection(section,'general','official',guard,next=>{section=next});assert.equal(getCloseConfirmation(),null);assert.equal(section,'leave')
 busy=false;dirty=false;guard(()=>{section='list'});assert.equal(section,'list');assert.equal(getCloseConfirmation(),null)
})
test('page shell mounts only the active existing view, reads the current employee and retains all legacy editors',()=>{
 const page=read('src/components/employees/EmployeeProfilePage.tsx'),workspace=read('src/components/employees/EmployeesWorkspace.tsx'),app=read('src/App.tsx')
 assert.equal(existsSync(new URL('../src/components/employees/EmployeeCard.tsx',import.meta.url)),false)
 assert.doesNotMatch(page,/from ['"].*Modal|<Modal|\shidden=|\.map\(.*tabpanel/)
 assert.match(page,/personnel\.getEmployee\(id\)/);assert.match(page,/personnelMessage\(result.error.code\)/)
 assert.match(page,/\[id, retry, revision, tabRequestId, onLoaded\]/)
 assert.match(page,/key=\{id\+':\'\+tabRequestId\+':\'\+section\}/)
 assert.match(page,/DataState kind="loading"/);assert.match(page,/Повторити завантаження/);assert.match(page,/До списку працівників/)
 assert.match(page,/<ServiceBaselinePanel /);assert.match(page,/<ProfileIndicatorPanel employee=\{employee\} kind="allowance"/);assert.match(page,/section==='rank'\?<ProfileIndicatorPanel/);assert.match(page,/:<ProfileLeaveWorkbench /)
 assert.doesNotMatch(page,/saveAllowance|saveRank|savePeriods|registerLeave|updateEmployee|deleteEmployee/)
 assert.match(workspace,/<div hidden=\{!!workspace.cardId\}><EmployeeRegistry/)
 assert.match(workspace,/<EmployeeProfilePage initialTab=/);assert.match(workspace,/<EmployeeForm /);assert.match(workspace,/<EmployeeActionDialog /)
 assert.match(app,/<DocumentsWorkspace /);assert.doesNotMatch(app,/<LeaveWorkspace |<SeniorityRanksWorkspace /);assert.match(app,/<PersonnelControlBell /)
 assert.match(app,/requestEmployeeNavigation\(issue,[\s\S]*navigationGuard.current/)
})
