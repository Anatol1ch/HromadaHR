import type { IpcResult } from './ipc.js'

export type EmployeeType = 'official' | 'staff'
export interface EmployeeDetails {
  lastName: string
  firstName: string
  middleName: string | null
  birthDate: string | null
  employeeType: EmployeeType
}
export interface Assignment {
  id: string
  employeeId: string
  positionId: string
  departmentId: string
  category: string | null
  startDate: string
}
export type AssignmentInput = Pick<Assignment, 'departmentId' | 'positionId' | 'category' | 'startDate'>
export interface Department { id: string; name: string }
export interface Position { id: string; name: string }
export interface Employee extends EmployeeDetails { id: string }
export interface EmployeeCard extends Employee {
  hireDate: string
  currentAssignment: Assignment & { position: Position; department: Department }
}
export interface CreateEmployee extends EmployeeDetails {
  positionId: string
  departmentId: string
  category: string | null
  startDate: string
}
export type PersonnelErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'STORAGE_UNAVAILABLE' | 'FUTURE_ASSIGNMENT' |
  'DUPLICATE_ASSIGNMENT_DATE' | 'NO_ASSIGNMENT_CHANGE' | 'ASSIGNMENT_BEFORE_BIRTH' | 'LAST_ASSIGNMENT'
export interface PersonnelApi {
  createAssignment: (employeeId: string, input: AssignmentInput) => Promise<IpcResult<EmployeeCard>>
  updateAssignment: (assignmentId: string, input: AssignmentInput) => Promise<IpcResult<EmployeeCard>>
  deleteAssignment: (assignmentId: string) => Promise<IpcResult<EmployeeCard>>
  deleteEmployee: (employeeId: string) => Promise<IpcResult<null>>
  listEmployees: () => Promise<IpcResult<EmployeeCard[]>>
  getEmployee: (id: string) => Promise<IpcResult<EmployeeCard>>
  createEmployee: (input: CreateEmployee) => Promise<IpcResult<EmployeeCard>>
  updateEmployee: (id: string, input: EmployeeDetails) => Promise<IpcResult<EmployeeCard>>
  getHistory: (employeeId: string) => Promise<IpcResult<Assignment[]>>
  listDepartments: () => Promise<IpcResult<Department[]>>
  createDepartment: (input: Omit<Department, 'id'>) => Promise<IpcResult<Department>>
  listPositions: () => Promise<IpcResult<Position[]>>
  createPosition: (input: Omit<Position, 'id'>) => Promise<IpcResult<Position>>
}
