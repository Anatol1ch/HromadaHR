import { z } from 'zod'
import { todayIsoDate } from '../../src/lib/dates.js'
import { positionCategories } from '../../shared/personnel.js'

export const id = z.string().uuid()
export const text = z.string().trim().min(1).max(200)
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z')
  return value.slice(0, 4) !== '0000' && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
})
const details = {
  lastName: text, firstName: text, middleName: text.nullable(),
  birthDate: calendarDate.nullable(), employeeType: z.enum(['official', 'staff']),
  positionStartedOn: calendarDate.nullable(), positionCategory: z.enum(positionCategories).nullable(),
  hireDate: calendarDate, positionId: id, departmentId: id,
}
export const employeeDetails = z.strictObject(details)
  .refine(value => value.positionStartedOn === null || value.positionStartedOn <= todayIsoDate())
  .refine(value => (value.positionStartedOn === null || value.positionStartedOn >= value.hireDate) &&
    (value.employeeType === 'official' || value.positionCategory === null))
  .refine(value => value.birthDate === null || value.birthDate <= value.hireDate)
// SQLite NOCASE is ASCII-only. Persist a Unicode key for database-enforced uniqueness.
export function normalizeName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}
export function nameKey(value: string) {
  return normalizeName(value).toUpperCase().toLowerCase().normalize('NFC')
}
export const dictionaryName = z.string().transform(normalizeName).pipe(text)
export const dictionaryKind = z.enum(['department', 'position'])
export const revision = z.number().int().nonnegative()
export const dictionaryIds = z.array(id).refine(ids => new Set(ids).size === ids.length)
export const dictionarySnapshot = z.strictObject({
  revision,
  entries: z.array(z.strictObject({ id, name: text, revision, employeeCount: revision })),
})
export const departmentInput = z.strictObject({ name: dictionaryName })
export const positionInput = z.strictObject({ name: dictionaryName })
export const department = z.strictObject({ id, name: text })
export const position = z.strictObject({ id, name: text })
export const employeeCard = z.strictObject({ id, ...details, position, department })
  .refine(value => (value.positionStartedOn === null || value.positionStartedOn >= value.hireDate) &&
    (value.employeeType === 'official' || value.positionCategory === null))
  .refine(value => (value.birthDate === null || value.birthDate <= value.hireDate) &&
    value.positionId === value.position.id && value.departmentId === value.department.id)
