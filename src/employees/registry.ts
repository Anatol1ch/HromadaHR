import type { DictionaryEntry, EmployeeCard, EmployeeType } from '../../shared/personnel'
import { fullName, normalizeText } from './model.ts'
import { isIsoCalendarDate } from '../lib/dates.ts'

export type SortKey = 'fullName' | 'position' | 'department' | 'hireDate'
export interface EmployeeSort { key: SortKey; direction: 'asc' | 'desc' }
export interface RegistryState {
  query: string; departmentId: string; positionId: string; filtersOpen: boolean
  employeeType: EmployeeType | ''; mode: 'structure' | 'list'; sort: EmployeeSort
}
export type RegistryDirectories = { department: DictionaryEntry[]; position: DictionaryEntry[] }
export const defaultSort = (): EmployeeSort => ({ key: 'fullName', direction: 'asc' })
export const initialRegistry = (): RegistryState => ({ query: '', departmentId: '', positionId: '', filtersOpen: false,
  employeeType: '', mode: 'structure', sort: defaultSort() })
export const nextSort = (current: EmployeeSort, key: SortKey): EmployeeSort => ({
  key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
})
export const collator = new Intl.Collator('uk', { sensitivity: 'base' })
export function filterEmployees(rows: EmployeeCard[], filter: Pick<RegistryState, 'query' | 'departmentId' | 'positionId' | 'employeeType'>) {
  const terms = normalizeText(filter.query).split(' ').filter(Boolean)
  return rows.filter(row => (!filter.departmentId || row.departmentId === filter.departmentId) &&
    (!filter.positionId || row.positionId === filter.positionId) &&
    (!filter.employeeType || row.employeeType === filter.employeeType) &&
    terms.every(term => normalizeText(fullName(row)).includes(term)))
}
export function sortEmployees(rows: EmployeeCard[], sort: EmployeeSort) {
  const value = (row: EmployeeCard) => sort.key === 'position' ? row.position.name :
    sort.key === 'department' ? row.department.name : sort.key === 'hireDate' ?
      (isIsoCalendarDate(row.hireDate) ? row.hireDate : '') : fullName(row)
  return [...rows].sort((a, b) => {
    const primary = sort.key === 'hireDate' ? (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) : collator.compare(value(a), value(b))
    return (primary || collator.compare(fullName(a), fullName(b)) || a.id.localeCompare(b.id)) * (sort.direction === 'asc' ? 1 : -1)
  })
}
export function withDirectoryNames(rows: EmployeeCard[], directories: RegistryDirectories) {
  const departments = new Map(directories.department.map(({ id, name }) => [id, name]))
  const positions = new Map(directories.position.map(({ id, name }) => [id, name]))
  return rows.map(row => ({ ...row,
    department: { ...row.department, name: departments.get(row.departmentId) ?? row.department.name },
    position: { ...row.position, name: positions.get(row.positionId) ?? row.position.name },
  }))
}

export function employeeStructure(rows: EmployeeCard[], directories: RegistryDirectories) {
  const groups = new Map(directories.department.map(({ id, name }) => [id, { id, name, rows: [] as EmployeeCard[] }]))
  const positions = new Map(directories.position.map(({ id }, rank) => [id, rank]))
  for (const row of rows) {
    const group = groups.get(row.departmentId)
    if (!group || !positions.has(row.positionId)) return null
    group.rows.push(row)
  }
  return [...groups.values()].filter(group => group.rows.length).map(group => ({
    ...group,
    rows: group.rows.sort((a, b) => positions.get(a.positionId)! - positions.get(b.positionId)! ||
      collator.compare(fullName(a), fullName(b)) || a.id.localeCompare(b.id)),
  }))
}
export type EmployeeDepartmentGroup = NonNullable<ReturnType<typeof employeeStructure>>[number]
export function registryOptions(entries: DictionaryEntry[], field: 'department' | 'position', selected: string) {
  const options = [{ value: '', label: field === 'department' ? 'Усі підрозділи' : 'Усі посади' },
    ...entries.map(entry => ({ value: entry.id, label: entry.name }))]
  if (selected && !entries.some(entry => entry.id === selected)) options.push({ value: selected, label: 'Обраний запис недоступний' })
  return options
}
