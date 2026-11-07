import test from 'node:test'
import assert from 'node:assert/strict'
import { journalRows, emptyLeaveFilters, serviceYearDrafts } from '../src/components/leave/registry.ts'
import { buildChanges } from '../src/components/leave/draft.ts'
const employees=[{id:'a',lastName:'Іваненко',firstName:'Олена',middleName:null,department:{id:'d',name:'Відділ'},position:{id:'p',name:'Начальник'}},{id:'b',lastName:'Петренко',firstName:'Андрій',middleName:null,department:{id:'e',name:'Сектор'},position:{id:'q',name:'Спеціаліст'}}]
const records=[{id:'1',employeeId:'a',leaveType:'veteran_special_leave',startDate:'2027-12-25',endDate:'2028-01-07',usedDays:14,orderNumber:'42',status:'active'},{id:'2',employeeId:'b',leaveType:'annual_main',startDate:'2027-04-01',endDate:'2027-04-16',usedDays:16,orderNumber:'55',status:'cancelled'},{id:'3',employeeId:'a',leaveType:'chernobyl_special_leave',startDate:'2028-07-01',endDate:'2028-07-16',usedDays:16,orderNumber:null,status:'active'}]
test('registry filters intersect name/order, current personnel, group, year and status without duplicates',()=>{
 assert.deepEqual(journalRows(records,employees,{...emptyLeaveFilters,query:'ОЛЕНА 42',department:'d',position:'p',employee:'a',type:'other',year:'2028',status:'active'},'startDate','desc').map(r=>r.id),['1'])
 assert.equal(journalRows(records,employees,{...emptyLeaveFilters,type:'other'},'startDate','desc').length,2)
 assert.equal(journalRows(records,employees,{...emptyLeaveFilters,department:'e',type:'other'},'startDate','desc').length,0)
 const before=JSON.stringify(records)
 for(const key of ['name','department','position','type','startDate','endDate','days','status']){const asc=journalRows(records,employees,emptyLeaveFilters,key,'asc'),desc=journalRows(records,employees,emptyLeaveFilters,key,'desc');assert.equal(asc.length,3);assert.equal(desc.length,3)}
 assert.deepEqual(journalRows(records,employees,emptyLeaveFilters,'startDate','desc').map(r=>r.id),['3','1','2'])
 assert.deepEqual(journalRows(records,employees,emptyLeaveFilters,'name','asc').map(r=>r.id),['1','3','2'])
 assert.deepEqual(journalRows(records,employees,emptyLeaveFilters,'department','desc').map(r=>r.id),['2','1','3'])
 assert.deepEqual(journalRows(records,employees,emptyLeaveFilters,'position','asc').map(r=>r.id),['1','3','2'])
 assert.deepEqual(journalRows(records,employees,emptyLeaveFilters,'days','asc').map(r=>r.id),['1','2','3'])
 assert.equal(JSON.stringify(records),before)
})
test('OMS year proposals remain editable empty drafts until days are explicitly confirmed',()=>{
 assert.deepEqual(serviceYearDrafts(2026,2027),[{start:'2026-01-01',end:'2026-12-31'},{start:'2027-01-01',end:'2027-12-31'}])
 for(const pair of [[0,2027],[2027,2026],[2027,10000],[2000,2100],[2027.5,2028]])assert.throws(()=>serviceYearDrafts(...pair))
 const rows=serviceYearDrafts(2027,2027).map((p,id)=>({id,start:'01.01.2027',end:'31.12.2027',startIso:p.start,endIso:p.end,days:''}))
 assert.throws(()=>buildChanges(rows))
 rows[0].days='0';assert.equal(buildChanges(rows)[0].confirmedDays,0);assert.equal(buildChanges(rows)[0].leaveType,'oms_service_additional')
})
