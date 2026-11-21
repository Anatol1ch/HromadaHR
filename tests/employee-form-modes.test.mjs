import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeErrorsForMode, employeeValuesForMode } from '../src/employees/model.ts'

const original = {
  lastName: 'Іваненко', firstName: 'Іван', middleName: '', birthDate: '1980-01-02', employeeType: 'official',
  hireDate: '2010-03-04', positionStartedOn: '2012-05-06', positionCategory: 'III', departmentId: 'dept-old', positionId: 'position-old',
}
const draft = {
  ...original,
  lastName: 'Петренко', firstName: 'Петро', middleName: 'Іванович', birthDate: '1985-07-08', employeeType: 'staff',
  hireDate: '2015-09-10', positionStartedOn: '', positionCategory: '', departmentId: 'dept-new', positionId: 'position-new',
}

test('employee form modes merge only their section and preserve hidden employee fields', () => {
  const personal = employeeValuesForMode(original, draft, 'personal')
  assert.equal(personal.lastName, draft.lastName)
  assert.equal(personal.employeeType, draft.employeeType)
  assert.equal(personal.hireDate, original.hireDate)
  assert.equal(personal.positionStartedOn, original.positionStartedOn)
  assert.equal(personal.positionCategory, original.positionCategory)
  assert.equal(personal.departmentId, original.departmentId)
  assert.equal(personal.positionId, original.positionId)

  const employment = employeeValuesForMode(original, draft, 'employment')
  assert.equal(employment.lastName, original.lastName)
  assert.equal(employment.birthDate, original.birthDate)
  assert.equal(employment.employeeType, original.employeeType)
  assert.equal(employment.hireDate, draft.hireDate)
  assert.equal(employment.positionCategory, draft.positionCategory)
  assert.equal(employment.departmentId, draft.departmentId)

  assert.deepEqual(employeeValuesForMode(original, draft, 'all'), draft)
})

test('employee form modes expose validation errors only for visible fields', () => {
  const errors = { firstName: 'personal', hireDate: 'employment', positionId: 'employment' }
  assert.deepEqual(employeeErrorsForMode(errors, 'personal'), { firstName: 'personal' })
  assert.deepEqual(employeeErrorsForMode(errors, 'employment'), { hireDate: 'employment', positionId: 'employment' })
  assert.equal(employeeErrorsForMode(errors, 'all'), errors)
})
