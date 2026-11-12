import { formatDate, isIsoCalendarDate, todayIsoDate } from '../lib/dates.ts'
import { positionCategories, type PositionCategory } from '../../shared/personnel.ts'
import type { EmployeeCard, EmployeeDetails, EmployeeType } from '../../shared/personnel'
import type { IpcErrorCode } from '../../shared/ipc'

export const employeeTypeLabels: Record<EmployeeType, string> = {
  official: 'Посадова особа місцевого самоврядування', staff: 'Інший персонал',
}
export const fullName = (person: Pick<EmployeeDetails, 'lastName' | 'firstName' | 'middleName'>) =>
  [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ')
export const normalizeText = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk')
export function displayDate(value: string | null) {
  return formatDate(value)
}
export interface FormValues {
  lastName: string; firstName: string; middleName: string; birthDate: string
  employeeType: EmployeeType; hireDate: string
  positionStartedOn: string; positionCategory: PositionCategory | ''
  departmentId: string; positionId: string
}
export const emptyValues: FormValues = {
  lastName: '', firstName: '', middleName: '', birthDate: '', employeeType: 'official',
  positionStartedOn: '', positionCategory: '', hireDate: '', departmentId: '', positionId: '',
}
export function valuesForEmployee(employee: EmployeeCard): FormValues {
  return { lastName: employee.lastName, firstName: employee.firstName, employeeType: employee.employeeType,
    middleName: employee.middleName ?? '', birthDate: employee.birthDate ?? '',
    positionStartedOn: employee.positionStartedOn ?? '', positionCategory: employee.positionCategory ?? '', hireDate: employee.hireDate, departmentId: employee.departmentId,
    positionId: employee.positionId }
}
const optional = (value: string) => value.trim() || null
export function employeeInput(values: FormValues): EmployeeDetails {
  return { lastName: values.lastName.trim(), firstName: values.firstName.trim(), middleName: optional(values.middleName),
    birthDate: optional(values.birthDate), employeeType: values.employeeType,
    positionStartedOn: optional(values.positionStartedOn), positionCategory: values.positionCategory || null, hireDate: values.hireDate, departmentId: values.departmentId, positionId: values.positionId }
}
export const validDate = isIsoCalendarDate
export type FormErrors = Partial<Record<keyof FormValues, string>>
export function validateEmployee(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  for (const key of ['lastName', 'firstName'] as const) if (!values[key].trim()) errors[key] = 'Заповніть це поле.'
  for (const key of ['lastName', 'firstName', 'middleName'] as const) {
    if (values[key].trim().length > 200) errors[key] = 'Не більше 200 символів.'
  }
  if (!['official', 'staff'].includes(values.employeeType)) errors.employeeType = 'Виберіть тип працівника.'
  if (values.birthDate && !validDate(values.birthDate)) errors.birthDate = 'Введіть коректну календарну дату.'
  if (!validDate(values.hireDate)) errors.hireDate = 'Введіть коректну дату прийняття.'
  if (values.positionStartedOn && (!validDate(values.positionStartedOn) || values.positionStartedOn > todayIsoDate() || values.positionStartedOn < values.hireDate)) errors.positionStartedOn = 'Вкажіть коректну дату між прийняттям і сьогодні.'
  if (values.positionCategory && (!positionCategories.some(c=>c===values.positionCategory) || values.employeeType !== 'official')) errors.positionCategory = 'Категорія I–VII доступна лише посадовим особам ОМС.'
  if (!values.departmentId) errors.departmentId = 'Виберіть підрозділ.'
  if (!values.positionId) errors.positionId = 'Виберіть посаду.'
  if (validDate(values.birthDate) && validDate(values.hireDate) && values.birthDate > values.hireDate) {
    errors.birthDate = 'Дата народження не може бути пізнішою за дату прийняття.'
  }
  return errors
}
export function dictionaryName(value: string) { return value.normalize('NFC').trim().replace(/\s+/gu, ' ') }
export function personnelMessage(code: IpcErrorCode): string {
  switch (code) {
    case 'LEAVE_DOCUMENT_REQUISITES_LOCKED': return 'Номер і дата розпорядження захищені зв’язком із кадровим документом. Спочатку явно розірвіть зв’язок у картці документа.'
    case 'EMPLOYEE_HAS_DOCUMENTS': return 'Працівник пов’язаний із кадровими документами. Спочатку перевірте й явно врегулюйте ці зв’язки в реєстрі документів.'
    case 'APPOINTMENT_REVIEW_REQUIRED': return 'Посаду або підрозділ змінено. Перевірте й явно підтвердьте нову дату призначення та категорію або залиште їх невідомими.'
    case 'RANK_REQUIRES_OFFICIAL': return 'Ранг можна зберегти лише для посадової особи місцевого самоврядування.'
    case 'EMPLOYEE_HAS_CURRENT_RANK': return 'Спочатку явно очистіть поточний ранг на вкладці «Ранги» особової картки, потім змініть тип працівника.'
    case 'SPECIAL_YEAR_CONFLICT': return 'За цей рік уже зареєстровано відпустку такого виду. Виправте або скасуйте помилковий запис.'
    case 'SPECIAL_DURATION': return 'Перевищено тривалість спеціального виду або немає пояснення меншої тривалості.'
    case 'GRANT_BASIS_REQUIRED': return 'Для подієвої відпустки зазначте документальну підставу надання.'
    case 'STALE_REVISION': return 'Запис уже змінено. Чернетку збережено. Закрийте форму й відкрийте актуальну відпустку.'
    case 'LEAVE_CANCELLED': return 'Реєстрацію скасовано. Її звичайне редагування недоступне.'
    case 'INVALID_PERIOD': return 'Обраний період починається після завершення відпустки. Змініть розподіл.'

    case 'INSUFFICIENT_DAYS': return 'Недостатньо днів для цієї відпустки. Перевірте залишки або змініть розподіл.'
    case 'LEAVE_OVERLAP': return 'На вибрані дати вже зареєстровано іншу відпустку цього працівника.'
    case 'PERIOD_IN_USE': return 'Період пов’язаний із зареєстрованими або скасованими відпустками. Вилучення заблоковано. Підтверджені дні можна виправити до величини не нижчої за чинне використання.'
    case 'TRANSITION_LEAVE': return 'Відпустка з початком до 01.01.2027 потребує окремої перевірки початкових залишків.'

    case 'HIRE_DATE_HAS_LEAVE_PERIODS': return 'Дату прийняття не можна змінити, поки є підтверджені періоди відпусток.'
    case 'DICTIONARY_STALE': return 'Довідник уже змінився. Перевірте актуальні дані.'
    case 'DICTIONARY_IN_USE': return 'Запис використовується у кадрових відомостях. Його можна перейменувати.'
    case 'BUSY': return 'Зараз триває інша операція зі сховищем. Зачекайте й повторіть спробу.'
    case 'CONFLICT': return 'Виник конфлікт даних. Перевірте відомості та повторіть спробу.'
    case 'NOT_FOUND': return 'Запис більше не знайдено. Поверніться до реєстру та оновіть дані.'
    case 'INVALID_ARGUMENTS': return 'Перевірте обов’язкові поля, довжину тексту та календарні дати.'
    case 'STORAGE_UNAVAILABLE': return 'Локальне сховище зараз недоступне. Спробуйте ще раз після його відновлення.'
    default: return 'Не вдалося виконати операцію. Перевірте доступність застосунку та повторіть спробу.'
  }
}

export function changeAppointment(values: FormValues, key: 'positionId'|'departmentId', value: string): FormValues {
 return values[key] === value ? values : { ...values,[key]:value,positionStartedOn:'',positionCategory:'' }
}
