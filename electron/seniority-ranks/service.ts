import { projectRank } from '../../shared/rank-projection.js'
import { projectService } from '../../shared/service-calculations.js'
import { calculateService } from '../../shared/service-calculations.js'
import { PersonnelService } from '../personnel/service.js'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { ServiceAccounting, ServiceAccountingInput, Allowance, AllowanceInput, CurrentRank, RankInput, SeniorityRanksErrorCode } from '../../shared/seniority-ranks.js'
import { todayIsoDate } from '../../src/lib/dates.js'
import * as schemas from './schemas.js'
import { readServiceAccounting } from '../storage/service-accounting.js'
export class SeniorityRanksError extends Error {
  constructor(readonly code: SeniorityRanksErrorCode | 'BUSY' | 'STORAGE_UNAVAILABLE' | 'NOT_FOUND' | 'INVALID_ARGUMENTS' | 'CONFLICT') { super(code) }
}
const sharedColumns = `employee_id AS employeeId, effective_on AS effectiveOn, document_type AS documentType,
 document_number AS documentNumber, document_date AS documentDate, confirmed_at AS confirmedAt`
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
    return db.prepare<[string], Allowance>(`SELECT ${sharedColumns}, status, percentage FROM employee_seniority_allowances WHERE employee_id=?`).get(id) ?? null
  }
  private rank(db: Database.Database, id: string) {
    return db.prepare<[string], CurrentRank>(`SELECT employee_id AS employeeId, rank, assigned_on AS assignedOn, document_type AS documentType, document_number AS documentNumber, document_date AS documentDate, confirmed_at AS confirmedAt, origin, review_anchor_on AS reviewAnchorOn FROM employee_current_ranks WHERE employee_id=?`).get(id) ?? null
  }
  private accounting(db: Database.Database, id: string): ServiceAccounting | null {
    try{return readServiceAccounting(db,id)}catch{throw new SeniorityRanksError('CONFLICT')}
  }
  getRankProjection = (id:string) => this.run(id,db => {
    const employee=new PersonnelService(this.storage,this.isBusy).getEmployee(id)
    return projectRank(employee,this.rank(db,id),todayIsoDate())
  })
  getServiceProjection = (id:string) => this.run(id,(db,type) => projectService(this.accounting(db,id),todayIsoDate(),type as 'official'|'staff',this.allowance(db,id)))
  getServiceAccounting = (id: string) => this.run(id, db => this.accounting(db, id))
  previewServiceAccounting = (id:string,input:ServiceAccountingInput,on:string) => {
    const value=this.parse(schemas.serviceAccountingInput,input),date=this.parse(schemas.calendarDate,on)
    return this.run(id,(db,type)=>projectService(value,date,type as 'official'|'staff',this.allowance(db,id)))
  }
  clearServiceAccounting = (id: string) => this.run(id, db => {
    db.prepare('DELETE FROM employee_service_records WHERE employee_id=?').run(id); return null
  })
  saveServiceAccounting = (id: string, input: ServiceAccountingInput): ServiceAccounting => {
    const v = this.parse(schemas.serviceAccountingInput, input)
    const today=todayIsoDate(),dates=v.mode==='continuous'?[v.startDate]:v.mode==='snapshot'?[v.asOfDate]:v.periods.flatMap(p=>[p.startDate,p.endDate].filter((d):d is string=>d!==null))
    this.checkDate(...dates)
    if(calculateService(v,today).status!=='calculated')throw new SeniorityRanksError('INVALID_ARGUMENTS')
    return this.run(id, db => {
      db.prepare('DELETE FROM employee_service_records WHERE employee_id=?').run(id)
      const now=new Date().toISOString()
      if(v.mode==='continuous')db.prepare(`INSERT INTO employee_service_records(employee_id,mode,start_date,confirmed_at) VALUES (?,'continuous',?,?)`).run(id,v.startDate,now)
      else if(v.mode==='snapshot')db.prepare(`INSERT INTO employee_service_records(employee_id,mode,years,months,days,as_of_date,confirmed_at) VALUES (?,'snapshot',?,?,?,?,?)`).run(id,v.years,v.months,v.days,v.asOfDate,now)
      else {
        db.prepare(`INSERT INTO employee_service_records(employee_id,mode,confirmed_at) VALUES (?,'periods',?)`).run(id,now)
        const insert=db.prepare('INSERT INTO employee_service_periods(id,employee_id,start_date,end_date) VALUES (?,?,?,?)')
        for(const period of v.periods)insert.run(period.id,id,period.startDate,period.endDate)
      }
      return this.accounting(db,id)!
    })
  }
  listOverview = () => this.run(null, db => {
    const allowances = new Map(db.prepare<[], Allowance>(`SELECT ${sharedColumns}, status, percentage FROM employee_seniority_allowances`).all().map(row => [row.employeeId, row]))
    const ranks = new Map(db.prepare<[], CurrentRank>(`SELECT employee_id AS employeeId, rank, assigned_on AS assignedOn, document_type AS documentType, document_number AS documentNumber, document_date AS documentDate, confirmed_at AS confirmedAt, origin, review_anchor_on AS reviewAnchorOn FROM employee_current_ranks`).all().map(row => [row.employeeId, row]))
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
      db.prepare(`INSERT INTO employee_seniority_allowances(employee_id,status,percentage,effective_on,document_type,document_number,document_date,confirmed_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET status=excluded.status,percentage=excluded.percentage,
        effective_on=excluded.effective_on,document_type=excluded.document_type,document_number=excluded.document_number,
        document_date=excluded.document_date,confirmed_at=excluded.confirmed_at`)
        .run(id,v.status,v.percentage,v.effectiveOn,v.documentType,v.documentNumber,v.documentDate,new Date().toISOString())
      return this.allowance(db,id)!
    })
  }
  saveRank = (id: string, input: RankInput): CurrentRank => {
    const v = this.parse(schemas.rankInput, input)
    this.checkDate(v.assignedOn,v.reviewAnchorOn)
    return this.run(id, (db,type) => {
      if (type !== 'official') throw new SeniorityRanksError('RANK_REQUIRES_OFFICIAL')
      db.prepare(`INSERT INTO employee_current_ranks(employee_id,rank,assigned_on,document_type,document_number,document_date,confirmed_at,origin,review_anchor_on)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET rank=excluded.rank,assigned_on=excluded.assigned_on,
        document_type=excluded.document_type,document_number=excluded.document_number,document_date=excluded.document_date,
        confirmed_at=excluded.confirmed_at,origin=excluded.origin,review_anchor_on=excluded.review_anchor_on`)
        .run(id,v.rank,v.assignedOn,v.documentType,v.documentNumber,v.documentDate,new Date().toISOString(),v.origin,v.reviewAnchorOn)
      return this.rank(db,id)!
    })
  }
}
