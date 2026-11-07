import test from 'node:test'
import assert from 'node:assert/strict'
import { dateInputError, daysInMonth, formatDate, formatDateInput, formatDateTime, isIsoCalendarDate, parseDateInput } from '../src/lib/dates.ts'
import { calendarDate, mondayIndex, monthGrid, shiftDays, shiftMonths } from '../src/lib/calendar.ts'
import { cancelCloseConfirmation, confirmModalClose, finishCloseConfirmation, getCloseConfirmation, subscribeCloseConfirmation } from '../src/components/closeConfirmation.ts'
import { employeeDetails } from '../dist-electron/electron/personnel/schemas.js'
import { employeeInput, emptyValues, validateEmployee } from '../src/employees/model.ts'

test('AID date boundary presents only DD.MM.YYYY and preserves ISO calendar dates', () => {
  for (const iso of ['0001-01-01', '1600-02-29', '2000-02-29', '2026-11-03', '9999-12-31']) {
    const display = formatDateInput(iso)
    assert.match(display, /^\d{2}\.\d{2}\.\d{4}$/)
    assert.equal(parseDateInput(display), iso)
    assert.equal(formatDate(iso), display)
    assert.equal(isIsoCalendarDate(iso), true)
  }
  assert.equal(parseDateInput(' 03.11.2026 '), '2026-11-03')
  assert.equal(formatDate(null), '–')
  assert.equal(formatDate(undefined), '–')
  assert.equal(formatDateInput(''), '')
  assert.equal(parseDateInput('2026-11-03'), null)
  assert.equal(formatDate('2026-11-03T23:59:00Z'), '03.11.2026')
})

test('invalid, non-leap and out-of-range years cannot cross the UI date boundary', () => {
  for (const display of ['29.02.1900', '29.02.2100', '29.02.2026', '31.04.2026', '00.01.2026', '01.00.2026', '01.13.2026', '01.01.0000', '01.01.10000', '1.1.2026', 'bad']) {
    assert.equal(parseDateInput(display), null, display)
    assert.notEqual(dateInputError(display), '')
  }
  for (const iso of ['0000-01-01', '10000-01-01', '1900-02-29', '2026-02-30', '2026-1-01', 'bad']) {
    assert.equal(isIsoCalendarDate(iso), false)
    assert.equal(formatDateInput(iso), '')
    assert.equal(formatDate(iso), '–')
  }
  assert.equal(daysInMonth(1900, 2), 28)
  assert.equal(daysInMonth(2000, 2), 29)
  assert.equal(daysInMonth(2400, 2), 29)
})

test('required/min/max validation cannot silently accept a stale ISO behind an invalid draft', () => {
  assert.equal(dateInputError('', false), '')
  assert.notEqual(dateInputError('', true), '')
  assert.notEqual(dateInputError('31.02.2026'), '')
  assert.notEqual(dateInputError('01.01.2026', true, '2026-02-01', '2026-03-01'), '')
  assert.match(dateInputError('01.01.2026', true, '2026-02-01', '2026-03-01'), /01\.02\.2026.*01\.03\.2026/)
  for (const display of ['01.02.2026', '01.03.2026']) assert.equal(dateInputError(display, true, '2026-02-01', '2026-03-01'), '')
  assert.notEqual(dateInputError('01.02.2026', true, '2026-03-01', '2026-02-01'), '')
})

test('calendar day/month movement clamps years 1..9999 and preserves leap/month edges', () => {
  assert.equal(shiftDays('0001-01-01', -1), '0001-01-01')
  assert.equal(shiftDays('9999-12-31', 1), '9999-12-31')
  assert.equal(shiftDays('2024-03-01', -1), '2024-02-29')
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftMonths('0001-01-01', -1), '0001-01-01')
  assert.equal(shiftMonths('9999-12-31', 1), '9999-12-31')
  assert.equal(shiftMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(shiftMonths('2024-02-29', 12), '2025-02-28')
  assert.equal(calendarDate(1, 1, 1), '0001-01-01')
  assert.equal(mondayIndex('2026-11-02'), 0)
  assert.equal(mondayIndex('2026-11-01'), 6)
})

test('six-week month grids stay Monday-first and never render year 0/10000', () => {
  for (const year of [1, 4, 100, 400, 1900, 2000, 2024, 2026, 9999]) for (const month of [1, 2, 3, 12]) {
    const grid = monthGrid(year, month)
    assert.equal(grid.length, 6)
    for (const week of grid) {
      assert.equal(week.length, 7)
      for (const [column, iso] of week.entries()) if (iso) {
        assert.equal(isIsoCalendarDate(iso), true, iso)
        assert.equal(mondayIndex(iso), column)
      }
    }
    const inMonth = grid.flat().filter(iso => iso.slice(0, 7) === calendarDate(year, month, 1).slice(0, 7))
    assert.equal(inMonth.length, daysInMonth(year, month))
  }
})

test('backup timestamp presentation is fixed Ukrainian local date/time without seconds', () => {
  assert.equal(formatDateTime(null), '–')
  assert.equal(formatDateTime('bad'), '–')
  const stamp = '2026-11-03T12:05:47Z'
  const local = new Date(stamp)
  const pad = value => String(value).padStart(2, '0')
  assert.equal(formatDateTime(stamp), `${pad(local.getDate())}.${pad(local.getMonth() + 1)}.${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())}`)
})

test('formatted UI fields roundtrip into the employee IPC schema', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const fields = { ...emptyValues, firstName: 'Умовний', lastName: 'Тестовий', birthDate: parseDateInput('29.02.2000'), hireDate: parseDateInput('03.11.2026'), departmentId: id, positionId: id }
  assert.deepEqual(validateEmployee(fields), {})
  const value = employeeDetails.parse(employeeInput(fields))
  assert.equal(value.birthDate, '2000-02-29')
  assert.equal(value.hireDate, '2026-11-03')
  assert.equal(employeeDetails.safeParse({ ...value, hireDate: '03.11.2026' }).success, false)
})

test('source close-confirmation store preserves one pending request, cancellation and disconnected owners', () => {
  let closed = 0, updates = 0
  const unsubscribe = subscribeCloseConfirmation(() => updates++)
  const owner = { isConnected: true }
  confirmModalClose(false, () => closed++, owner)
  assert.equal(closed, 1)
  confirmModalClose(true, () => closed++, owner)
  const request = getCloseConfirmation()
  confirmModalClose(true, () => { closed += 10 }, owner)
  assert.equal(getCloseConfirmation(), request)
  finishCloseConfirmation(request, false)
  assert.equal(closed, 1)
  confirmModalClose(true, () => closed++, owner)
  finishCloseConfirmation(getCloseConfirmation(), true)
  assert.equal(closed, 2)
  confirmModalClose(true, () => closed++, owner)
  owner.isConnected = false
  finishCloseConfirmation(getCloseConfirmation(), true)
  assert.equal(closed, 2)
  confirmModalClose(true, () => closed++, owner)
  cancelCloseConfirmation(owner)
  assert.equal(getCloseConfirmation(), null)
  assert.equal(closed, 2)
  assert.ok(updates >= 6)
  unsubscribe()
})
