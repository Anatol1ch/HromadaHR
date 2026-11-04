export function todayIsoDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match && isIsoCalendarDate(match[0]) ? `${match[3]}.${match[2]}.${match[1]}` : '—'
}

export function parseDateInput(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, dayText, monthText, yearText] = match
  const day = Number(dayText), month = Number(monthText), year = Number(yearText)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return `${yearText}-${monthText}-${dayText}`
}

export function formatDateInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ''
  const display = `${match[3]}.${match[2]}.${match[1]}`
  return parseDateInput(display) === value ? display : ''
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isIsoCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateInput(formatDateInput(value)) === value
}

/** Local timestamp presentation only; stored timestamps and filenames are untouched. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  const pad = (part: number) => String(part).padStart(2, '0')
  return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + String(date.getFullYear()).padStart(4, '0') + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}
/** Extracted from the source DatePicker for boundary tests and one error format. */
export function dateInputError(display: string, required = false, lower = '0001-01-01', upper = '9999-12-31'): string {
  if (!isIsoCalendarDate(lower) || !isIsoCalendarDate(upper) || lower > upper) return 'Некоректні межі календаря.'
  if (!display) return required ? 'Вкажіть дату.' : ''
  const iso = parseDateInput(display)
  if (!iso) return 'Введіть коректну дату у форматі ДД.ММ.РРРР.'
  if (iso < lower || iso > upper) return 'Оберіть дату від ' + formatDateInput(lower) + ' до ' + formatDateInput(upper) + '.'
  return ''
}
