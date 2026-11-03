import { z } from 'zod'

export const id = z.string().uuid()
export const text = z.string().trim().min(1).max(200)
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z')
  return value.slice(0, 4) !== '0000' && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
})
const details = {
  lastName: text, firstName: text, middleName: text.nullable(),
  birthDate: calendarDate.nullable(), employeeType: z.enum(['official', 'staff']),
}
export const employeeDetails = z.strictObject(details)
export const createEmployee = z.strictObject({
  ...details, positionId: id, departmentId: id, category: text.nullable(), startDate: calendarDate,
}).refine(value => value.birthDate === null || value.birthDate <= value.startDate)
// SQLite NOCASE is ASCII-only. Persist a Unicode key for database-enforced uniqueness.
export function normalizeName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}
export function nameKey(value: string) {
  return normalizeName(value).toUpperCase().toLowerCase().normalize('NFC')
}
const dictionaryName = z.string().transform(normalizeName).pipe(text)
export const departmentInput = z.strictObject({ name: dictionaryName })
export const positionInput = z.strictObject({ name: dictionaryName })
export const department = z.strictObject({ id, name: text })
export const position = z.strictObject({ id, name: text })
export const assignmentInput = z.strictObject({
  departmentId: id, positionId: id, category: text.nullable(), startDate: calendarDate,
})
export const assignment = z.strictObject({
  id, employeeId: id, positionId: id, departmentId: id, category: text.nullable(), startDate: calendarDate,
})
export const employeeCard = z.strictObject({
  id, ...details, hireDate: calendarDate,
  currentAssignment: z.strictObject({ ...assignment.shape, position, department }),
}).refine(value => (value.birthDate === null || value.birthDate <= value.hireDate) &&
  value.hireDate <= value.currentAssignment.startDate && value.currentAssignment.employeeId === value.id &&
  value.currentAssignment.positionId === value.currentAssignment.position.id &&
  value.currentAssignment.departmentId === value.currentAssignment.department.id)
