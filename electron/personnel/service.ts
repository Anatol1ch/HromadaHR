import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { DictionaryEntry, DictionaryKind, DictionarySnapshot, EmployeeCard, EmployeeDetails, PersonnelErrorCode } from '../../shared/personnel.js'
import * as schemas from './schemas.js'

export class PersonnelError extends Error {
  constructor(readonly code: PersonnelErrorCode | 'BUSY' | 'INVALID_ARGUMENTS') { super(code) }
}
type EmployeeRow = EmployeeDetails & { id: string; positionName: string; departmentName: string }
const employeeQuery = `SELECT e.id, e.last_name AS lastName, e.first_name AS firstName,
  e.middle_name AS middleName, e.birth_date AS birthDate, e.employee_type AS employeeType,
  e.position_started_on AS positionStartedOn, e.position_category AS positionCategory, e.hire_date AS hireDate, e.position_id AS positionId, e.department_id AS departmentId,
  p.name AS positionName, d.name AS departmentName
  FROM employees e JOIN positions p ON p.id=e.position_id JOIN departments d ON d.id=e.department_id`
const dictionaries = {
  department: { table: 'departments', reference: 'department_id' },
  position: { table: 'positions', reference: 'position_id' },
} as const

function toCard({ positionName, departmentName, ...employee }: EmployeeRow): EmployeeCard {
  return { ...employee, position: { id: employee.positionId, name: positionName },
    department: { id: employee.departmentId, name: departmentName } }
}

// Main-only. Resolve the current connection on every operation, including after restore.
export class PersonnelService {
  constructor(private readonly storage: Pick<Storage, 'getDatabase'>, private readonly isBusy: () => boolean) {}

  private run<T>(operation: (db: Database.Database) => T): T {
    if (this.isBusy()) throw new PersonnelError('BUSY')
    let db: Database.Database
    try { db = this.storage.getDatabase() } catch { throw new PersonnelError('STORAGE_UNAVAILABLE') }
    try { return operation(db) } catch (error) {
      if (error instanceof PersonnelError) throw error
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code.startsWith('SQLITE_CONSTRAINT')) throw new PersonnelError('CONFLICT')
      if (/^SQLITE_(BUSY|LOCKED)/.test(code)) throw new PersonnelError('BUSY')
      throw error // The IPC boundary returns INTERNAL_ERROR without exception details.
    }
  }
  private parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new PersonnelError('INVALID_ARGUMENTS')
    return parsed.data
  }
  private card(db: Database.Database, id: string): EmployeeCard {
    const row = db.prepare<[string], EmployeeRow>(employeeQuery + ' WHERE e.id=?').get(id)
    if (!row) throw new PersonnelError('NOT_FOUND')
    return toCard(row)
  }
  listEmployees = () => this.run(db => db.prepare<[], EmployeeRow>(
    employeeQuery + ' ORDER BY e.last_name, e.first_name, e.middle_name, e.id').all().map(toCard))
  getEmployee = (id: string) => {
    this.parse(schemas.id, id)
    return this.run(db => this.card(db, id))
  }
  private checkReferences(db: Database.Database, value: EmployeeDetails) {
    if (!db.prepare('SELECT 1 FROM positions WHERE id=?').get(value.positionId) ||
      !db.prepare('SELECT 1 FROM departments WHERE id=?').get(value.departmentId)) throw new PersonnelError('NOT_FOUND')
  }
  createEmployee = (input: EmployeeDetails) => {
    const value = this.parse(schemas.employeeDetails, input)
    return this.run(db => db.transaction(() => {
      this.checkReferences(db, value)
      const id = randomUUID()
      db.prepare(`INSERT INTO employees (id, last_name, first_name, middle_name, birth_date, employee_type,
        hire_date, position_id, department_id, position_started_on, position_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType,
          value.hireDate, value.positionId, value.departmentId, value.positionStartedOn, value.positionCategory)
      return this.card(db, id)
    }).immediate())
  }
  updateEmployee = (id: string, input: EmployeeDetails, appointmentReviewed = false) => {
    this.parse(schemas.id, id)
    const value = this.parse(schemas.employeeDetails, input)
    if (typeof appointmentReviewed !== 'boolean') throw new PersonnelError('INVALID_ARGUMENTS')
    return this.run(db => db.transaction(() => {
      this.checkReferences(db, value)
      const current = this.card(db,id)
      if ((current.positionId !== value.positionId || current.departmentId !== value.departmentId) &&
        (value.positionStartedOn !== null || value.positionCategory !== null) && !appointmentReviewed) throw new PersonnelError('APPOINTMENT_REVIEW_REQUIRED')
      const result = db.prepare(`UPDATE employees SET last_name=?, first_name=?, middle_name=?, birth_date=?,
        employee_type=?, hire_date=?, position_id=?, department_id=?, position_started_on=?, position_category=? WHERE id=?`)
      const currentHireDate = db.prepare<[string], { hireDate: string }>('SELECT hire_date AS hireDate FROM employees WHERE id=?').get(id)
      if (!currentHireDate) throw new PersonnelError('NOT_FOUND')
      if (currentHireDate.hireDate !== value.hireDate && db.prepare('SELECT 1 FROM leave_period_balances WHERE employee_id=? LIMIT 1').get(id)) {
        throw new PersonnelError('HIRE_DATE_HAS_LEAVE_PERIODS')
      }
      if (value.employeeType === 'staff' && db.prepare('SELECT 1 FROM employee_current_ranks WHERE employee_id=?').get(id)) {
        throw new PersonnelError('EMPLOYEE_HAS_CURRENT_RANK')
      }
      const changed = result.run(value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType,
          value.hireDate, value.positionId, value.departmentId, value.positionStartedOn, value.positionCategory, id)
      if (!changed.changes) throw new PersonnelError('NOT_FOUND')
      return this.card(db, id)
    }).immediate())
  }
  deleteEmployee = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => db.transaction(() => {
      if (db.prepare('SELECT 1 FROM personnel_document_employees WHERE employee_id=? LIMIT 1').get(employeeId)) throw new PersonnelError('EMPLOYEE_HAS_DOCUMENTS')
      if (!db.prepare('DELETE FROM employees WHERE id=?').run(employeeId).changes) throw new PersonnelError('NOT_FOUND')
      return null
    }).immediate())
  }
  private listDirectory(kind: DictionaryKind) {
    return this.run(db => db.prepare<[], { id: string; name: string }>(
      `SELECT id, name FROM ${dictionaries[kind].table} ORDER BY sort_order, id`).all())
  }
  listDepartments = () => this.listDirectory('department')
  listPositions = () => this.listDirectory('position')
  createDepartment = (input: { name: string }) => this.createEntry('department', this.parse(schemas.departmentInput, input).name)
  createPosition = (input: { name: string }) => this.createEntry('position', this.parse(schemas.positionInput, input).name)

  private bumpOrder(db: Database.Database, kind: DictionaryKind) {
    db.prepare('UPDATE personnel_dictionary_order SET revision=revision+1 WHERE kind=?').run(kind)
  }

  private createEntry(kind: DictionaryKind, name: string) {
    const { table } = dictionaries[kind]
    return this.run(db => db.transaction(() => {
      const result = { id: randomUUID(), name }
      db.prepare(`INSERT INTO ${table}(id, name, name_key, sort_order)
        VALUES (?, ?, ?, (SELECT coalesce(max(sort_order)+1,0) FROM ${table}))`).run(result.id, name, schemas.nameKey(name))
      this.bumpOrder(db, kind)
      return result
    }).immediate())
  }

  private snapshot(db: Database.Database, kind: DictionaryKind): DictionarySnapshot {
    const { table, reference } = dictionaries[kind]
    const order = db.prepare<[DictionaryKind], { revision: number }>('SELECT revision FROM personnel_dictionary_order WHERE kind=?').get(kind)!
    const entries = db.prepare<[], DictionaryEntry>(`SELECT d.id, d.name, d.revision,
      (SELECT count(*) FROM employees e WHERE e.${reference}=d.id) AS employeeCount
      FROM ${table} d ORDER BY d.sort_order, d.id`).all()
    return { revision: order.revision, entries }
  }

  getDictionary = (kind: DictionaryKind) => {
    this.parse(schemas.dictionaryKind, kind)
    return this.run(db => db.transaction(() => this.snapshot(db, kind))())
  }

  private changeEntry(kind: DictionaryKind, id: string, expectedRevision: number,
    change: (db: Database.Database, entry: { sortOrder: number }) => void) {
    this.parse(schemas.dictionaryKind, kind)
    this.parse(schemas.id, id)
    this.parse(schemas.revision, expectedRevision)
    return this.run(db => db.transaction(() => {
      const entry = db.prepare<[string], { revision: number; sortOrder: number }>(
        `SELECT revision, sort_order AS sortOrder FROM ${dictionaries[kind].table} WHERE id=?`).get(id)
      if (!entry) throw new PersonnelError('NOT_FOUND')
      if (entry.revision !== expectedRevision) throw new PersonnelError('DICTIONARY_STALE')
      change(db, entry)
      return this.snapshot(db, kind)
    }).immediate())
  }

  renameDictionaryEntry = (kind: DictionaryKind, id: string, input: string, expectedRevision: number) => {
    const name = this.parse(schemas.dictionaryName, input)
    return this.changeEntry(kind, id, expectedRevision, db => {
      db.prepare(`UPDATE ${dictionaries[kind].table} SET name=?, name_key=?, revision=revision+1 WHERE id=?`)
        .run(name, schemas.nameKey(name), id)
    })
  }

  deleteDictionaryEntry = (kind: DictionaryKind, id: string, expectedRevision: number) =>
    this.changeEntry(kind, id, expectedRevision, (db, entry) => {
      const { table, reference } = dictionaries[kind]
      if (db.prepare(`SELECT 1 FROM employees WHERE ${reference}=? LIMIT 1`).get(id)) throw new PersonnelError('DICTIONARY_IN_USE')
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id)
      db.prepare(`UPDATE ${table} SET sort_order=sort_order-1 WHERE sort_order>?`).run(entry.sortOrder)
      this.bumpOrder(db, kind)
    })

  reorderDictionary = (kind: DictionaryKind, ids: string[], expectedRevision: number) => {
    this.parse(schemas.dictionaryKind, kind)
    this.parse(schemas.dictionaryIds, ids)
    this.parse(schemas.revision, expectedRevision)
    return this.run(db => db.transaction(() => {
      const current = this.snapshot(db, kind)
      if (current.revision !== expectedRevision) throw new PersonnelError('DICTIONARY_STALE')
      const known = new Set(current.entries.map(entry => entry.id))
      if (ids.length !== known.size || ids.some(id => !known.has(id))) throw new PersonnelError('INVALID_ARGUMENTS')
      if (ids.every((id, index) => current.entries[index]?.id === id)) return current
      const update = db.prepare(`UPDATE ${dictionaries[kind].table} SET sort_order=? WHERE id=?`)
      ids.forEach((id, index) => update.run(index, id))
      this.bumpOrder(db, kind)
      return this.snapshot(db, kind)
    }).immediate())
  }
}
