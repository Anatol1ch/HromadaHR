import type { IpcResult } from './ipc.js'

export const positionCategories = ['I','II','III','IV','V','VI','VII'] as const
export type PositionCategory = typeof positionCategories[number]
export type EmployeeType = 'official' | 'staff'
export interface EmployeeDetails {
  lastName: string
  firstName: string
  middleName: string | null
  birthDate: string | null
  employeeType: EmployeeType
  positionStartedOn: string | null
  positionCategory: PositionCategory | null
  hireDate: string
  positionId: string
  departmentId: string
}
export interface Department { id: string; name: string }
export interface Position { id: string; name: string }
export interface EmployeeCard extends EmployeeDetails {
  id: string
  position: Position
  department: Department
}
export type DictionaryKind = 'department' | 'position'
export interface DictionaryEntry { id: string; name: string; revision: number; employeeCount: number }
export interface DictionarySnapshot { entries: DictionaryEntry[]; revision: number }
export type PersonnelErrorCode = 'EMPLOYEE_HAS_DOCUMENTS' | 'APPOINTMENT_REVIEW_REQUIRED' | 'EMPLOYEE_HAS_CURRENT_RANK' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE_UNAVAILABLE' | 'HIRE_DATE_HAS_LEAVE_PERIODS' | 'DICTIONARY_STALE' | 'DICTIONARY_IN_USE'
export interface PersonnelApi {
  deleteEmployee: (employeeId: string) => Promise<IpcResult<null>>
  listEmployees: () => Promise<IpcResult<EmployeeCard[]>>
  getEmployee: (id: string) => Promise<IpcResult<EmployeeCard>>
  createEmployee: (input: EmployeeDetails) => Promise<IpcResult<EmployeeCard>>
  updateEmployee: (id: string, input: EmployeeDetails, appointmentReviewed?: boolean) => Promise<IpcResult<EmployeeCard>>
  listDepartments: () => Promise<IpcResult<Department[]>>
  createDepartment: (input: Omit<Department, 'id'>) => Promise<IpcResult<Department>>
  listPositions: () => Promise<IpcResult<Position[]>>
  createPosition: (input: Omit<Position, 'id'>) => Promise<IpcResult<Position>>
  getDictionary: (kind: DictionaryKind) => Promise<IpcResult<DictionarySnapshot>>
  renameDictionaryEntry: (kind: DictionaryKind, id: string, name: string, expectedRevision: number) => Promise<IpcResult<DictionarySnapshot>>
  deleteDictionaryEntry: (kind: DictionaryKind, id: string, expectedRevision: number) => Promise<IpcResult<DictionarySnapshot>>
  reorderDictionary: (kind: DictionaryKind, ids: string[], expectedRevision: number) => Promise<IpcResult<DictionarySnapshot>>
}
