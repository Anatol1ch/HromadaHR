import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Storage } from '../storage/index.js'
import type { Assignment, AssignmentInput, CreateEmployee, Department, Employee, EmployeeCard, EmployeeDetails, PersonnelErrorCode, Position } from '../../shared/personnel.js'
import * as schemas from './schemas.js'

export class PersonnelError extends Error {
  constructor(readonly code: PersonnelErrorCode | 'BUSY' | 'INVALID_ARGUMENTS') { super(code) }
}
const employeeColumns = 'id, last_name AS lastName, first_name AS firstName, middle_name AS middleName, birth_date AS birthDate, employee_type AS employeeType'
const assignmentColumns = 'id, employee_id AS employeeId, position_id AS positionId, department_id AS departmentId, category, start_date AS startDate'

// Main-only. Resolve the current connection on every operation, including after restore.
export class PersonnelService {
  constructor(private readonly storage: Pick<Storage, 'getDatabase'>, private readonly isBusy: () => boolean,
    private readonly today = () => {
      const date = new Date()
      return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
    }) {}

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
      db.prepare('INSERT INTO employees (id, last_name, first_name, middle_name, birth_date, employee_type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType)
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
      db.prepare('UPDATE employees SET last_name=?, first_name=?, middle_name=?, birth_date=?, employee_type=? WHERE id=?')
        .run(value.lastName, value.firstName, value.middleName, value.birthDate, value.employeeType, id)
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
  private checkReferences(db: Database.Database, input: AssignmentInput) {
    if (!db.prepare('SELECT 1 FROM departments WHERE id=?').get(input.departmentId) ||
      !db.prepare('SELECT 1 FROM positions WHERE id=?').get(input.positionId)) throw new PersonnelError('NOT_FOUND')
  }
  private assignmentOwner(db: Database.Database, assignmentId: string): string {
    const row = db.prepare<[string], { employeeId: string }>('SELECT employee_id AS employeeId FROM employee_positions WHERE id=?').get(assignmentId)
    if (!row) throw new PersonnelError('NOT_FOUND')
    return row.employeeId
  }
  private checkAssignmentDate(db: Database.Database, employeeId: string, input: AssignmentInput, excludeId: string | null = null) {
    if (input.startDate > this.today()) throw new PersonnelError('FUTURE_ASSIGNMENT')
    if (db.prepare('SELECT 1 FROM employee_positions WHERE employee_id=? AND start_date=? AND (? IS NULL OR id!=?)')
      .get(employeeId, input.startDate, excludeId, excludeId)) throw new PersonnelError('DUPLICATE_ASSIGNMENT_DATE')
  }
  private checkChronology(db: Database.Database, employeeId: string) {
    const employee = db.prepare<[string], { birthDate: string | null }>('SELECT birth_date AS birthDate FROM employees WHERE id=?').get(employeeId)
    if (!employee) throw new PersonnelError('NOT_FOUND')
    const history = db.prepare<[string], Assignment>('SELECT ' + assignmentColumns + ' FROM employee_positions WHERE employee_id=? ORDER BY start_date').all(employeeId)
    if (!history.length) throw new PersonnelError('LAST_ASSIGNMENT')
    const today = this.today()
    for (let index = 0; index < history.length; index++) {
      const row = history[index]
      if (row.startDate > today) throw new PersonnelError('FUTURE_ASSIGNMENT')
      if (employee.birthDate !== null && row.startDate < employee.birthDate) throw new PersonnelError('ASSIGNMENT_BEFORE_BIRTH')
      const previous = history[index - 1]
      if (previous && previous.departmentId === row.departmentId && previous.positionId === row.positionId && previous.category === row.category) {
        throw new PersonnelError('NO_ASSIGNMENT_CHANGE')
      }
    }
  }
  createAssignment = (employeeId: string, input: AssignmentInput) => {
    this.parse(schemas.id, employeeId)
    const value = this.parse(schemas.assignmentInput, input)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM employees WHERE id=?').get(employeeId)) throw new PersonnelError('NOT_FOUND')
      this.checkReferences(db, value)
      this.checkAssignmentDate(db, employeeId, value)
      db.prepare('INSERT INTO employee_positions(id, employee_id, department_id, position_id, category, start_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), employeeId, value.departmentId, value.positionId, value.category, value.startDate)
      this.checkChronology(db, employeeId)
      return this.card(db, employeeId)
    }).immediate())
  }
  updateAssignment = (assignmentId: string, input: AssignmentInput) => {
    this.parse(schemas.id, assignmentId)
    const value = this.parse(schemas.assignmentInput, input)
    return this.run(db => db.transaction(() => {
      const employeeId = this.assignmentOwner(db, assignmentId)
      this.checkReferences(db, value)
      this.checkAssignmentDate(db, employeeId, value, assignmentId)
      db.prepare('UPDATE employee_positions SET department_id=?, position_id=?, category=?, start_date=? WHERE id=?')
        .run(value.departmentId, value.positionId, value.category, value.startDate, assignmentId)
      this.checkChronology(db, employeeId)
      return this.card(db, employeeId)
    }).immediate())
  }
  deleteAssignment = (assignmentId: string) => {
    this.parse(schemas.id, assignmentId)
    return this.run(db => db.transaction(() => {
      const employeeId = this.assignmentOwner(db, assignmentId)
      db.prepare('DELETE FROM employee_positions WHERE id=?').run(assignmentId)
      this.checkChronology(db, employeeId) // Includes last-record and newly adjacent duplicates; failure rolls back.
      return this.card(db, employeeId)
    }).immediate())
  }
  deleteEmployee = (employeeId: string) => {
    this.parse(schemas.id, employeeId)
    return this.run(db => db.transaction(() => {
      if (!db.prepare('DELETE FROM employees WHERE id=?').run(employeeId).changes) throw new PersonnelError('NOT_FOUND')
      return null // Existing FK CASCADE removes history, while dictionaries remain untouched.
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
