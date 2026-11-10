import test from 'node:test'
import assert from 'node:assert/strict'
import { recordCountLabel, journalRows, emptyLeaveFilters, contextualLeaveFilters } from '../src/components/leave/registry.ts'
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

test('journal count uses compact Ukrainian forms and a separate filtered counter',()=>{
 assert.equal(recordCountLabel(1,1,false),'1 запис')
 assert.equal(recordCountLabel(2,2,false),'2 записи')
 assert.equal(recordCountLabel(11,11,false),'11 записів')
 assert.equal(recordCountLabel(21,21,false),'21 запис')
 assert.equal(recordCountLabel(1,12,true),'Знайдено: 1 із 12')
})

test('context starts with an exact type and start year, includes cancellations, and can be cleared', () => {
  const input = [...records, { ...records[0], id: '4', status: 'cancelled' },
    { ...records[0], id: '5', leaveType: 'chernobyl_special_leave' }]
  const context = contextualLeaveFilters({ employeeId: 'a', type: 'veteran_special_leave', year: '2027' })
  assert.deepEqual(journalRows(input, employees, context, 'startDate', 'desc', true).map(row => row.id), ['1', '4'])
  assert.deepEqual(journalRows(input, employees, { ...context, year: '2028' }, 'startDate', 'desc', true), [])
  assert.equal(journalRows(input, employees, emptyLeaveFilters, 'startDate', 'desc', true).length, input.length)
  assert.equal(journalRows(input, employees, { ...emptyLeaveFilters, type: 'other', year: '2028' }, 'startDate', 'desc').length, 4)
})
