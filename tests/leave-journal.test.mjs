import test from 'node:test'
import assert from 'node:assert/strict'
import { overlapsYear } from '../src/components/leave/presentation.ts'
test('a leave spanning New Year appears once in each matching year', () => {
  const records = [{ startDate: '2027-12-28', endDate: '2028-01-08' }]
  for (const year of ['', '2027', '2028']) assert.equal(records.filter(record => overlapsYear(record,year)).length,1)
  for (const year of ['2026','2029']) assert.equal(records.filter(record => overlapsYear(record,year)).length,0)
})
