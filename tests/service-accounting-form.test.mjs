import test from 'node:test'
import assert from 'node:assert/strict'
import { createServiceAccountingDrafts, serviceAccountingDraftInput } from '../src/components/seniority-ranks/service-accounting-form.ts'

const id1 = '00000000-0000-4000-8000-000000000001'
const id2 = '00000000-0000-4000-8000-000000000002'

test('new editor defaults to continuous service and retains distinct per-mode draft data', () => {
  const created = createServiceAccountingDrafts(null, '2026-11-19', () => id1)
  assert.equal(created.mode, 'continuous')
  assert.deepEqual(created.drafts.continuous, { startDate: '', startDraft: '' })
  assert.deepEqual(created.drafts.periods, [{ id: id1, startDate: '', startDraft: '', endDate: '', endDraft: '', current: false }])
  assert.deepEqual(created.drafts.snapshot, { years: '0', months: '0', days: '0', asOfDate: '19.11.2026', asOfDateIso: '2026-11-19' })
})

test('editor initializes each persisted mode from its original source facts and stable period IDs', () => {
  const continuous = createServiceAccountingDrafts({ mode: 'continuous', startDate: '2010-02-03', confirmedAt: '2026-11-19T10:00:00.000Z' }, '2026-11-19', () => id2)
  assert.equal(continuous.mode, 'continuous')
  assert.deepEqual(continuous.drafts.continuous, { startDate: '2010-02-03', startDraft: '03.02.2010' })
  const snapshot = createServiceAccountingDrafts({ mode: 'snapshot', years: 0, months: 0, days: 0, asOfDate: '2024-02-29', confirmedAt: '2026-11-19T10:00:00.000Z' }, '2026-11-19', () => id2)
  assert.deepEqual(snapshot.drafts.snapshot, { years: '0', months: '0', days: '0', asOfDate: '29.02.2024', asOfDateIso: '2024-02-29' })
  const periods = createServiceAccountingDrafts({ mode: 'periods', periods: [
    { id: id1, startDate: '2010-01-01', endDate: '2012-12-31' },
    { id: id2, startDate: '2015-03-04', endDate: null },
  ], confirmedAt: '2026-11-19T10:00:00.000Z' }, '2026-11-19', () => 'unused')
  assert.equal(periods.mode, 'periods')
  assert.deepEqual(periods.drafts.periods, [
    { id: id1, startDate: '2010-01-01', startDraft: '01.01.2010', endDate: '2012-12-31', endDraft: '31.12.2012', current: false },
    { id: id2, startDate: '2015-03-04', startDraft: '04.03.2015', endDate: '', endDraft: '', current: true },
  ])
})

test('continuous draft submits only a validated calendar date and blocks future or partial text', () => {
  const drafts = createServiceAccountingDrafts(null, '2026-11-19', () => id1).drafts
  assert.equal(serviceAccountingDraftInput('continuous', { ...drafts, continuous: { startDate: '', startDraft: '31.02.2020' } }, '2026-11-19').input, undefined)
  assert.equal(serviceAccountingDraftInput('continuous', { ...drafts, continuous: { startDate: '2020-01-01', startDraft: '31.02.2020' } }, '2026-11-19').input, undefined)
  assert.deepEqual(serviceAccountingDraftInput('continuous', { ...drafts, continuous: { startDate: '2026-11-20', startDraft: '20.11.2026' } }, '2026-11-19').errors.startDate, 'Дата не може бути пізнішою за сьогодні.')
  assert.deepEqual(serviceAccountingDraftInput('continuous', { ...drafts, continuous: { startDate: '2020-01-02', startDraft: '02.01.2020' } }, '2026-11-19').input, { mode: 'continuous', startDate: '2020-01-02' })
})

test('period draft validates incomplete, intersecting, unordered, multiple-open and future entries', () => {
  const base = createServiceAccountingDrafts(null, '2026-11-19', () => id1).drafts
  const row = (id, startDraft, endDraft, current = false) => ({ id, startDate: '', startDraft, endDate: '', endDraft, current })
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [] }, '2026-11-19').errors.form)
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [row(id1, '01.01.2020', '')] }, '2026-11-19').errors.periods[id1].endDate)
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [row(id1, '01.01.2020', '31.01.2020'), row(id2, '31.01.2020', '10.02.2020')] }, '2026-11-19').errors.periods[id2].startDate)
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [row(id1, '01.01.2020', '31.01.2020'), row(id2, '15.01.2020', '10.02.2020')] }, '2026-11-19').errors.periods[id2].startDate)
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [row(id1, '01.01.2020', '', true), row(id2, '01.03.2020', '', true)] }, '2026-11-19').errors.form)
  assert.ok(serviceAccountingDraftInput('periods', { ...base, periods: [row(id1, '20.11.2026', '', true)] }, '2026-11-19').errors.periods[id1].startDate)
})

test('period draft preserves stable IDs and sends open periods as null endDate', () => {
  const base = createServiceAccountingDrafts(null, '2026-11-19', () => id1).drafts
  const periods = [
    { id: id1, startDate: '2010-01-01', startDraft: '01.01.2010', endDate: '2012-12-31', endDraft: '31.12.2012', current: false },
    { id: id2, startDate: '2015-03-04', startDraft: '04.03.2015', endDate: '', endDraft: '', current: true },
  ]
  assert.deepEqual(serviceAccountingDraftInput('periods', { ...base, periods }, '2026-11-19').input, { mode: 'periods', periods: [
    { id: id1, startDate: '2010-01-01', endDate: '2012-12-31' },
    { id: id2, startDate: '2015-03-04', endDate: null },
  ] })
})

test('snapshot permits explicit zero and rejects invalid numeric values or dates', () => {
  const base = createServiceAccountingDrafts(null, '2026-11-19', () => id1).drafts
  assert.deepEqual(serviceAccountingDraftInput('snapshot', base, '2026-11-19').input, { mode: 'snapshot', years: 0, months: 0, days: 0, asOfDate: '2026-11-19' })
  const invalid = { ...base, snapshot: { ...base.snapshot, months: '12', asOfDate: '31.02.2020' } }
  const result = serviceAccountingDraftInput('snapshot', invalid, '2026-11-19')
  assert.equal(result.input, undefined)
  assert.ok(result.errors.snapshot.months)
  assert.ok(result.errors.snapshot.asOfDate)
})
