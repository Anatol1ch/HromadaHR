import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeStructure, filterEmployees, initialRegistry, nextSort, registryOptions, sortEmployees, withDirectoryNames } from '../src/employees/registry.ts'
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

const directory = values => values.map(name => ({ id: name, name }))
const directories = {
  department: directory(['Юридичний', 'Інспекція', 'Порожній', 'Архів']),
  position: directory(['Юрист', 'Секретар', 'Інспектор', 'Бухгалтер']),
}

test('shared name, position, department and type filters intersect and count only matching rows', () => {
  const people = [...rows, row('s', 'И\u0306осипенко', 'Інспектор', 'Інспекція', '2026-01-01', 'staff')]
  let state = { ...initialRegistry(), query: ' ПРИКЛАДОВИЧ  УМОВНИЙ ', departmentId: 'Інспекція', positionId: 'Інспектор' }
  let groups = employeeStructure(filterEmployees(people, state), directories)
  assert.equal(groups.length, 1)
  assert.deepEqual(ids(groups[0].rows), ['c', 's'])
  assert.deepEqual(groups[0].rows.map(row => row.employeeType), ['official', 'staff'])
  state = { ...state, query: 'ЙОСИПЕНКО умовний', employeeType: 'staff' }
  groups = employeeStructure(filterEmployees(people, state), directories)
  assert.deepEqual(ids(groups[0].rows), ['s'])
  assert.deepEqual(filterEmployees(people, { ...state, positionId: 'Юрист' }), [])
  assert.deepEqual(employeeStructure([], directories), [])
  assert.equal(registryOptions(directories.position, 'position', 'obsolete').at(-1).value, 'obsolete')
})

test('the flat sort and selected mode survive modals, group transfers and filter clearing', () => {
  assert.equal(initialWorkspace.registry.mode, 'structure')
  let state = workspaceReducer(initialWorkspace, { type: 'registry', registry: { mode: 'list', query: 'умовний', filtersOpen: true, employeeType: 'official' } })
  state = workspaceReducer(state, { type: 'sort', key: 'position' })
  state = workspaceReducer(state, { type: 'sort', key: 'position' })
  const registry = state.registry
  assert.deepEqual(ids(sortEmployees(filterEmployees(rows, registry), registry.sort)), ['b', 'c', 'a'])
  const changed = { ...rows[0], employeeType: 'staff', departmentId: 'Архів', positionId: 'Секретар' }
  state = workspaceReducer(state, { type: 'card', id: changed.id })
  state = workspaceReducer(state, { type: 'form', form: { kind: 'edit', employee: changed } })
  state = workspaceReducer(state, { type: 'saved', employee: changed, created: false })
  assert.equal(state.registry, registry)
  const people = mergeEmployee(rows, changed)
  assert.equal(filterEmployees(people, registry).some(row => row.id === 'a'), false)
  const groups = employeeStructure(people, directories)
  assert.deepEqual(groups.map(group => group.id), ['Інспекція', 'Архів'])
  assert.deepEqual(ids(groups[1].rows), ['b', 'a'])
  assert.deepEqual(employeeStructure(people.filter(row => row.id !== 'c'), directories).map(group => group.id), ['Архів'])
  state = workspaceReducer(state, { type: 'clearFilters' })
  assert.equal(state.registry.filtersOpen, true)
  assert.equal(state.registry.query, '')
  assert.equal(state.registry.employeeType, '')
  assert.equal(state.registry.mode, 'list')
  assert.deepEqual(state.registry.sort, registry.sort)
  state = workspaceReducer(state, { type: 'registry', registry: { mode: 'structure' } })
  assert.deepEqual(employeeStructure(people, directories), groups)
  state = workspaceReducer(state, { type: 'registry', registry: { mode: 'list' } })
  assert.deepEqual(state.registry.sort, registry.sort)
  state = workspaceReducer(state, { type: 'resetSort' })
  assert.deepEqual(state.registry.sort, initialRegistry().sort)
  assert.equal(state.registry.filtersOpen, true)
})

test('directory ranks control groups and jobs, with Ukrainian names and stable IDs as tie breakers', () => {
  const people = [...rows, { ...rows[0], id: '0' },
    row('d', 'Андрійчук', 'Бухгалтер', 'Юридичний', '2026-01-01'),
    row('e', 'Ярош', 'Юрист', 'Юридичний', '2026-01-01')]
  const before = structuredClone(people)
  const groups = employeeStructure(people, directories)
  assert.deepEqual(groups.map(group => group.id), ['Юридичний', 'Інспекція', 'Архів'])
  assert.deepEqual(ids(groups[0].rows), ['e', 'd', '0', 'a'])
  assert.deepEqual(people, before)
  const reversed = { department: [...directories.department].reverse(), position: [...directories.position].reverse() }
  const refreshed = employeeStructure(people, reversed)
  assert.deepEqual(refreshed.map(group => group.id), ['Архів', 'Інспекція', 'Юридичний'])
  assert.deepEqual(ids(refreshed.at(-1).rows), ['d', '0', 'a', 'e'])
  assert.equal(employeeStructure(people, { ...directories, position: [] }), null)
  const renamed = withDirectoryNames(people, { ...directories, department: [{ id: 'Юридичний', name: 'Нова назва' }] })
  assert.equal(renamed[0].department.name, 'Нова назва')
  assert.deepEqual(registryOptions(reversed.position, 'position', '').slice(1).map(option => option.value), reversed.position.map(entry => entry.id))
})
