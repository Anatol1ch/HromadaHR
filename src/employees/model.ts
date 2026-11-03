import { formatDate, isIsoCalendarDate, todayIsoDate } from '../lib/dates.ts'
import { shiftDays } from '../lib/calendar.ts'
import type { Assignment, AssignmentInput, CreateEmployee, EmployeeCard, EmployeeDetails, EmployeeType } from '../../shared/personnel'
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
  return formatDate(value)
}
export function historyRows(history: Assignment[]) {
  const ordered = [...history].sort((a, b) => a.startDate.localeCompare(b.startDate))
  return ordered.map((assignment, index) => {
    const next = ordered[index + 1]
    let endDate: string | null = null
    if (next && validDate(next.startDate) && validDate(assignment.startDate) && next.startDate > '0001-01-01' && next.startDate > assignment.startDate) {
      endDate = shiftDays(next.startDate, -1)
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
export const validDate = isIsoCalendarDate
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
    case 'FUTURE_ASSIGNMENT': return 'Майбутні кадрові зміни заборонені. Якщо така дата вже є в історії, відкрийте відповідний запис і виправте її явно.'
    case 'DUPLICATE_ASSIGNMENT_DATE': return 'На цю дату вже є призначення. Виберіть іншу дату або виправте наявний запис.'
    case 'NO_ASSIGNMENT_CHANGE': return 'Сусідні призначення не можуть мати однакові посаду, підрозділ і категорію. Перевірте попередній та наступний записи.'
    case 'ASSIGNMENT_BEFORE_BIRTH': return 'Призначення не може починатися раніше дати народження працівника.'
    case 'LAST_ASSIGNMENT': return 'Єдиний запис історії видалити не можна. Для повного видалення працівника є окрема дія.'
    case 'BUSY': return 'Зараз триває інша операція зі сховищем. Зачекайте й повторіть спробу.'
    case 'CONFLICT': return 'Виник конфлікт даних. Перевірте відомості та повторіть спробу.'
    case 'NOT_FOUND': return 'Запис більше не знайдено. Поверніться до реєстру та оновіть дані.'
    case 'INVALID_ARGUMENTS': return 'Перевірте обов’язкові поля, довжину тексту та календарні дати.'
    case 'STORAGE_UNAVAILABLE': return 'Локальне сховище зараз недоступне. Спробуйте ще раз після його відновлення.'
    default: return 'Не вдалося виконати операцію. Перевірте доступність застосунку та повторіть спробу.'
  }
}

export type AssignmentValues = Omit<AssignmentInput, 'category'> & { category: string }
export const localToday = todayIsoDate
export function validateAssignment(values: AssignmentValues, birthDate: string | null, today: string): FormErrors {
  const errors: FormErrors = {}
  if (!validDate(values.startDate)) errors.startDate = 'Введіть коректну календарну дату.'
  else if (values.startDate > today) errors.startDate = 'Майбутні кадрові зміни заборонені. Виправте дату.'
  else if (birthDate && values.startDate < birthDate) errors.startDate = 'Дата не може бути ранішою за дату народження.'
  if (!values.departmentId) errors.departmentId = 'Виберіть підрозділ.'
  if (!values.positionId) errors.positionId = 'Виберіть посаду.'
  if (values.category.trim().length > 200) errors.category = 'Не більше 200 символів.'
  return errors
}
