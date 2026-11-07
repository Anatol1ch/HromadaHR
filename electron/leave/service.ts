import { calendarDays, fifoAllocation } from '../../shared/leave-calculations.js'
import type { LeaveRecord, LeaveRegistration, PeriodBalance } from '../../shared/leave.js'
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
      for (const period of periods) {
        const current = db.prepare<[string, string, string], { id: string; periodEnd: string; accountingBasis: string }>(
          'SELECT id, period_end AS periodEnd, accounting_basis AS accountingBasis FROM leave_period_balances WHERE employee_id=? AND leave_type=? AND period_start=?')
          .get(employeeId, period.leaveType, period.periodStart)
        if (current && db.prepare('SELECT 1 FROM leave_allocations WHERE period_id=? LIMIT 1').get(current.id)) {
          const used = this.balances(db, employeeId).find(row => row.id === current.id)!.usedDays
          if (period.confirmedDays < used || period.periodEnd !== current.periodEnd || period.accountingBasis !== current.accountingBasis) {
            throw new LeaveError('PERIOD_IN_USE')
          }
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
      if (db.prepare('SELECT 1 FROM leave_allocations WHERE period_id=? LIMIT 1').get(periodId)) throw new LeaveError('PERIOD_IN_USE')
      if (!db.prepare('DELETE FROM leave_period_balances WHERE id=?').run(periodId).changes) throw new LeaveError('NOT_FOUND')
      return null
    }).immediate())
  }

  private balances(db: Database.Database, employeeId: string): PeriodBalance[] {
    const rows = db.prepare<[string], LeaveRow & { usedDays: number }>(`SELECT p.id, p.employee_id AS employeeId,
      p.leave_type AS leaveType, p.period_start AS periodStart, p.period_end AS periodEnd,
      p.accounting_basis AS accountingBasis, p.confirmed_days AS confirmedDays,
      p.reference_entitlement_days AS referenceEntitlementDays,
      coalesce((SELECT sum(a.days) FROM leave_allocations a JOIN leave_records r ON r.id=a.record_id
        WHERE a.period_id=p.id AND r.status='active'),0) AS usedDays
      FROM leave_period_balances p WHERE p.employee_id=? ORDER BY p.period_start,p.id`).all(employeeId)
    return rows.map(row => ({ ...row, status: 'confirmed', availableDays: row.confirmedDays - row.usedDays }))
  }

  getBalances = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => {
      this.employee(db, employeeId)
      return this.balances(db, employeeId)
    })
  }

  proposeAllocation = (employeeId: string, leaveType: LeaveType, days: number) => {
    this.parse(schemas.id, employeeId)
    const type = this.parse(schemas.leaveType, leaveType)
    const duration = this.parse(schemas.registration.shape.usedDays, days)
    return this.run(db => {
      this.employee(db, employeeId)
      const balances = this.balances(db, employeeId).filter(period => period.leaveType === type)
      return { balances, ...fifoAllocation(balances, duration) }
    })
  }

  private records(db: Database.Database, employeeId: string | null): LeaveRecord[] {
    const rows = db.prepare<[string | null, string | null], Omit<LeaveRecord, 'allocations'>>(`SELECT id, employee_id AS employeeId,
      leave_type AS leaveType, start_date AS startDate, end_date AS endDate, used_days AS usedDays,
      order_number AS orderNumber, order_date AS orderDate, duration_explanation AS durationExplanation,
      status, created_at AS createdAt FROM leave_records WHERE (? IS NULL OR employee_id=?)
      ORDER BY start_date DESC,id`).all(employeeId, employeeId)
    const allocations = db.prepare<[string], { periodId: string; days: number }>(
      'SELECT period_id AS periodId, days FROM leave_allocations WHERE record_id=? ORDER BY period_id')
    return rows.map(row => ({ ...row, allocations: allocations.all(row.id) }))
  }

  listRecords = (employeeId: string | null) => {
    if (employeeId !== null) this.parse(schemas.id, employeeId)
    return this.run(db => {
      if (employeeId !== null) this.employee(db, employeeId)
      return this.records(db, employeeId)
    })
  }

  registerLeave = (input: LeaveRegistration): LeaveRecord => {
    const value = this.parse(schemas.registration, input)
    const canonical = { ...value, allocations: [...value.allocations].sort((a, b) => a.periodId.localeCompare(b.periodId)) }
    const requestJson = JSON.stringify(canonical)
    return this.run(db => db.transaction(() => {
      const existing = db.prepare<[string], { id: string; requestJson: string; employeeId: string }>(
        'SELECT id, request_json AS requestJson, employee_id AS employeeId FROM leave_records WHERE request_id=?').get(value.requestId)
      if (existing) {
        if (existing.requestJson !== requestJson) throw new LeaveError('CONFLICT')
        return this.records(db, existing.employeeId).find(record => record.id === existing.id)!
      }
      const employee = this.employee(db, value.employeeId)
      if (value.startDate < '2027-01-01') throw new LeaveError('TRANSITION_LEAVE')
      const length = calendarDays(value.startDate, value.endDate)
      if (value.startDate < employee.hireDate || length < 1 || value.usedDays > length ||
        (value.usedDays !== length && !value.durationExplanation)) throw new LeaveError('INVALID_ARGUMENTS')
      if (db.prepare(`SELECT 1 FROM leave_records WHERE employee_id=? AND status='active'
        AND start_date<=? AND end_date>=? LIMIT 1`).get(value.employeeId, value.endDate, value.startDate)) throw new LeaveError('LEAVE_OVERLAP')
      const balances = new Map(this.balances(db, value.employeeId).map(period => [period.id, period]))
      const allocated = new Set<string>()
      let total = 0
      for (const allocation of value.allocations) {
        if (allocated.has(allocation.periodId)) throw new LeaveError('INVALID_ARGUMENTS')
        allocated.add(allocation.periodId)
        const period = balances.get(allocation.periodId)
        if (!period || period.leaveType !== value.leaveType) throw new LeaveError('INVALID_ARGUMENTS')
        if (allocation.days > period.availableDays) throw new LeaveError('INSUFFICIENT_DAYS')
        total += allocation.days
      }
      if (total !== value.usedDays) throw new LeaveError('INVALID_ARGUMENTS')
      const id = randomUUID()
      db.prepare(`INSERT INTO leave_records(id,request_id,request_json,employee_id,leave_type,start_date,end_date,
        used_days,order_number,order_date,duration_explanation,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, value.requestId, requestJson, value.employeeId, value.leaveType, value.startDate, value.endDate,
          value.usedDays, value.orderNumber, value.orderDate, value.durationExplanation, new Date().toISOString())
      const insert = db.prepare('INSERT INTO leave_allocations(record_id,period_id,days) VALUES (?,?,?)')
      for (const allocation of value.allocations) insert.run(id, allocation.periodId, allocation.days)
      return this.records(db, value.employeeId).find(record => record.id === id)!
    }).immediate())
  }
}
