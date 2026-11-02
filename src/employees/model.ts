import type { Assignment, CreateEmployee, EmployeeCard, EmployeeDetails, EmployeeType } from '../../shared/personnel'
import type { IpcErrorCode } from '../../shared/ipc'

export const employeeTypeLabels: Record<EmployeeType, string> = {
  official: 'Посадова особа місцевого самоврядування', staff: 'Інший персонал',
}
export const fullName = (person: Pick<EmployeeDetails, 'lastName' | 'firstName' | 'middleName'>) =>
  [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ')
export const normalizeText = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk')
const collator = new Intl.Collator('uk', { sensitivity: 'base' })
export function selectEmployees(employees: EmployeeCard[], query: string, departmentId: string, descending: boolean) {
  const terms = normalizeText(query).split(' ').filter(Boolean)
  return employees.filter(employee => (!departmentId || employee.currentAssignment.departmentId === departmentId) &&
    terms.every(term => normalizeText(fullName(employee)).includes(term)))
    .sort((a, b) => (collator.compare(fullName(a), fullName(b)) || a.id.localeCompare(b.id)) * (descending ? -1 : 1))
}
export function displayDate(value: string | null) {
  return value ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : 'Не зазначено'
}
export function historyRows(history: Assignment[]) {
  const ordered = [...history].sort((a, b) => a.startDate.localeCompare(b.startDate))
  return ordered.map((assignment, index) => {
    const next = ordered[index + 1]
    let endDate: string | null = null
    if (next) {
      const date = new Date(`${next.startDate}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - 1)
      endDate = date.toISOString().slice(0, 10)
    }
    return { ...assignment, endDate }
  }).reverse()
}
export interface FormValues {
  lastName: string; firstName: string; middleName: string; birthDate: string
  employeeType: EmployeeType; note: string; startDate: string
  departmentId: string; positionId: string; category: string
}
export const emptyValues: FormValues = {
  lastName: '', firstName: '', middleName: '', birthDate: '', employeeType: 'official', note: '',
  startDate: '', departmentId: '', positionId: '', category: '',
}
export function valuesForEmployee(employee: EmployeeCard): FormValues {
  return { lastName: employee.lastName, firstName: employee.firstName, employeeType: employee.employeeType,
    middleName: employee.middleName ?? '', birthDate: employee.birthDate ?? '', note: employee.note ?? '',
    startDate: employee.hireDate, departmentId: employee.currentAssignment.departmentId,
    positionId: employee.currentAssignment.positionId, category: employee.currentAssignment.category ?? '' }
}
const optional = (value: string) => value.trim() || null
export function personalDetails(values: FormValues): EmployeeDetails {
  return { lastName: values.lastName.trim(), firstName: values.firstName.trim(), middleName: optional(values.middleName),
    birthDate: optional(values.birthDate), employeeType: values.employeeType, note: optional(values.note) }
}
export function creationInput(values: FormValues): CreateEmployee {
  return { ...personalDetails(values), startDate: values.startDate, departmentId: values.departmentId,
    positionId: values.positionId, category: optional(values.category) }
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
export type FormErrors = Partial<Record<keyof FormValues, string>>
export function validateEmployee(values: FormValues, editing: boolean): FormErrors {
  const errors: FormErrors = {}
  for (const key of ['lastName', 'firstName'] as const) if (!values[key].trim()) errors[key] = 'Заповніть це поле.'
  for (const key of ['lastName', 'firstName', 'middleName', 'category'] as const) {
    if ((!editing || key !== 'category') && values[key].trim().length > 200) errors[key] = 'Не більше 200 символів.'
  }
  if (values.note.trim().length > 4000) errors.note = 'Не більше 4000 символів.'
  if (!['official', 'staff'].includes(values.employeeType)) errors.employeeType = 'Виберіть тип працівника.'
  if (values.birthDate && !validDate(values.birthDate)) errors.birthDate = 'Введіть коректну календарну дату.'
  if (!editing) {
    if (!validDate(values.startDate)) errors.startDate = 'Введіть коректну дату прийняття.'
    if (!values.departmentId) errors.departmentId = 'Виберіть підрозділ.'
    if (!values.positionId) errors.positionId = 'Виберіть посаду.'
  }
  if (validDate(values.birthDate) && validDate(values.startDate) && values.birthDate > values.startDate) {
    errors.birthDate = 'Дата народження не може бути пізнішою за дату прийняття.'
  }
  return errors
}
export function dictionaryName(value: string) { return value.normalize('NFC').trim().replace(/\s+/gu, ' ') }
export function personnelMessage(code: IpcErrorCode): string {
  switch (code) {
    case 'BUSY': return 'Зараз триває інша операція зі сховищем. Зачекайте й повторіть спробу.'
    case 'CONFLICT': return 'Виник конфлікт даних. Перевірте відомості та повторіть спробу.'
    case 'NOT_FOUND': return 'Запис більше не знайдено. Поверніться до реєстру та оновіть дані.'
    case 'INVALID_ARGUMENTS': return 'Перевірте обов’язкові поля, довжину тексту та календарні дати.'
    case 'STORAGE_UNAVAILABLE': return 'Локальне сховище зараз недоступне. Спробуйте ще раз після його відновлення.'
    default: return 'Не вдалося виконати операцію. Перевірте доступність застосунку та повторіть спробу.'
  }
}
