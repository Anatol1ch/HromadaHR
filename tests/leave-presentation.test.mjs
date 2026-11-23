import { leaveRecordBelongsToEmployee, journalRows, emptyLeaveFilters, contextualLeaveFilters } from '../src/components/leave/registry.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceSummary, allocationDraft, formatLeaveDays } from '../src/components/leave/summary.ts'
import { initialLeaveWorkspaceState, leaveWorkspaceNavigation } from '../src/components/leave/workbench-navigation.ts'
import { changedLeaveRights } from '../src/components/leave/rights-draft.ts'
import { leaveWorkspaceLabels } from '../src/components/leave/presentation.ts'
test('summaries keep missing distinct from zero, count all registered days and isolate three types', () => {
  const rows = [{leaveType:'annual_main',periodStart:'2024-01-01',confirmedDays:40,usedDays:14,availableDays:26}, {leaveType:'children_social_additional',periodStart:'2024-01-01',confirmedDays:0,usedDays:0,availableDays:0}]
  const proposals = [{leaveType:'annual_main',periodStart:'2024-01-01'}, {leaveType:'annual_main',periodStart:'2025-01-01'}]
  assert.deepEqual(balanceSummary('annual_main',rows,proposals),{count:1,incomplete:true,entered:40n,accounted:14n,remaining:26n,positiveCount:1,oldestPositive:rows[0]})
  assert.equal(balanceSummary('children_social_additional',rows,proposals).count,1)
  assert.equal(balanceSummary('children_social_additional',rows,proposals).remaining,0n)
  assert.equal(balanceSummary('oms_service_additional',rows,proposals).count,0)
  assert.equal(formatLeaveDays(0n),'0 днів')
  assert.equal(formatLeaveDays(21),'21 день')
})

test('workbench switches four sections and preserves selected balance and history return context', () => {
  const accounting = leaveWorkspaceNavigation(initialLeaveWorkspaceState, { type: 'open-balances', leaveType: 'annual_main' })
  assert.equal(accounting.view, 'balances')
  assert.equal(accounting.selectedType, 'annual_main')
  const rights = leaveWorkspaceNavigation(accounting, { type: 'navigate', view: 'rights' })
  assert.equal(rights.view, 'rights')
  assert.equal(rights.selectedType, 'annual_main')
  const detail = leaveWorkspaceNavigation(rights, { type: 'navigate', view: 'overview' })
  assert.equal(detail.view, 'overview')
  assert.equal(detail.selectedType, 'annual_main')
  const history = leaveWorkspaceNavigation(detail, { type: 'open-history', returnTo: detail.view })
  const resumed = leaveWorkspaceNavigation(history, { type: 'resume-history' })
  assert.equal(resumed.view, 'overview')
  assert.equal(resumed.selectedType, 'annual_main')
  const balances = leaveWorkspaceNavigation(resumed, { type: 'open-balances', leaveType: 'children_social_additional' })
  const historyFromBalances = leaveWorkspaceNavigation(balances, { type: 'open-history', returnTo: balances.view })
  const resumedBalances = leaveWorkspaceNavigation(historyFromBalances, { type: 'resume-history' })
  assert.equal(resumedBalances.view, balances.view)
  assert.equal(resumedBalances.selectedType, balances.selectedType)
  assert.equal(resumedBalances.historyReturn, 'balances')
})

test('focused right editor submits only its selected status and uses the agreed workspace labels', () => {
  const saved = [
    { employeeId: 'e1', leaveType: 'annual_main', status: 'has_right', checkedAt: '2026-11-20T12:00:00Z' },
    { employeeId: 'e1', leaveType: 'oms_service_additional', status: 'no_right', checkedAt: '2026-11-20T12:00:00Z' },
  ]
  const draft = { annual_main: 'no_right', oms_service_additional: 'has_right' }
  assert.deepEqual(changedLeaveRights([{ value: 'annual_main' }], draft, saved), [
    { leaveType: 'annual_main', status: 'no_right' },
  ])
  assert.equal(leaveWorkspaceLabels.oms_service_additional, 'Додаткова за стаж ОМС')
  assert.equal(leaveWorkspaceLabels.study_leave, 'Навчальна')
  assert.equal(leaveWorkspaceLabels.veteran_special_leave, 'Для УБД та інших категорій')
})
test('manual allocation starts empty, validates row limits and counts only eligible period IDs', () => {
  const rows = [{ id: 'old', availableDays: 4 }, { id: 'next', availableDays: 4 }]
  const draft = { old: '2', next: '4' }
  const initial = allocationDraft(rows, {}, 6)
  assert.deepEqual(initial.values, [])
  assert.equal(initial.total, 0)
  assert.equal(initial.complete, false)
  assert.match(initial.message, /6 днів/)
  assert.equal(allocationDraft(rows, { old: '4' }, 6).complete, false)
  assert.match(allocationDraft(rows, { old: '4', next: '4' }, 6).message, /прибрати 2/)
  assert.equal(allocationDraft(rows, { old: '5', next: '1' }, 6).complete, false)
  assert.equal(allocationDraft(rows, { old: '2.5', next: '4' }, 6).invalid.has('old'), true)
  assert.equal(allocationDraft(rows, draft, 6).complete, true)
  assert.deepEqual(allocationDraft(rows, draft, 6).values, [{ periodId: 'old', days: 2 }, { periodId: 'next', days: 4 }])
  const revised = allocationDraft(rows.slice(0, 1), draft, 6)
  assert.equal(revised.ignored, true)
  assert.equal(revised.shortfall, 2)
  assert.equal(revised.total, 2)
  assert.equal(allocationDraft(rows, draft, 6).shortfall, 0)
  assert.deepEqual(draft, { old: '2', next: '4' })
})

test('resumed allocation requires explicit removal of unavailable period values', () => {
  const rows = [{ id: 'retained', availableDays: 6 }]
  const draft = { retained: '6', removed: '1' }
  assert.equal(allocationDraft(rows, draft, 6).complete, true)
  const resumed = allocationDraft(rows, draft, 6, true)
  assert.equal(resumed.ignored, true)
  assert.equal(resumed.complete, false)
  assert.match(resumed.message, /недоступні списання/)
  assert.equal(allocationDraft(rows, { retained: '6' }, 6, true).complete, true)
  assert.equal(allocationDraft([{ ...rows[0], availableDays: 5 }], draft, 6, true).complete, false)
  assert.deepEqual(draft, { retained: '6', removed: '1' })
})

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
