import { PersonnelService } from '../personnel/service.js'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { Allowance, AllowanceInput, CurrentRank, RankInput, SeniorityRanksErrorCode } from '../../shared/seniority-ranks.js'
import { todayIsoDate } from '../../src/lib/dates.js'
import * as schemas from './schemas.js'
export class SeniorityRanksError extends Error {
  constructor(readonly code: SeniorityRanksErrorCode | 'BUSY' | 'STORAGE_UNAVAILABLE' | 'NOT_FOUND' | 'INVALID_ARGUMENTS' | 'CONFLICT') { super(code) }
}
const columns = `employee_id AS employeeId, effective_on AS effectiveOn, document_type AS documentType,
 document_number AS documentNumber, document_date AS documentDate, review_on AS reviewOn, confirmed_at AS confirmedAt`
// Main-only: resolve the live connection for each operation, including after restore.
export class SeniorityRanksService {
  constructor(private readonly storage: Pick<Storage, 'getDatabase'>, private readonly isBusy: () => boolean) {}
  private parse<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
    try { return schema.parse(input) } catch { throw new SeniorityRanksError('INVALID_ARGUMENTS') }
  }
  private run<T>(id: string | null, operation: (db: Database.Database, type: string) => T): T {
    if (id !== null) this.parse(schemas.id, id)
    if (this.isBusy()) throw new SeniorityRanksError('BUSY')
    let db: Database.Database
    try { db = this.storage.getDatabase() } catch { throw new SeniorityRanksError('STORAGE_UNAVAILABLE') }
    try {
      const operationInTransaction = db.transaction(() => {
        if (id === null) return operation(db, '')
        const employee = db.prepare<[string], { type: string }>('SELECT employee_type AS type FROM employees WHERE id=?').get(id)
        if (!employee) throw new SeniorityRanksError('NOT_FOUND')
        return operation(db, employee.type)
      })
      return id === null ? operationInTransaction() : operationInTransaction.immediate()
    } catch (error) {
      if (error instanceof SeniorityRanksError) throw error
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code.startsWith('SQLITE_CONSTRAINT')) throw new SeniorityRanksError('CONFLICT')
      if (/^SQLITE_(BUSY|LOCKED)/.test(code)) throw new SeniorityRanksError('BUSY')
      throw error
    }
  }
  private checkDate(...dates: (string | null)[]) {
    const today = todayIsoDate()
    if (dates.some(date => date !== null && date > today)) throw new SeniorityRanksError('INVALID_ARGUMENTS')
  }
  private allowance(db: Database.Database, id: string) {
    return db.prepare<[string], Allowance>(`SELECT ${columns}, status, percentage FROM employee_seniority_allowances WHERE employee_id=?`).get(id) ?? null
  }
  private rank(db: Database.Database, id: string) {
    return db.prepare<[string], CurrentRank>(`SELECT ${columns}, rank, assigned_on AS assignedOn FROM employee_current_ranks WHERE employee_id=?`).get(id) ?? null
  }
  listOverview = () => this.run(null, db => {
    const allowances = new Map(db.prepare<[], Allowance>(`SELECT ${columns}, status, percentage FROM employee_seniority_allowances`).all().map(row => [row.employeeId, row]))
    const ranks = new Map(db.prepare<[], CurrentRank>(`SELECT ${columns}, rank, assigned_on AS assignedOn FROM employee_current_ranks`).all().map(row => [row.employeeId, row]))
    return new PersonnelService(this.storage, this.isBusy).listEmployees().map(employee => ({
      employee, allowance: allowances.get(employee.id) ?? null, rank: ranks.get(employee.id) ?? null,
    }))
  })
  getAllowance = (id: string) => this.run(id, db => this.allowance(db, id))
  getRank = (id: string) => this.run(id, db => this.rank(db, id))
  clearAllowance = (id: string) => this.run(id, db => { db.prepare('DELETE FROM employee_seniority_allowances WHERE employee_id=?').run(id); return null })
  clearRank = (id: string) => this.run(id, db => { db.prepare('DELETE FROM employee_current_ranks WHERE employee_id=?').run(id); return null })
  saveAllowance = (id: string, input: AllowanceInput): Allowance => {
    const v = this.parse(schemas.allowanceInput, input)
    this.checkDate(v.effectiveOn)
    return this.run(id, db => {
      db.prepare(`INSERT INTO employee_seniority_allowances(employee_id,status,percentage,effective_on,document_type,document_number,document_date,review_on,confirmed_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET status=excluded.status,percentage=excluded.percentage,
        effective_on=excluded.effective_on,document_type=excluded.document_type,document_number=excluded.document_number,
        document_date=excluded.document_date,review_on=excluded.review_on,confirmed_at=excluded.confirmed_at`)
        .run(id,v.status,v.percentage,v.effectiveOn,v.documentType,v.documentNumber,v.documentDate,v.reviewOn,new Date().toISOString())
      return this.allowance(db,id)!
    })
  }
  saveRank = (id: string, input: RankInput): CurrentRank => {
    const v = this.parse(schemas.rankInput, input)
    this.checkDate(v.assignedOn,v.effectiveOn)
    return this.run(id, (db,type) => {
      if (type !== 'official') throw new SeniorityRanksError('RANK_REQUIRES_OFFICIAL')
      db.prepare(`INSERT INTO employee_current_ranks(employee_id,rank,assigned_on,effective_on,document_type,document_number,document_date,review_on,confirmed_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET rank=excluded.rank,assigned_on=excluded.assigned_on,
        effective_on=excluded.effective_on,document_type=excluded.document_type,document_number=excluded.document_number,
        document_date=excluded.document_date,review_on=excluded.review_on,confirmed_at=excluded.confirmed_at`)
        .run(id,v.rank,v.assignedOn,v.effectiveOn,v.documentType,v.documentNumber,v.documentDate,v.reviewOn,new Date().toISOString())
      return this.rank(db,id)!
    })
  }
}
