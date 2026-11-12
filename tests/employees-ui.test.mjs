import { employeeStructure, filterEmployees } from '../src/employees/registry.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeInput, dictionaryName, fullName,
  validateEmployee, validDate, valuesForEmployee, emptyValues } from '../src/employees/model.ts'
import { employeeDetails, departmentInput } from '../dist-electron/electron/personnel/schemas.js'

const selectEmployees = (rows, query, departmentId) => filterEmployees(rows, { query, departmentId, positionId: '', employeeType: '' })
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const values = { ...emptyValues, lastName: 'Тестовий', firstName: 'Умовний', hireDate: '2026-01-01', departmentId: ids[0], positionId: ids[1] }
function card(id, lastName, departmentId = ids[0], middleName = null) {
  return { id, lastName, firstName: 'Умовне', middleName, birthDate: null, employeeType: 'official', positionStartedOn: null, positionCategory: null, hireDate: '2026-01-01',
    positionId: ids[1], departmentId,
    position: { id: ids[1], name: 'Тестова посада' }, department: { id: departmentId, name: 'Тестовий підрозділ' } }
}

test('employee search handles Ukrainian case, canonical Unicode, name combinations and department intersection', () => {
  const employees = [card('b', 'Ятест', ids[1], 'Тестович'), card('a', 'Йтест'), card('c', 'Атест')]
  assert.deepEqual(selectEmployees(employees, '  УМОВНЕ   И\u0306ТЕСТ ', '').map(e => e.id), ['a'])
  assert.deepEqual(selectEmployees(employees, 'ТЕСТОВИЧ ятест', '').map(e => e.id), ['b'])
  assert.deepEqual(selectEmployees(employees, 'умовне', ids[1]).map(e => e.id), ['b'])
  assert.deepEqual(selectEmployees(employees, 'Йтест', ids[1]), [])
  assert.deepEqual(selectEmployees(employees, 'неіснуючий', ''), [])
  assert.equal(fullName(employees[1]), 'Йтест Умовне')
})

test('Ukrainian name sorting within a position never mutates the IPC list', () => {
  const employees = [card('c', 'Ятест'), card('b', 'Йтест'), card('a', 'Атест')]
  const [group] = employeeStructure(employees, { department: [employees[0].department], position: [employees[0].position] })
  assert.deepEqual(group.rows.map(e => e.id), ['a', 'b', 'c'])
  assert.deepEqual(employees.map(e => e.id), ['c', 'b', 'a'])
})

test('client validation and Main Zod agree on required fields, calendar dates and trimmed text limits', () => {
  for (const change of [{}, { middleName: ' ' }, { birthDate: '2000-02-29' },
    { lastName: 'Т'.repeat(200) },
    { lastName: ' ' }, { firstName: '' }, { lastName: 'Т'.repeat(201) }, { middleName: 'Т'.repeat(201) },
    { employeeType: 'other' },
    { birthDate: '1900-02-29' }, { birthDate: '2027-01-01' }, { hireDate: '2026-02-30' },
    { hireDate: '0000-01-01' }, { hireDate: '2026-1-01' }, { hireDate: '' }, { departmentId: '' }, { positionId: '' }]) {
    const input = { ...values, ...change }
    const clientValid = Object.keys(validateEmployee(input)).length === 0
    assert.equal(clientValid, employeeDetails.safeParse(employeeInput(input)).success, JSON.stringify(change))
  }
  for (const value of ['2024-02-29', '0001-01-01', '9999-12-31']) assert.equal(validDate(value), true)
  for (const value of ['2023-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '10000-01-01', 'bad']) assert.equal(validDate(value), false)
})

test('edit payload roundtrips current references, hire date and nullable fields', () => {
  const initial = valuesForEmployee(card(ids[2], 'Тестовий'))
  const changed = { ...initial, hireDate: '2030-01-01', departmentId: ids[1] }
  assert.deepEqual(employeeDetails.parse(employeeInput(changed)), {
    lastName: 'Тестовий', firstName: 'Умовне', middleName: null, birthDate: null, employeeType: 'official',
    positionStartedOn: null, positionCategory: null, hireDate: '2030-01-01', departmentId: ids[1], positionId: ids[1],
  })
  assert.ok(validateEmployee({ ...initial, birthDate: '2027-01-01' }).birthDate)
})

test('quick dictionary creation normalizes the same name and length as Main', () => {
  for (const name of ['  ВІДДІЛ\t КАДРІВ\u00a0', 'И\u0306ОГО', ' ', 'Т'.repeat(200), 'Т'.repeat(201)]) {
    const normalized = dictionaryName(name)
    assert.equal(normalized.length > 0 && normalized.length <= 200, departmentInput.safeParse({ name }).success)
    if (normalized.length > 0 && normalized.length <= 200) assert.equal(normalized, departmentInput.parse({ name }).name)
  }
})
