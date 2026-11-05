import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeCounts, employeeGroups, filterEmployees, initialRegistry, nextSort, registryOptions, sortEmployees } from '../src/employees/registry.ts'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../src/employees/workspace.ts'

function row(id, lastName, position, department, hireDate, employeeType = 'official') {
  return { id, lastName, firstName: 'Умовний', middleName: 'Прикладович', birthDate: null, employeeType, hireDate,
    positionId: position, departmentId: department,
    position: { id: position, name: position }, department: { id: department, name: department } }
}
const rows = [
  row('a', 'Яворів', 'Бухгалтер', 'Юридичний', '2026-02-01'),
  row('b', 'Іваненко', 'Юрист', 'Архів', '2025-10-02'),
  row('c', 'Гончар', 'Інспектор', 'Інспекція', '2026-01-15'),
]
const ids = values => values.map(row => row.id)

test('all four registry columns sort Ukrainian text / validated ISO dates in both directions without mutating data', () => {
  const before = structuredClone(rows)
  for (const [key, ascending] of [['fullName', ['c', 'b', 'a']], ['position', ['a', 'c', 'b']], ['department', ['b', 'c', 'a']], ['hireDate', ['b', 'c', 'a']]]) {
    assert.deepEqual(ids(sortEmployees(rows, { key, direction: 'asc' })), ascending)
    assert.deepEqual(ids(sortEmployees(rows, { key, direction: 'desc' })), [...ascending].reverse())
  }
  assert.deepEqual(rows, before)
  const tie = [{ ...rows[0], id: 'z' }, { ...rows[0], id: 'x' }, { ...rows[0], id: 'y' }]
  assert.deepEqual(ids(sortEmployees(tie, { key: 'position', direction: 'asc' })), ['x', 'y', 'z'])
  const badDate = { ...rows[0], id: 'bad', hireDate: '02.01.2026' }
  assert.equal(sortEmployees([rows[1], badDate], { key: 'hireDate', direction: 'asc' })[0].id, 'bad')
  assert.deepEqual(nextSort({ key: 'fullName', direction: 'desc' }, 'position'), { key: 'position', direction: 'asc' })
  assert.deepEqual(nextSort({ key: 'position', direction: 'asc' }, 'position'), { key: 'position', direction: 'desc' })
})

test('shared name/position/department filters intersect across groups; empty groups and counts remain distinct', () => {
  const people = [...rows, row('s', 'И\u0306осипенко', 'Інспектор', 'Інспекція', '2026-01-01', 'staff')]
  let state = { ...initialRegistry(), query: ' ПРИКЛАДОВИЧ  УМОВНИЙ ', departmentId: 'Інспекція', positionId: 'Інспектор' }
  let groups = employeeGroups(people, state)
  assert.deepEqual(ids(groups.official), ['c'])
  assert.deepEqual(ids(groups.staff), ['s'])
  assert.deepEqual(employeeCounts(people), { total: 4, official: 3, staff: 1 })
  state = { ...state, query: 'ЙОСИПЕНКО умовний' }
  groups = employeeGroups(people, state)
  assert.deepEqual(groups.official, [])
  assert.deepEqual(ids(groups.staff), ['s'])
  assert.deepEqual(filterEmployees(people, { ...state, positionId: 'Юрист' }), [])
  assert.deepEqual(employeeCounts([]), { total: 0, official: 0, staff: 0 })
  assert.equal(registryOptions(people, 'position', 'obsolete').at(-1).value, 'obsolete')
})

test('independent sort/filter panel state survives modals, mutations, group transfers, clearing and resetting', () => {
  let state = workspaceReducer(initialWorkspace, { type: 'registry', registry: { query: 'умовний', filtersOpen: true } })
  state = workspaceReducer(state, { type: 'sort', employeeType: 'official', key: 'position' })
  state = workspaceReducer(state, { type: 'sort', employeeType: 'official', key: 'position' })
  state = workspaceReducer(state, { type: 'sort', employeeType: 'staff', key: 'department' })
  const registry = state.registry
  let people = [...rows, row('s', 'Андрійчук', 'Секретар', 'Архів', '2026-01-01', 'staff')]
  assert.deepEqual(ids(employeeGroups(people, registry).official), ['b', 'c', 'a'])
  const changed = { ...rows[0], employeeType: 'staff' }
  state = workspaceReducer(state, { type: 'card', id: changed.id })
  state = workspaceReducer(state, { type: 'form', form: { kind: 'edit', employee: changed } })
  state = workspaceReducer(state, { type: 'saved', employee: changed, created: false })
  assert.equal(state.registry, registry)
  people = mergeEmployee(people, changed)
  assert.deepEqual(employeeCounts(people), { total: 4, official: 2, staff: 2 })
  assert.equal(employeeGroups(people, registry).official.some(row => row.id === 'a'), false)
  assert.deepEqual(ids(employeeGroups(people, registry).staff), ['s', 'a'])
  state = workspaceReducer(state, { type: 'clearFilters' })
  assert.equal(state.registry.filtersOpen, true)
  assert.equal(state.registry.query, '')
  assert.deepEqual(state.registry.sorts, registry.sorts)
  state = workspaceReducer(state, { type: 'resetSort' })
  assert.deepEqual(state.registry.sorts, initialRegistry().sorts)
  assert.equal(state.registry.filtersOpen, true)
})
