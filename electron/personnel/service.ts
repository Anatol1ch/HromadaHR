import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { Department, EmployeeCard, EmployeeDetails, PersonnelErrorCode, Position } from '../../shared/personnel.js'
import * as schemas from './schemas.js'

export class PersonnelError extends Error {
  constructor(readonly code: PersonnelErrorCode | 'BUSY' | 'INVALID_ARGUMENTS') { super(code) }
}
type EmployeeRow = EmployeeDetails & { id: string; positionName: string; departmentName: string }
const employeeQuery = `SELECT e.id, e.last_name AS lastName, e.first_name AS firstName,
  e.middle_name AS middleName, e.birth_date AS birthDate, e.employee_type AS employeeType,
  e.hire_date AS hireDate, e.position_id AS positionId, e.department_id AS departmentId,
  p.name AS positionName, d.name AS departmentName
  FROM employees e JOIN positions p ON p.id=e.position_id JOIN departments d ON d.id=e.department_id`

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
        hire_date, position_id, department_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType,
          value.hireDate, value.positionId, value.departmentId)
      return this.card(db, id)
    }).immediate())
  }
  updateEmployee = (id: string, input: EmployeeDetails) => {
    this.parse(schemas.id, id)
    const value = this.parse(schemas.employeeDetails, input)
    return this.run(db => db.transaction(() => {
      this.checkReferences(db, value)
      const result = db.prepare(`UPDATE employees SET last_name=?, first_name=?, middle_name=?, birth_date=?,
        employee_type=?, hire_date=?, position_id=?, department_id=? WHERE id=?`)
        .run(value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType,
          value.hireDate, value.positionId, value.departmentId, id)
      if (!result.changes) throw new PersonnelError('NOT_FOUND')
      return this.card(db, id)
    }).immediate())
  }
  deleteEmployee = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('DELETE FROM employees WHERE id=?').run(employeeId).changes) throw new PersonnelError('NOT_FOUND')
      return null
    }).immediate())
  }
  listDepartments = () => this.run(db => db.prepare<[], Department>('SELECT id, name FROM departments ORDER BY name_key, id').all())
  listPositions = () => this.run(db => db.prepare<[], Position>('SELECT id, name FROM positions ORDER BY name_key, id').all())
  createDepartment = (input: Omit<Department, 'id'>) => {
    const value = this.parse(schemas.departmentInput, input)
    return this.run(db => {
      const result = { id: randomUUID(), ...value }
      db.prepare('INSERT INTO departments(id, name, name_key) VALUES (?, ?, ?)').run(result.id, result.name, schemas.nameKey(result.name))
      return result
    })
  }
  createPosition = (input: Omit<Position, 'id'>) => {
    const value = this.parse(schemas.positionInput, input)
    return this.run(db => {
      const result = { id: randomUUID(), ...value }
      db.prepare('INSERT INTO positions(id, name, name_key) VALUES (?, ?, ?)').run(result.id, result.name, schemas.nameKey(result.name))
      return result
    })
  }
}
