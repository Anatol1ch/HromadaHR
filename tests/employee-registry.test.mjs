import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeCounts, employeeGroups, filterEmployees, initialRegistry, nextSort, registryOptions, sortEmployees } from '../src/employees/registry.ts'
import { categoryForAssignment } from '../src/employees/assignmentPolicy.ts'
import { assignmentInput } from '../src/employees/model.ts'
import { initialWorkspace, mergeEmployee, workspaceReducer } from '../src/employees/workspace.ts'
import { assignmentInput as assignmentSchema } from '../dist-electron/electron/personnel/schemas.js'
import { PersonnelService } from '../dist-electron/electron/personnel/service.js'
import { openStorageSafely } from '../dist-electron/electron/storage/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

function row(id, lastName, position, department, hireDate, employeeType = 'official') {
  return { id, lastName, firstName: 'Умовний', middleName: 'Прикладович', birthDate: null, employeeType, hireDate,
    currentAssignment: { id: 'assignment-' + id, employeeId: id, positionId: position, departmentId: department, category: null, startDate: hireDate,
      position: { id: position, name: position }, department: { id: department, name: department } } }
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

test('category policy preserves exact corrections, uses state at the historical date, and clears only for another position', () => {
  const history = [
    { id: 'first', positionId: 'p1', departmentId: 'd1', startDate: '2024-01-01', category: 'Стара довільна' },
    { id: 'middle', positionId: 'p1', departmentId: 'd2', startDate: '2025-01-01', category: 'V' },
    { id: 'last', positionId: 'p2', departmentId: 'd2', startDate: '2026-01-01', category: 'І категорія' },
  ]
  const before = structuredClone(history)
  assert.equal(categoryForAssignment('p1', '2024-06-01', history), 'Стара довільна')
  assert.equal(categoryForAssignment('p1', '2025-06-01', history), 'V')
  assert.equal(categoryForAssignment('p1', '2026-02-01', history), null)
  assert.equal(categoryForAssignment('p2', '2025-06-01', history), null)
  assert.equal(categoryForAssignment('p1', '2023-01-01', history), 'Стара довільна')
  assert.equal(categoryForAssignment('p3', '2027-01-01', history, history[0]), 'Стара довільна')
  assert.equal(categoryForAssignment('p1', '2026-01-01', []), null)
  assert.deepEqual(history, before)
})

test('UI policy cannot fabricate category-only transitions and preserves a historical category on correction in Main', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hromadahr-category-policy-'))
  const storage = await openStorageSafely(join(root, 'test.db'))
  t.after(() => { storage.close(); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('hromadahr-category-policy-')); rmSync(root, { recursive: true, force: true }) })
  const api = new PersonnelService({ getDatabase: () => storage.database }, () => false, () => '2026-11-03')
  const department = api.createDepartment({ name: 'Умовний відділ' })
  const position = api.createPosition({ name: 'Умовна посада' })
  const employee = api.createEmployee({ lastName: 'Синтетичний', firstName: 'Приклад', middleName: null, birthDate: null, employeeType: 'official',
    departmentId: department.id, positionId: position.id, startDate: '2025-01-01', category: 'Історична' })
  const history = api.getHistory(employee.id)
  const values = { departmentId: department.id, positionId: position.id, startDate: '2026-01-01' }
  const unchanged = assignmentInput(values, categoryForAssignment(values.positionId, values.startDate, history))
  assert.equal(assignmentSchema.safeParse(unchanged).success, true)
  assert.equal(assignmentSchema.safeParse({ ...unchanged, category: 'X'.repeat(201) }).success, false)
  assert.throws(() => api.createAssignment(employee.id, unchanged), error => error.code === 'NO_ASSIGNMENT_CHANGE')
  assert.deepEqual(api.getHistory(employee.id), history)
  const correction = assignmentInput({ ...values, startDate: '2024-01-01' }, categoryForAssignment(position.id, '2024-01-01', history, history[0]))
  assert.equal(api.updateAssignment(history[0].id, correction).currentAssignment.category, 'Історична')
  const other = api.createPosition({ name: 'Інша посада' })
  const changed = { ...values, positionId: other.id }
  const saved = api.createAssignment(employee.id, assignmentInput(changed, categoryForAssignment(other.id, changed.startDate, api.getHistory(employee.id))))
  assert.equal(saved.currentAssignment.category, null)
  assert.equal(api.getHistory(employee.id)[0].category, 'Історична')
  assert.deepEqual(storage.database.pragma('foreign_key_check'), [])
  assert.equal(storage.database.pragma('integrity_check', { simple: true }), 'ok')
})
