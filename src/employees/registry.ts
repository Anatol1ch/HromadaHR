import type { EmployeeCard, EmployeeType } from '../../shared/personnel'
import { fullName, normalizeText } from './model.ts'
import { isIsoCalendarDate } from '../lib/dates.ts'

export type SortKey = 'fullName' | 'position' | 'department' | 'hireDate'
export interface EmployeeSort { key: SortKey; direction: 'asc' | 'desc' }
export interface RegistryState {
  query: string; departmentId: string; positionId: string; filtersOpen: boolean
  sorts: Record<EmployeeType, EmployeeSort>
}
export const defaultSort = (): EmployeeSort => ({ key: 'fullName', direction: 'asc' })
export const initialRegistry = (): RegistryState => ({ query: '', departmentId: '', positionId: '', filtersOpen: false,
  sorts: { official: defaultSort(), staff: defaultSort() } })
export const nextSort = (current: EmployeeSort, key: SortKey): EmployeeSort => ({
  key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
})
export const collator = new Intl.Collator('uk', { sensitivity: 'base' })
export function filterEmployees(rows: EmployeeCard[], filter: Pick<RegistryState, 'query' | 'departmentId' | 'positionId'>) {
  const terms = normalizeText(filter.query).split(' ').filter(Boolean)
  return rows.filter(row => (!filter.departmentId || row.departmentId === filter.departmentId) &&
    (!filter.positionId || row.positionId === filter.positionId) &&
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
export function employeeGroups(rows: EmployeeCard[], state: RegistryState) {
  const filtered = filterEmployees(rows, state)
  return {
    official: sortEmployees(filtered.filter(row => row.employeeType === 'official'), state.sorts.official),
    staff: sortEmployees(filtered.filter(row => row.employeeType === 'staff'), state.sorts.staff),
  }
}
export function employeeCounts(rows: EmployeeCard[]) {
  return { total: rows.length, official: rows.filter(row => row.employeeType === 'official').length,
    staff: rows.filter(row => row.employeeType === 'staff').length }
}
export function registryOptions(rows: EmployeeCard[], field: 'department' | 'position', selected: string) {
  const entries = [...new Map(rows.map(row => [row[field].id, row[field]])).values()]
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id))
  const options = [{ value: '', label: field === 'department' ? 'Усі підрозділи' : 'Усі посади' },
    ...entries.map(entry => ({ value: entry.id, label: entry.name }))]
  if (selected && !entries.some(entry => entry.id === selected)) options.push({ value: selected, label: 'Обрано — немає працівників' })
  return options
}
