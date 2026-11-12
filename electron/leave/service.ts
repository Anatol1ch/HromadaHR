import { isPeriodLeave, specialLeaveLimit } from '../../shared/leave.js'
import { calendarDays, fifoAllocation } from '../../shared/leave-calculations.js'
import type { LeaveRecord, LeaveRegistration, LeaveUpdate, PeriodBalance, EmployeeLeaveRight, LeaveRightInput } from '../../shared/leave.js'
import { randomUUID } from 'node:crypto'
import { projectOmsServiceLeave } from '../../shared/service-leave-calculations.js'
import type { ServiceBaselineInput } from '../../shared/seniority-ranks.js'
import { todayIsoDate } from '../../src/lib/dates.js'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { ConfirmedLeavePeriod, LeaveErrorCode, LeavePeriodInput, PeriodLeaveType, ProposedLeavePeriod } from '../../shared/leave.js'
import * as schemas from './schemas.js'
import { accountingBasisForPeriod, isCanonicalPeriod, proposedPeriods, serviceLeaveProposals } from './periods.js'

export class LeaveError extends Error {
  constructor(readonly code: LeaveErrorCode) { super(code) }
}

type LeaveRow = { id: string; employeeId: string; leaveType: PeriodLeaveType; periodStart: string; periodEnd: string;
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

  private rights(db: Database.Database, employeeId: string): EmployeeLeaveRight[] {
    return db.prepare<[string], EmployeeLeaveRight>('SELECT employee_id AS employeeId,leave_type AS leaveType,status,checked_at AS checkedAt FROM employee_leave_rights WHERE employee_id=? ORDER BY leave_type').all(employeeId)
  }
  listRights = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => { this.employee(db,employeeId); return this.rights(db,employeeId) })
  }
  saveRights = (employeeId: string, input: LeaveRightInput[]) => {
    this.parse(schemas.id,employeeId)
    const values = this.parse(schemas.rightsInput,input)
    if (new Set(values.map(value => value.leaveType)).size !== values.length) throw new LeaveError('INVALID_ARGUMENTS')
    return this.run(db => db.transaction(() => {
      this.employee(db,employeeId)
      const stamp = new Date().toISOString()
      const save = db.prepare('INSERT INTO employee_leave_rights(employee_id,leave_type,status,checked_at) VALUES (?,?,?,?) ON CONFLICT(employee_id,leave_type) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at')
      for (const value of values) {
        if (value.status === null) db.prepare('DELETE FROM employee_leave_rights WHERE employee_id=? AND leave_type=?').run(employeeId,value.leaveType)
        else save.run(employeeId,value.leaveType,value.status,stamp)
      }
      return this.rights(db,employeeId)
    }).immediate())
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

  private serviceLeaveStart(db: Database.Database, employeeId: string) {
    return db.prepare<[string], { acquired_on: string }>('SELECT acquired_on FROM employee_service_leave_start WHERE employee_id=?')
      .get(employeeId)?.acquired_on ?? null
  }

  getServiceLeaveStart = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => { this.employee(db, employeeId); return this.serviceLeaveStart(db, employeeId) })
  }

  getOmsServiceLeaveProjection = (employeeId:string) => {
    this.parse(schemas.id,employeeId)
    // A deferred read transaction gives all SELECTs one snapshot, without a write lock or any DML.
    return this.run(db=>db.transaction(()=>{
      this.employee(db,employeeId)
      const type=db.prepare<[string],{employeeType:'official'|'staff'}>('SELECT employee_type AS employeeType FROM employees WHERE id=?').get(employeeId)!.employeeType
      const row=db.prepare<[string],Omit<ServiceBaselineInput,'autoAccrueAfterBaseline'>&{autoAccrueAfterBaseline:number}>(`SELECT years,months,days,as_of_date AS asOfDate,basis_note AS basisNote,auto_accrue_after_baseline AS autoAccrueAfterBaseline FROM employee_service_baselines WHERE employee_id=?`).get(employeeId)
      const periods=db.prepare<[string],LeaveRow>(`SELECT id,employee_id AS employeeId,leave_type AS leaveType,period_start AS periodStart,period_end AS periodEnd,accounting_basis AS accountingBasis,confirmed_days AS confirmedDays,reference_entitlement_days AS referenceEntitlementDays FROM leave_period_balances WHERE employee_id=? AND leave_type='oms_service_additional' ORDER BY period_start,id`).all(employeeId).map(toPeriod)
      return projectOmsServiceLeave(row?{...row,autoAccrueAfterBaseline:row.autoAccrueAfterBaseline===1}:null,todayIsoDate(),type,{
        acquiredOn:this.serviceLeaveStart(db,employeeId),rightStatus:this.rights(db,employeeId).find(r=>r.leaveType==='oms_service_additional')?.status??'unknown',periods,
      })
    }).deferred())
  }

  saveServiceLeaveStart = (employeeId: string, value: string | null) => {
    this.parse(schemas.id, employeeId)
    const date = this.parse(schemas.calendarDate.nullable(), value)
    return this.run(db => db.transaction(() => {
      this.employee(db, employeeId)
      if (date === null) db.prepare('DELETE FROM employee_service_leave_start WHERE employee_id=?').run(employeeId)
      else db.prepare(`INSERT INTO employee_service_leave_start VALUES (?,?)
        ON CONFLICT(employee_id) DO UPDATE SET acquired_on=excluded.acquired_on`).run(employeeId, date)
      return date
    }).immediate())
  }

  proposePeriods = (employeeId: string, throughDate: string, leaveType: PeriodLeaveType): ProposedLeavePeriod[] => {
    this.parse(schemas.id, employeeId)
    const date = this.parse(schemas.calendarDate, throughDate)
    const type = this.parse(schemas.periodLeaveType, leaveType)
    return this.run(db => {
      const employee = this.employee(db, employeeId)
      if (type === 'oms_service_additional') {
        const start = this.serviceLeaveStart(db, employeeId)
        if (!start) return []
        const existing = db.prepare<[string], { period_start: string; period_end: string }>(
          "SELECT period_start, period_end FROM leave_period_balances WHERE employee_id=? AND leave_type='oms_service_additional'").all(employeeId)
        return serviceLeaveProposals(start, date, existing.map(row => ({ periodStart: row.period_start, periodEnd: row.period_end })))
      }
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
      const read = db.prepare<[string, PeriodLeaveType, string], LeaveRow>(`SELECT id, employee_id AS employeeId,
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

  private balances(db: Database.Database, employeeId: string, excludeId: string | null = null): PeriodBalance[] {
    const rows = db.prepare<[string | null, string | null, string], LeaveRow & { usedDays: number }>(`SELECT p.id, p.employee_id AS employeeId,
      p.leave_type AS leaveType, p.period_start AS periodStart, p.period_end AS periodEnd,
      p.accounting_basis AS accountingBasis, p.confirmed_days AS confirmedDays,
      p.reference_entitlement_days AS referenceEntitlementDays,
      coalesce((SELECT sum(a.days) FROM leave_allocations a JOIN leave_records r ON r.id=a.record_id
        WHERE a.period_id=p.id AND r.status='active' AND (? IS NULL OR r.id!=?)),0) AS usedDays
      FROM leave_period_balances p WHERE p.employee_id=? ORDER BY p.period_start,p.id`).all(excludeId, excludeId, employeeId)
    return rows.map(row => ({ ...row, status: 'confirmed', availableDays: row.confirmedDays - row.usedDays }))
  }

  getBalances = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => {
      this.employee(db, employeeId)
      return this.balances(db, employeeId)
    })
  }

  private allocationProposal(db: Database.Database, employeeId: string, type: PeriodLeaveType, days: number,
    startDate: string, endDate: string, excludeId: string | null = null) {
    this.checkDates(this.employee(db, employeeId).hireDate, startDate, endDate)
    const balances = this.balances(db, employeeId, excludeId)
      .filter(period => period.leaveType === type)
    return { balances, ...fifoAllocation(balances.filter(period => period.periodStart <= startDate), days) }
  }

  proposeAllocation = (employeeId: string, leaveType: PeriodLeaveType, days: number, startDate: string, endDate: string) => {
    this.parse(schemas.id, employeeId)
    const type = this.parse(schemas.periodLeaveType, leaveType)
    const duration = this.parse(schemas.registration.shape.usedDays, days)
    const start = this.parse(schemas.calendarDate, startDate)
    const end = this.parse(schemas.calendarDate, endDate)
    return this.run(db => this.allocationProposal(db, employeeId, type, duration, start, end))
  }

  proposeEditAllocation = (id: string, expectedRevision: number, leaveType: PeriodLeaveType, days: number, startDate: string, endDate: string) => {
    this.parse(schemas.id, id)
    this.parse(schemas.revision, expectedRevision)
    const type = this.parse(schemas.periodLeaveType, leaveType)
    const duration = this.parse(schemas.registration.shape.usedDays, days)
    const start = this.parse(schemas.calendarDate, startDate)
    const end = this.parse(schemas.calendarDate, endDate)
    return this.run(db => {
      const record = this.currentRecord(db, id)
      this.checkRevision(record, expectedRevision)
      return this.allocationProposal(db, record.employeeId, type, duration, start, end, id)
    })
  }

  private records(db: Database.Database, employeeId: string | null): LeaveRecord[] {
    const rows = db.prepare<[string | null, string | null], Omit<LeaveRecord, 'allocations' | 'allocationWarning'> & { allocationWarning: number }>(`SELECT id, employee_id AS employeeId,
      leave_type AS leaveType, start_date AS startDate, end_date AS endDate, used_days AS usedDays,
      order_number AS orderNumber, order_date AS orderDate, duration_explanation AS durationExplanation,
      grant_basis AS grantBasis, status, revision, cancelled_at AS cancelledAt, cancel_reason AS cancelReason, created_at AS createdAt,
      0 AS allocationWarning
      FROM leave_records WHERE (? IS NULL OR employee_id=?)
      ORDER BY start_date DESC,id`).all(employeeId, employeeId)
    const allocations = db.prepare<[string], { periodId: string; days: number }>(
      'SELECT period_id AS periodId, days FROM leave_allocations WHERE record_id=? ORDER BY period_id')
    return rows.map(row => ({ ...row, allocationWarning: Boolean(row.allocationWarning), allocations: allocations.all(row.id) }))
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
    const { grantBasis, ...legacyValue } = value
    const canonical = { ...legacyValue, ...(grantBasis === null ? {} : { grantBasis }), allocations: [...value.allocations].sort((a, b) => a.periodId.localeCompare(b.periodId)) }
    const requestJson = JSON.stringify(canonical)
    return this.run(db => db.transaction(() => {
      const existing = db.prepare<[string], { id: string; requestJson: string; employeeId: string }>(
        'SELECT id, request_json AS requestJson, employee_id AS employeeId FROM leave_records WHERE request_id=?').get(value.requestId)
      if (existing) {
        if (existing.requestJson !== requestJson) throw new LeaveError('CONFLICT')
        return this.records(db, existing.employeeId).find(record => record.id === existing.id)!
      }
      this.validateRegistration(db, value)
      const id = randomUUID()
      db.prepare(`INSERT INTO leave_records(id,request_id,request_json,employee_id,leave_type,start_date,end_date,
        used_days,order_number,order_date,duration_explanation,created_at,grant_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, value.requestId, requestJson, value.employeeId, value.leaveType, value.startDate, value.endDate,
          value.usedDays, value.orderNumber, value.orderDate, value.durationExplanation, new Date().toISOString(), value.grantBasis)
      this.insertAllocations(db, id, value.allocations)
      return this.records(db, value.employeeId).find(record => record.id === id)!
    }).immediate())
  }

  private checkDates(hireDate: string, startDate: string, endDate: string) {
    if (startDate < '2027-01-01') throw new LeaveError('TRANSITION_LEAVE')
    if (startDate < hireDate || endDate < startDate) throw new LeaveError('INVALID_ARGUMENTS')
  }

  private validateRegistration(db: Database.Database, value: Omit<LeaveRegistration, 'requestId'>, excludeId: string | null = null) {
    const employee = this.employee(db, value.employeeId)
    this.checkDates(employee.hireDate, value.startDate, value.endDate)
    const length = calendarDays(value.startDate, value.endDate)
    if (length < 1 || value.usedDays > length ||
      (value.usedDays !== length && !value.durationExplanation)) throw new LeaveError('INVALID_ARGUMENTS')
    if (db.prepare(`SELECT 1 FROM leave_records WHERE employee_id=? AND status='active'
      AND start_date<=? AND end_date>=? AND (? IS NULL OR id!=?) LIMIT 1`).get(value.employeeId, value.endDate, value.startDate, excludeId, excludeId)) throw new LeaveError('LEAVE_OVERLAP')
    if (!isPeriodLeave(value.leaveType)) {
      if (!value.grantBasis?.trim()) throw new LeaveError('GRANT_BASIS_REQUIRED')
      if (value.allocations.length) throw new LeaveError('INVALID_ARGUMENTS')
      const limit = specialLeaveLimit(value.leaveType)
      if (limit !== null) {
        if (value.usedDays > limit || (value.usedDays < limit && !value.durationExplanation)) throw new LeaveError('SPECIAL_DURATION')
        if (db.prepare(`SELECT 1 FROM leave_records WHERE employee_id=? AND leave_type=? AND status='active'
          AND substr(start_date,1,4)=? AND (? IS NULL OR id!=?) LIMIT 1`)
          .get(value.employeeId, value.leaveType, value.startDate.slice(0,4), excludeId, excludeId)) throw new LeaveError('SPECIAL_YEAR_CONFLICT')
      }
      return
    }
    const balances = new Map(this.balances(db, value.employeeId, excludeId).map(period => [period.id, period]))
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
  }

  private insertAllocations(db: Database.Database, id: string, allocations: LeaveRegistration['allocations']) {
    const insert = db.prepare('INSERT INTO leave_allocations(record_id,period_id,days) VALUES (?,?,?)')
    for (const allocation of allocations) insert.run(id, allocation.periodId, allocation.days)
  }

  private currentRecord(db: Database.Database, id: string) {
    const row = db.prepare<[string], { employeeId: string }>('SELECT employee_id AS employeeId FROM leave_records WHERE id=?').get(id)
    if (!row) throw new LeaveError('NOT_FOUND')
    return this.records(db, row.employeeId).find(record => record.id === id)!
  }

  private checkRevision(record: LeaveRecord, revision: number) {
    if (record.status !== 'active') throw new LeaveError('LEAVE_CANCELLED')
    if (record.revision !== revision || revision === Number.MAX_SAFE_INTEGER) throw new LeaveError('STALE_REVISION')
  }

  getRecord = (id: string) => {
    this.parse(schemas.id, id)
    return this.run(db => this.currentRecord(db, id))
  }

  updateLeave = (input: LeaveUpdate) => {
    const value = this.parse(schemas.leaveUpdate, input)
    return this.run(db => db.transaction(() => {
      const record = this.currentRecord(db, value.id)
      this.checkRevision(record, value.expectedRevision)
      this.validateRegistration(db, { ...value, employeeId: record.employeeId }, record.id)
      db.prepare('DELETE FROM leave_allocations WHERE record_id=?').run(record.id)
      db.prepare(`UPDATE leave_records SET leave_type=?,start_date=?,end_date=?,used_days=?,order_number=?,
        order_date=?,duration_explanation=?,grant_basis=?,revision=revision+1 WHERE id=? AND revision=?`)
        .run(value.leaveType, value.startDate, value.endDate, value.usedDays, value.orderNumber,
          value.orderDate, value.durationExplanation, value.grantBasis, record.id, value.expectedRevision)
      this.insertAllocations(db, record.id, value.allocations)
      return this.currentRecord(db, record.id)
    }).immediate())
  }

  cancelLeave = (id: string, expectedRevision: number, reason: string) => {
    this.parse(schemas.id, id)
    this.parse(schemas.revision, expectedRevision)
    const text = this.parse(schemas.cancelReason, reason)
    return this.run(db => db.transaction(() => {
      const record = this.currentRecord(db, id)
      if (record.status === 'cancelled') return record
      this.checkRevision(record, expectedRevision)
      db.prepare(`UPDATE leave_records SET status='cancelled',revision=revision+1,cancelled_at=?,cancel_reason=?
        WHERE id=? AND revision=?`).run(new Date().toISOString(), text, id, expectedRevision)
      return this.currentRecord(db, id)
    }).immediate())
  }
}
