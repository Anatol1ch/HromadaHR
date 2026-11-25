import { leaveRecordBelongsToEmployee, journalRows, emptyLeaveFilters, contextualLeaveFilters } from '../src/components/leave/registry.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceSummary, allocationDraft, formatLeaveDays, formatLeaveDayCount, formatLeaveCount, leaveOverviewAccounting, leaveOverviewCompactNoRight, leaveOverviewMetrics } from '../src/components/leave/summary.ts'
import { initialLeaveWorkspaceState, leaveWorkspaceNavigation } from '../src/components/leave/workbench-navigation.ts'
import { changedLeaveRights } from '../src/components/leave/rights-draft.ts'
import { leaveWorkspaceLabels, rightLabels } from '../src/components/leave/presentation.ts'
import { leaveTypes } from '../shared/leave.ts'
import { readFileSync } from 'node:fs'
test('overview period rows distinguish empty, confirmed zero, complete, partial and historical balances', () => {
  const proposals = [
    { leaveType: 'annual_main', periodStart: '2025-01-01' },
    { leaveType: 'annual_main', periodStart: '2026-01-01' },
  ]
  const empty = leaveOverviewAccounting('annual_main', [], proposals, [])
  assert.equal(empty.kind, 'period')
  assert.equal(empty.summary.count, 0)
  assert.equal(empty.summary.incomplete, true)
  assert.deepEqual(leaveOverviewMetrics(empty).map(metric => [metric.value, metric.kind]), [
    ['Не внесено', 'missing'], ['Не визначено', 'unknown'], ['Не визначено', 'unknown'],
  ])
  assert.equal(rightLabels.has_right, 'Право підтверджено')
  assert.equal(rightLabels.unknown, 'Право не перевірено')
  assert.equal(rightLabels.no_right, 'Права немає')

  const complete = leaveOverviewAccounting('annual_main', [
    { leaveType: 'annual_main', periodStart: '2025-01-01', confirmedDays: 30, usedDays: 10, availableDays: 20 },
    { leaveType: 'annual_main', periodStart: '2026-01-01', confirmedDays: 0, usedDays: 0, availableDays: 0 },
  ], proposals, [])
  assert.deepEqual([complete.summary.count, complete.summary.incomplete, complete.summary.entered, complete.summary.accounted, complete.summary.remaining], [2, false, 30n, 10n, 20n])
  assert.deepEqual(leaveOverviewMetrics(complete).map(metric => metric.value), ['30', '10', '20'])

  const historical = leaveOverviewAccounting('annual_main', [
    { leaveType: 'annual_main', periodStart: '2025-01-01', confirmedDays: 12, usedDays: 2, availableDays: 10 },
  ], proposals, [])
  assert.deepEqual([historical.summary.count, historical.summary.incomplete, historical.summary.remaining], [1, true, 10n])
  assert.deepEqual(leaveOverviewMetrics(historical, true).map(metric => metric.value), ['12', '2', '10'])
  assert.equal(leaveOverviewMetrics(historical, true)[2]?.detail?.join(' · '), 'Частковий залишок · Історичний залишок')

  const confirmedZero = leaveOverviewAccounting('children_social_additional', [
    { leaveType: 'children_social_additional', periodStart: '2025-01-01', confirmedDays: 0, usedDays: 0, availableDays: 0 },
  ], [], [])
  assert.deepEqual([confirmedZero.summary.count, confirmedZero.summary.entered, confirmedZero.summary.accounted, confirmedZero.summary.remaining], [1, 0n, 0n, 0n])
  assert.deepEqual(leaveOverviewMetrics(confirmedZero).map(metric => metric.value), ['0', '0', '0'])
  assert.equal(leaveOverviewAccounting('oms_service_additional', [], [], []).summary.count, 0)
})

test('overview event rows show only active registered use and never invent a balance', () => {
  const empty = leaveOverviewAccounting('study_leave', [], [], [])
  assert.deepEqual([empty.kind, empty.registeredCount, empty.usedDays], ['event', 0, 0n])
  assert.deepEqual(leaveOverviewMetrics(empty).map(metric => [metric.value, metric.kind]), [
    ['—', 'not-applicable'], ['0', 'value'], ['—', 'not-applicable'],
  ])
  const records = [
    { leaveType: 'study_leave', status: 'active', usedDays: 5 },
    { leaveType: 'study_leave', status: 'active', usedDays: 2 },
    { leaveType: 'study_leave', status: 'cancelled', usedDays: 14 },
    { leaveType: 'veteran_special_leave', status: 'active', usedDays: 3 },
  ]
  const active = leaveOverviewAccounting('study_leave', [], [], records)
  assert.deepEqual([active.registeredCount, active.usedDays], [2, 7n])
  assert.deepEqual(leaveOverviewAccounting('chernobyl_special_leave', [], [], records), { kind: 'event', registeredCount: 0, usedDays: 0n })
  assert.equal(formatLeaveCount(1), '1 відпустка')
  assert.equal(formatLeaveCount(3), '3 відпустки')
  assert.equal(formatLeaveCount(5), '5 відпусток')
})

test('overview compacts only no-right rows without periods or active usage', () => {
  const emptyPeriod = leaveOverviewAccounting('annual_main', [], [], [])
  assert.equal(leaveOverviewCompactNoRight('no_right', emptyPeriod), true)
  assert.equal(leaveOverviewCompactNoRight('unknown', emptyPeriod), false)
  assert.equal(leaveOverviewCompactNoRight('has_right', emptyPeriod), false)

  const historical = leaveOverviewAccounting('annual_main', [
    { leaveType: 'annual_main', periodStart: '2025-01-01', confirmedDays: 12, usedDays: 4, availableDays: 8 },
  ], [], [])
  assert.equal(leaveOverviewCompactNoRight('no_right', historical), false)

  const eventUsage = leaveOverviewAccounting('study_leave', [], [], [
    { leaveType: 'study_leave', status: 'active', usedDays: 4 },
  ])
  assert.equal(leaveOverviewCompactNoRight('no_right', eventUsage), false)

  const periodUsage = leaveOverviewAccounting('annual_main', [], [], [
    { leaveType: 'annual_main', status: 'active', usedDays: 4 },
  ])
  assert.equal(leaveOverviewCompactNoRight('no_right', periodUsage), false)
  assert.deepEqual(leaveOverviewMetrics(periodUsage).map(metric => metric.value), ['Не внесено', '4', 'Не визначено'])
})

test('overview does not infer entitlement from balances or the initial-period reference field', () => {
  const reference = { leaveType: 'annual_main', confirmedDays: 8, usedDays: 2, availableDays: 6, referenceEntitlementDays: 30 }
  const initial = leaveOverviewAccounting('annual_main', [{ ...reference, accountingBasis: 'initial_balance', periodStart: '2026-01-01' }], [], [])
  const confirmed = leaveOverviewAccounting('annual_main', [{ ...reference, referenceEntitlementDays: null, accountingBasis: 'confirmed_entitlement', periodStart: '2027-01-01' }], [], [])
  assert.equal(leaveOverviewMetrics(initial)[0]?.value, '8')
  assert.equal(leaveOverviewMetrics(confirmed)[0]?.value, '8')

  const schema = readFileSync(new URL('../electron/storage/migrations.ts', import.meta.url), 'utf8')
  assert.match(schema, /CHECK \(accounting_basis = 'initial_balance' OR reference_entitlement_days IS NULL\)/)
})

test('overview table keeps one five-cell row per leave type and styles cells without changing table display', () => {
  const component = readFileSync(new URL('../src/components/leave/LeaveOverview.tsx', import.meta.url), 'utf8')
  const styles = [
    'employee-profile.css', 'leave.css', 'components.css',
  ].map(file => readFileSync(new URL(`../src/styles/${file}`, import.meta.url), 'utf8')).join('\n')
  assert.equal(leaveTypes.length, 6)
  assert.match(component, /leaveTypes\.map\(type =>/)
  for (const heading of ['Вид відпустки', 'Право', 'Внесено', 'Використано', 'Залишок']) assert.ok(component.includes(heading))
  assert.match(component, /width: '30%'/)
  assert.match(component, /width: '22%'/)
  assert.equal([...component.matchAll(/width: '16%'/g)].length, 3)
  assert.match(component, /<td><LeaveRightStatus status=\{status\}\/>/)
  assert.match(component, /metrics\.map\(\(metric, index\) => <td key=\{index\}>/)
  assert.match(component, /<td colSpan=\{5\} className="leave-overview-compact-no-right">Права на відпустку немає<\/td>/)
  assert.match(component, /<td colSpan=\{3\} className="leave-overview-no-periods">/)
  assert.match(component, /leaveOverviewCompactNoRight\(status, accounting\)/)
  assert.doesNotMatch(component, /label:\s*['"]Належить['"]/)
  assert.equal(leaveOverviewMetrics(leaveOverviewAccounting('annual_main', [], [], [])).length, 3)
  assert.equal(leaveOverviewMetrics(leaveOverviewAccounting('study_leave', [], [], [])).length, 3)
  assert.match(component, /accounting\.summary\.incomplete \? 'Не всі періоди внесено' : 'Дні не внесено'/)

  const tableElementRules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectorList]) => selectorList.split(',').some(selector => /(?:^|[\s>+~])(?:table|thead|tbody|tr|th|td)(?:[.#][\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)*\s*$/.test(selector.trim())))
  assert.ok(tableElementRules.length > 0)
  for (const [, , declarations] of tableElementRules) assert.doesNotMatch(declarations, /display\s*:\s*(?:grid|flex|block)/)
  assert.match(styles, /\.leave-summary-table thead th \{[^}]*text-align:center/)
  assert.match(styles, /\.leave-summary-table tbody td \{[^}]*text-align:center[^}]*vertical-align:middle/)
  assert.match(styles, /\.leave-summary-table \.leave-right-status \{[^}]*justify-content:center/)
  assert.match(styles, /\.leave-overview-metric \{[^}]*justify-items:center[^}]*text-align:center/)
})

test('summaries keep missing distinct from zero, count all registered days and isolate three types', () => {
  const rows = [{leaveType:'annual_main',periodStart:'2024-01-01',confirmedDays:40,usedDays:14,availableDays:26}, {leaveType:'children_social_additional',periodStart:'2024-01-01',confirmedDays:0,usedDays:0,availableDays:0}]
  const proposals = [{leaveType:'annual_main',periodStart:'2024-01-01'}, {leaveType:'annual_main',periodStart:'2025-01-01'}]
  assert.deepEqual(balanceSummary('annual_main',rows,proposals),{count:1,incomplete:true,entered:40n,accounted:14n,remaining:26n,positiveCount:1,oldestPositive:rows[0]})
  assert.equal(balanceSummary('children_social_additional',rows,proposals).count,1)
  assert.equal(balanceSummary('children_social_additional',rows,proposals).remaining,0n)
  assert.equal(balanceSummary('oms_service_additional',rows,proposals).count,0)
  assert.equal(formatLeaveDays(0n),'0 днів')
  assert.equal(formatLeaveDays(21),'21 день')
  assert.equal(formatLeaveDayCount(0n), '0')
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
