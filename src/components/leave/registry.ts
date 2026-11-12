import type { LeaveRecord, LeaveType } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { leaveLabels, matchesLeaveGroup, overlapsYear } from './presentation.ts'
export type LeaveSortKey = 'name' | 'department' | 'position' | 'type' | 'startDate' | 'endDate' | 'days' | 'status'
export const emptyLeaveFilters = { query:'', department:'', position:'', employee:'', type:'', year:'', status:'' }
export type LeaveFilters = typeof emptyLeaveFilters
export type LeaveJournalContext = { employeeId: string; type: LeaveType; year: string }
export type RegistrationHistory = {
  records: LeaveRecord[]
  error: string
  loading: boolean
  retry: () => void
  open: (context: LeaveJournalContext) => void
  suspended: boolean
}
export function contextualLeaveFilters(context: LeaveJournalContext): LeaveFilters {
  return { ...emptyLeaveFilters, employee: context.employeeId, type: context.type, year: context.year }
}
const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('uk-UA').trim()
export const personName = (employee: EmployeeCard) => [employee.lastName,employee.firstName,employee.middleName].filter(Boolean).join(' ')
export function journalRows(records: LeaveRecord[], employees: EmployeeCard[], filters: LeaveFilters, key: LeaveSortKey, direction: 'asc' | 'desc', context = false) {
  const people = new Map(employees.map(employee => [employee.id,employee]))
  const rows = records.filter(record => {
    const person = people.get(record.employeeId)
    const haystack = normalize((person ? personName(person) : '') + ' ' + (record.orderNumber ?? ''))
    const typeMatches = context && filters.type !== 'other' ? !filters.type || record.leaveType === filters.type : matchesLeaveGroup(record.leaveType, filters.type)
    const yearMatches = context ? !filters.year || record.startDate.slice(0, 4) === filters.year : overlapsYear(record, filters.year)
    return normalize(filters.query).split(/\s+/).every(word => haystack.includes(word)) &&
      (!filters.department || person?.department.id === filters.department) && (!filters.position || person?.position.id === filters.position) &&
      (!filters.employee || record.employeeId === filters.employee) && typeMatches && yearMatches && (!filters.status || record.status === filters.status)
  })
  const value = (record: LeaveRecord): string | number => {
    const person = people.get(record.employeeId)
    switch(key) { case 'name': return person ? personName(person) : ''; case 'department': return person?.department.name ?? ''; case 'position': return person?.position.name ?? ''; case 'type': return leaveLabels[record.leaveType]; case 'days': return record.usedDays; case 'status': return record.status; default:return record[key] }
  }
  return rows.sort((a,b) => { const x=value(a),y=value(b); const compared=typeof x === 'number' && typeof y === 'number' ? x-y : String(x).localeCompare(String(y),'uk'); return (direction==='asc'?1:-1)*compared || a.id.localeCompare(b.id) })
}
export function recordCountLabel(found: number, total: number, filtered: boolean) {
  if (filtered) return 'Знайдено: '+found+' із '+total
  const form=new Intl.PluralRules('uk-UA').select(found)
  return found+' '+(form==='one'?'запис':form==='few'?'записи':'записів')
}

/** Scope independently of user-editable journal filters, including after clearing them. */
export function leaveRecordBelongsToEmployee(record: Pick<LeaveRecord, 'employeeId'>, employeeId?: string) {
  return employeeId === undefined || record.employeeId === employeeId
}
