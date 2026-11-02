import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { Assignment, CreateEmployee, Department, Employee, EmployeeCard, EmployeeDetails, PersonnelErrorCode, Position } from '../../shared/personnel.js'
import * as schemas from './schemas.js'

export class PersonnelError extends Error {
  constructor(readonly code: PersonnelErrorCode | 'BUSY' | 'INVALID_ARGUMENTS') { super(code) }
}
const employeeColumns = 'id, last_name AS lastName, first_name AS firstName, middle_name AS middleName, birth_date AS birthDate, employee_type AS employeeType, note'
const assignmentColumns = 'id, employee_id AS employeeId, position_id AS positionId, department_id AS departmentId, category, start_date AS startDate'

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
    const employee = db.prepare<[string], Employee>('SELECT ' + employeeColumns + ' FROM employees WHERE id=?').get(id)
    if (!employee) throw new PersonnelError('NOT_FOUND')
    const first = db.prepare<[string], { startDate: string }>('SELECT start_date AS startDate FROM employee_positions WHERE employee_id=? ORDER BY start_date LIMIT 1').get(id)
    const current = db.prepare<[string], Assignment>('SELECT ' + assignmentColumns + ' FROM employee_positions WHERE employee_id=? ORDER BY start_date DESC LIMIT 1').get(id)
    if (!first || !current) throw new PersonnelError('CONFLICT')
    const position = db.prepare<[string], Position>('SELECT id, name FROM positions WHERE id=?').get(current.positionId)
    const department = db.prepare<[string], Department>('SELECT id, name FROM departments WHERE id=?').get(current.departmentId)
    if (!position || !department) throw new PersonnelError('CONFLICT')
    return { ...employee, hireDate: first.startDate, currentAssignment: { ...current, position, department } }
  }
  listEmployees = () => this.run(db => db.transaction(() =>
    db.prepare<[], { id: string }>('SELECT id FROM employees ORDER BY last_name, first_name, middle_name, id').all()
      .map(({ id }) => this.card(db, id)))())
  getEmployee = (id: string) => {
    this.parse(schemas.id, id)
    return this.run(db => db.transaction(() => this.card(db, id))())
  }
  createEmployee = (input: CreateEmployee) => {
    const value = this.parse(schemas.createEmployee, input)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('SELECT id FROM positions WHERE id=?').get(value.positionId) ||
        !db.prepare('SELECT id FROM departments WHERE id=?').get(value.departmentId)) throw new PersonnelError('NOT_FOUND')
      const id = randomUUID()
      db.prepare('INSERT INTO employees (id, last_name, first_name, middle_name, birth_date, employee_type, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType, value.note)
      db.prepare('INSERT INTO employee_positions (id, employee_id, department_id, position_id, category, start_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), id, value.departmentId, value.positionId, value.category, value.startDate)
      return this.card(db, id)
    }).immediate())
  }
  updateEmployee = (id: string, input: EmployeeDetails) => {
    this.parse(schemas.id, id)
    const value = this.parse(schemas.employeeDetails, input)
    return this.run(db => db.transaction(() => {
      const previous = this.card(db, id)
      if (value.birthDate !== null && value.birthDate > previous.hireDate) throw new PersonnelError('INVALID_ARGUMENTS')
      db.prepare('UPDATE employees SET last_name=?, first_name=?, middle_name=?, birth_date=?, employee_type=?, note=? WHERE id=?')
        .run(value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType, value.note, id)
      return this.card(db, id)
    }).immediate())
  }
  getHistory = (id: string) => {
    this.parse(schemas.id, id)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('SELECT id FROM employees WHERE id=?').get(id)) throw new PersonnelError('NOT_FOUND')
      return db.prepare<[string], Assignment>('SELECT ' + assignmentColumns + ' FROM employee_positions WHERE employee_id=? ORDER BY start_date').all(id)
    })())
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
