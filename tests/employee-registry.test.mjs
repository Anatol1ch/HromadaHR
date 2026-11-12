import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeStructure, employeeSummary, filterEmployees, initialRegistry, registryOptions, withDirectoryNames } from '../src/employees/registry.ts'
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

test('filters survive modals, group transfers and filter clearing', () => {
  let state = workspaceReducer(initialWorkspace, { type: 'registry', registry: { query: 'умовний', filtersOpen: true, employeeType: 'official' } })
  const registry = state.registry
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
  assert.deepEqual(employeeStructure(filterEmployees(people, state.registry), directories), groups)
})

test('summary reflects the same filtered rows after creation, a type change and deletion', () => {
  const filter = { ...initialRegistry(), departmentId: 'Архів' }
  const summarize = people => employeeSummary(filterEmployees(people, filter))
  assert.deepEqual(summarize(rows), { total: 1, officials: 1, staff: 0 })
  const newEmployee = row('new', 'Гнатюк', 'Юрист', 'Архів', '2026-06-01', 'staff')
  const created = mergeEmployee(rows, newEmployee)
  assert.deepEqual(summarize(created), { total: 2, officials: 1, staff: 1 })
  const edited = mergeEmployee(created, { ...newEmployee, employeeType: 'official' })
  assert.deepEqual(summarize(edited), { total: 2, officials: 2, staff: 0 })
  assert.deepEqual(summarize(edited.filter(row => row.id !== 'new' && row.id !== 'b')), { total: 0, officials: 0, staff: 0 })
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
