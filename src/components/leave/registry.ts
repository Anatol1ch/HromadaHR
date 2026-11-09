import type { LeaveRecord } from '../../../shared/leave'
import type { EmployeeCard } from '../../../shared/personnel'
import { leaveLabels, matchesLeaveGroup, overlapsYear } from './presentation.ts'
export type LeaveSortKey = 'name' | 'department' | 'position' | 'type' | 'startDate' | 'endDate' | 'days' | 'status'
export const emptyLeaveFilters = { query:'', department:'', position:'', employee:'', type:'', year:'', status:'' }
export type LeaveFilters = typeof emptyLeaveFilters
const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase('uk-UA').trim()
export const personName = (employee: EmployeeCard) => [employee.lastName,employee.firstName,employee.middleName].filter(Boolean).join(' ')
export function journalRows(records: LeaveRecord[], employees: EmployeeCard[], filters: LeaveFilters, key: LeaveSortKey, direction: 'asc' | 'desc') {
  const people = new Map(employees.map(employee => [employee.id,employee]))
  const rows = records.filter(record => {
    const person = people.get(record.employeeId)
    const haystack = normalize((person ? personName(person) : '') + ' ' + (record.orderNumber ?? ''))
    return normalize(filters.query).split(/\s+/).every(word => haystack.includes(word)) &&
      (!filters.department || person?.department.id === filters.department) && (!filters.position || person?.position.id === filters.position) &&
      (!filters.employee || record.employeeId === filters.employee) && matchesLeaveGroup(record.leaveType,filters.type) && overlapsYear(record,filters.year) && (!filters.status || record.status === filters.status)
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
