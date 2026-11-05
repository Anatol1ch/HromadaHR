import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { ConfirmedLeavePeriod, LeaveErrorCode, LeavePeriodInput, LeaveType, ProposedLeavePeriod } from '../../shared/leave.js'
import * as schemas from './schemas.js'
import { accountingBasisForPeriod, isCanonicalPeriod, proposedPeriods } from './periods.js'

export class LeaveError extends Error {
  constructor(readonly code: LeaveErrorCode) { super(code) }
}

type LeaveRow = { id: string; employeeId: string; leaveType: LeaveType; periodStart: string; periodEnd: string;
  accountingBasis: 'initial_balance' | 'confirmed_entitlement'; confirmedDays: number; referenceEntitlementDays: number | null }

function toPeriod(row: LeaveRow): ConfirmedLeavePeriod { return { ...row, status: 'confirmed' } }

// Main-only. Resolve the live connection on every operation, including after restore.
export class LeaveService {
  constructor(private readonly storage: Pick<Storage, 'getDatabase'>, private readonly isBusy: () => boolean) {}

  private run<T>(operation: (db: Database.Database) => T): T {
    if (this.isBusy()) throw new LeaveError('BUSY')
    let db: Database.Database
    try { db = this.storage.getDatabase() } catch { throw new LeaveError('STORAGE_UNAVAILABLE') }
    try { return operation(db) } catch (error) {
      if (error instanceof LeaveError) throw error
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code.startsWith('SQLITE_CONSTRAINT')) throw new LeaveError('CONFLICT')
      if (/^SQLITE_(BUSY|LOCKED)/.test(code)) throw new LeaveError('BUSY')
      throw error
    }
  }

  private parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new LeaveError('INVALID_ARGUMENTS')
    return parsed.data
  }

  private employee(db: Database.Database, employeeId: string) {
    const row = db.prepare<[string], { id: string; hireDate: string }>(
      'SELECT id, hire_date AS hireDate FROM employees WHERE id=?').get(employeeId)
    if (!row) throw new LeaveError('NOT_FOUND')
    return row
  }

  listPeriods = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => {
      this.employee(db, employeeId)
      return db.prepare<[string], LeaveRow>(`SELECT id, employee_id AS employeeId, leave_type AS leaveType,
        period_start AS periodStart, period_end AS periodEnd, accounting_basis AS accountingBasis,
        confirmed_days AS confirmedDays, reference_entitlement_days AS referenceEntitlementDays
        FROM leave_period_balances WHERE employee_id=? ORDER BY period_start, leave_type, id`).all(employeeId).map(toPeriod)
    })
  }

  proposePeriods = (employeeId: string, throughDate: string, leaveType: LeaveType): ProposedLeavePeriod[] => {
    this.parse(schemas.id, employeeId)
    const date = this.parse(schemas.calendarDate, throughDate)
    const type = this.parse(schemas.leaveType, leaveType)
    return this.run(db => {
      const employee = this.employee(db, employeeId)
      if (Number(date.slice(0, 4)) - Number(employee.hireDate.slice(0, 4)) > 199) throw new LeaveError('INVALID_ARGUMENTS')
      return proposedPeriods(type, employee.hireDate, date)
    })
  }

  savePeriods = (employeeId: string, input: LeavePeriodInput[]) => {
    this.parse(schemas.id, employeeId)
    const periods = this.parse(schemas.periodsInput, input)
    return this.run(db => db.transaction(() => {
      const employee = this.employee(db, employeeId)
      const identities = new Set<string>()
      for (const period of periods) {
        const identity = `${period.leaveType}\n${period.periodStart}`
        if (identities.has(identity)) throw new LeaveError('INVALID_ARGUMENTS')
        identities.add(identity)
        if (period.periodStart > period.periodEnd || !isCanonicalPeriod(period.leaveType, employee.hireDate,
          period.periodStart, period.periodEnd) || period.accountingBasis !== accountingBasisForPeriod(period.periodStart)) {
          throw new LeaveError('INVALID_ARGUMENTS')
        }
      }
      const save = db.prepare(`INSERT INTO leave_period_balances (id, employee_id, leave_type, period_start, period_end,
        accounting_basis, confirmed_days, reference_entitlement_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, leave_type, period_start) DO UPDATE SET period_end=excluded.period_end,
        accounting_basis=excluded.accounting_basis, confirmed_days=excluded.confirmed_days,
        reference_entitlement_days=excluded.reference_entitlement_days`)
      const read = db.prepare<[string, LeaveType, string], LeaveRow>(`SELECT id, employee_id AS employeeId,
        leave_type AS leaveType, period_start AS periodStart, period_end AS periodEnd,
        accounting_basis AS accountingBasis, confirmed_days AS confirmedDays,
        reference_entitlement_days AS referenceEntitlementDays
        FROM leave_period_balances WHERE employee_id=? AND leave_type=? AND period_start=?`)
      const saved: ConfirmedLeavePeriod[] = []
      for (const period of periods) {
        save.run(randomUUID(), employeeId, period.leaveType, period.periodStart, period.periodEnd,
          period.accountingBasis, period.confirmedDays, period.referenceEntitlementDays)
        const row = read.get(employeeId, period.leaveType, period.periodStart)
        if (!row) throw new LeaveError('CONFLICT')
        saved.push(toPeriod(row))
      }
      return saved
    }).immediate())
  }

  deletePeriod = (periodId: string) => {
    this.parse(schemas.id, periodId)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('DELETE FROM leave_period_balances WHERE id=?').run(periodId).changes) throw new LeaveError('NOT_FOUND')
      return null
    }).immediate())
  }
}
