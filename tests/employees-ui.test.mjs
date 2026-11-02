import test from 'node:test'
import assert from 'node:assert/strict'
import { creationInput, dictionaryName, fullName, historyRows, personalDetails, selectEmployees,
  validateEmployee, validDate, valuesForEmployee, emptyValues } from '../src/employees/model.ts'
import { createEmployee, employeeDetails, departmentInput } from '../dist-electron/electron/personnel/schemas.js'

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const values = { ...emptyValues, lastName: 'Тестовий', firstName: 'Умовний', startDate: '2026-01-01', departmentId: ids[0], positionId: ids[1] }
function card(id, lastName, departmentId = ids[0], middleName = null) {
  return { id, lastName, firstName: 'Умовне', middleName, birthDate: null, employeeType: 'official', note: null, hireDate: '2026-01-01',
    currentAssignment: { id: ids[2], employeeId: id, positionId: ids[1], departmentId, category: null, startDate: '2026-01-01',
      position: { id: ids[1], name: 'Тестова посада' }, department: { id: departmentId, name: 'Тестовий підрозділ' } } }
}

test('employee search handles Ukrainian case, canonical Unicode, name combinations and department intersection', () => {
  const employees = [card('b', 'Ятест', ids[1], 'Тестович'), card('a', 'Йтест'), card('c', 'Атест')]
  assert.deepEqual(selectEmployees(employees, '  УМОВНЕ   И\u0306ТЕСТ ', '', false).map(e => e.id), ['a'])
  assert.deepEqual(selectEmployees(employees, 'ТЕСТОВИЧ ятест', '', false).map(e => e.id), ['b'])
  assert.deepEqual(selectEmployees(employees, 'умовне', ids[1], false).map(e => e.id), ['b'])
  assert.deepEqual(selectEmployees(employees, 'Йтест', ids[1], false), [])
  assert.deepEqual(selectEmployees(employees, 'неіснуючий', '', false), [])
  assert.equal(fullName(employees[1]), 'Йтест Умовне')
})

test('Ukrainian name sorting is reversible and never mutates the IPC list', () => {
  const employees = [card('c', 'Ятест'), card('b', 'Йтест'), card('a', 'Атест')]
  assert.deepEqual(selectEmployees(employees, '', '', false).map(e => e.id), ['a', 'b', 'c'])
  assert.deepEqual(selectEmployees(employees, '', '', true).map(e => e.id), ['c', 'b', 'a'])
  assert.deepEqual(employees.map(e => e.id), ['c', 'b', 'a'])
})

test('history presentation derives inclusive previous ends across leap days/year boundaries without mutation', () => {
  const history = [
    { id: 'new', startDate: '2025-01-01' }, { id: 'old', startDate: '2024-02-01' }, { id: 'middle', startDate: '2024-03-01' },
  ]
  const copy = structuredClone(history)
  assert.deepEqual(historyRows(history).map(row => [row.id, row.endDate]), [['new', null], ['middle', '2024-12-31'], ['old', '2024-02-29']])
  assert.deepEqual(history, copy)
  assert.deepEqual(historyRows([]), [])
})

test('client validation and Main Zod agree on required fields, calendar dates and trimmed text limits', () => {
  for (const change of [{}, { middleName: ' ' }, { birthDate: '2000-02-29' }, { note: ' '.repeat(10) },
    { lastName: 'Т'.repeat(200) }, { note: 'Н'.repeat(4000) }, { category: 'К'.repeat(200) },
    { lastName: ' ' }, { firstName: '' }, { lastName: 'Т'.repeat(201) }, { middleName: 'Т'.repeat(201) },
    { note: 'Н'.repeat(4001) }, { category: 'К'.repeat(201) }, { employeeType: 'other' },
    { birthDate: '1900-02-29' }, { birthDate: '2027-01-01' }, { startDate: '2026-02-30' },
    { startDate: '0000-01-01' }, { startDate: '2026-1-01' }, { startDate: '' }, { departmentId: '' }, { positionId: '' }]) {
    const input = { ...values, ...change }
    const clientValid = Object.keys(validateEmployee(input, false)).length === 0
    assert.equal(clientValid, createEmployee.safeParse(creationInput(input)).success, JSON.stringify(change))
  }
  for (const value of ['2024-02-29', '0001-01-01', '9999-12-31']) assert.equal(validDate(value), true)
  for (const value of ['2023-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '10000-01-01', 'bad']) assert.equal(validDate(value), false)
})

test('edit payload contains only supported personal fields and roundtrips nullable form values', () => {
  const employee = card(ids[2], 'Тестовий')
  const initial = valuesForEmployee(employee)
  const changed = { ...initial, note: ' Оновлено ', startDate: '2030-01-01', category: 'Категорія', departmentId: ids[1] }
  assert.deepEqual(Object.keys(personalDetails(changed)).sort(), ['birthDate', 'employeeType', 'firstName', 'lastName', 'middleName', 'note'])
  assert.equal(employeeDetails.safeParse(personalDetails(changed)).success, true)
  assert.equal(personalDetails(changed).middleName, null)
  assert.equal(personalDetails(changed).note, 'Оновлено')
  assert.deepEqual(personalDetails(initial), { lastName: 'Тестовий', firstName: 'Умовне', middleName: null, birthDate: null, employeeType: 'official', note: null })
  assert.ok(validateEmployee({ ...initial, birthDate: '2027-01-01' }, true).birthDate)
})

test('quick dictionary creation normalizes the same name and length as Main', () => {
  for (const name of ['  ВІДДІЛ\t КАДРІВ\u00a0', 'И\u0306ОГО', ' ', 'Т'.repeat(200), 'Т'.repeat(201)]) {
    const normalized = dictionaryName(name)
    assert.equal(normalized.length > 0 && normalized.length <= 200, departmentInput.safeParse({ name }).success)
    if (normalized.length > 0 && normalized.length <= 200) assert.equal(normalized, departmentInput.parse({ name }).name)
  }
})
