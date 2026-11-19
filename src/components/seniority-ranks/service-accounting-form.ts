import type { ServiceAccounting, ServiceAccountingInput, ServicePeriod } from '../../../shared/seniority-ranks.ts'
import { formatDateInput, parseDateInput, todayIsoDate } from '../../lib/dates.ts'
import { snapshotErrors, snapshotInput, type SnapshotDraft } from './service-accounting-model.ts'

export type ServiceAccountingMode = ServiceAccountingInput['mode']
export function canSaveServiceAccounting({ busy, loading, dirty, input, previewReady }: {
  busy: boolean
  loading: boolean
  dirty: boolean
  input: boolean
  previewReady: boolean
}) {
  return !busy && !loading && dirty && input && previewReady
}

export type ServicePeriodDraft = { id: string; startDate: string; startDraft: string; endDate: string; endDraft: string; current: boolean }
export type ServiceAccountingDrafts = {
  continuous: { startDate: string; startDraft: string }
  periods: ServicePeriodDraft[]
  snapshot: SnapshotDraft & { asOfDateIso: string }
}
export type ServiceAccountingDraftErrors = {
  startDate?: string
  periods: Record<string, { startDate?: string; endDate?: string }>
  snapshot: Partial<Record<keyof SnapshotDraft, string>>
  form?: string
}
export type ServiceAccountingDraftResult = { input?: ServiceAccountingInput; errors: ServiceAccountingDraftErrors }

const emptyPeriod = (id: string): ServicePeriodDraft => ({ id, startDate: '', startDraft: '', endDate: '', endDraft: '', current: false })

export function createServiceAccountingDrafts(value: ServiceAccounting | null, today = todayIsoDate(), createId: () => string = () => crypto.randomUUID()): { mode: ServiceAccountingMode; drafts: ServiceAccountingDrafts } {
  const drafts: ServiceAccountingDrafts = {
    continuous: { startDate: '', startDraft: '' },
    periods: [emptyPeriod(createId())],
    snapshot: { years: '0', months: '0', days: '0', asOfDate: formatDateInput(today), asOfDateIso: today },
  }
  if (!value) return { mode: 'continuous', drafts }
  if (value.mode === 'continuous') {
    drafts.continuous = { startDate: value.startDate, startDraft: formatDateInput(value.startDate) }
    return { mode: value.mode, drafts }
  }
  if (value.mode === 'snapshot') {
    drafts.snapshot = { years: String(value.years), months: String(value.months), days: String(value.days), asOfDate: formatDateInput(value.asOfDate), asOfDateIso: value.asOfDate }
    return { mode: value.mode, drafts }
  }
  drafts.periods = value.periods.map(period => ({
    id: period.id,
    startDate: period.startDate,
    startDraft: formatDateInput(period.startDate),
    endDate: period.endDate ?? '',
    endDraft: formatDateInput(period.endDate ?? ''),
    current: period.endDate === null,
  }))
  return { mode: value.mode, drafts }
}

export function serviceAccountingDraftInput(mode: ServiceAccountingMode, drafts: ServiceAccountingDrafts, today = todayIsoDate()): ServiceAccountingDraftResult {
  const errors: ServiceAccountingDraftErrors = { periods: {}, snapshot: {} }
  if (mode === 'continuous') {
    const date = parseDateInput(drafts.continuous.startDraft)
    if (!date) errors.startDate = 'Вкажіть коректну дату ДД.ММ.РРРР.'
    else if (date > today) errors.startDate = 'Дата не може бути пізнішою за сьогодні.'
    if (errors.startDate) return { errors }
    return { input: { mode, startDate: date! }, errors }
  }
  if (mode === 'snapshot') {
    errors.snapshot = snapshotErrors(drafts.snapshot, today)
    if (Object.keys(errors.snapshot).length) return { errors }
    try { return { input: snapshotInput(drafts.snapshot), errors } }
    catch { errors.form = 'Перевірте тривалість і дату стажу.'; return { errors } }
  }

  if (!drafts.periods.length) {
    errors.form = 'Додайте щонайменше один період служби.'
    return { errors }
  }
  let previousEnd: string | null = null
  let openCount = 0
  const periods: ServicePeriod[] = []
  for (const [index, row] of drafts.periods.entries()) {
    const startDate = parseDateInput(row.startDraft)
    if (!startDate) errors.periods[row.id] = { startDate: 'Вкажіть коректну дату початку.' }
    else if (startDate > today) errors.periods[row.id] = { startDate: 'Дата не може бути пізнішою за сьогодні.' }
    const endDate = row.current ? null : parseDateInput(row.endDraft)
    if (!row.current && !endDate) errors.periods[row.id] = { ...errors.periods[row.id], endDate: 'Вкажіть коректну дату завершення або позначте період поточним.' }
    else if (endDate && endDate > today) errors.periods[row.id] = { ...errors.periods[row.id], endDate: 'Дата не може бути пізнішою за сьогодні.' }
    if (startDate && endDate && endDate < startDate) errors.periods[row.id] = { ...errors.periods[row.id], endDate: 'Завершення не може передувати початку.' }
    if (!startDate || (!row.current && !endDate)) continue
    const through = endDate ?? today
    if (previousEnd !== null && startDate <= previousEnd) errors.periods[row.id] = { ...errors.periods[row.id], startDate: 'Періоди перетинаються або вказані не в хронологічному порядку.' }
    if (row.current) {
      openCount++
      if (index !== drafts.periods.length - 1) errors.periods[row.id] = { ...errors.periods[row.id], startDate: 'Поточний період має бути останнім у хронологічному порядку.' }
    }
    previousEnd = through
    periods.push({ id: row.id, startDate, endDate })
  }
  if (openCount > 1) errors.form = 'Може бути лише один поточний період служби.'
  if (Object.keys(errors.periods).length || errors.form || periods.length !== drafts.periods.length) return { errors }
  return { input: { mode, periods }, errors }
}

export function serviceAccountingReasonMessage(reason: string | null): string {
  switch (reason) {
    case 'overlap': return 'Періоди перетинаються. Скоригуйте дати, щоб кожен день був зарахований лише один раз.'
    case 'multiple_open_periods': return 'Залиште поточним лише один період служби.'
    case 'period_order': return 'Розташуйте періоди в хронологічному порядку, а поточний — останнім.'
    case 'before_baseline': return 'Дата розрахунку передує вихідним відомостям.'
    case 'overflow': return 'Сумарна тривалість виходить за межі допустимого діапазону.'
    case 'date_range': return 'Не вдалося визначити календарну дату розрахунку.'
    default: return 'Перевірте вихідні відомості стажу.'
  }
}
