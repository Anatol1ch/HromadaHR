import { leaveTypes, periodLeaveTypes, type EmployeeLeaveRight, type LeaveType } from '../../../shared/leave.ts'
export const rightLabels = {
  has_right: 'Право підтверджено',
  no_right: 'Права немає',
  unknown: 'Право не перевірено',
} satisfies Record<EmployeeLeaveRight['status'] | 'unknown', string>
export const leaveLabels = {
  study_leave: 'Додаткова на навчання',
  veteran_special_leave: 'Для УБД та інших категорій за статтею 16-2',
  chernobyl_special_leave: 'Для постраждалих унаслідок Чорнобильської катастрофи',
  annual_main: 'Щорічна основна',
  oms_service_additional: 'Додаткова за стаж',
  children_social_additional: 'Додаткова на дітей',
}
export const periodLeaveOptions = periodLeaveTypes.map(value => ({ value, label: leaveLabels[value] }))
export const leaveOptions = leaveTypes.map(value => ({ value, label: leaveLabels[value] }))

export function overlapsYear(record: { startDate: string; endDate: string }, year: string) {
  return !year || (record.startDate <= year + '-12-31' && record.endDate >= year + '-01-01')
}

export type LeaveGroup = 'annual_main' | 'oms_service_additional' | 'children_social_additional' | 'study_leave' | 'other'
export const leaveGroupOptions = [
  ...leaveOptions.filter(option => option.value !== 'veteran_special_leave' && option.value !== 'chernobyl_special_leave'),
  { value: 'other', label: 'Соціальні та інші' },
]
export const specialOptions = leaveOptions.filter(option => option.value === 'veteran_special_leave' || option.value === 'chernobyl_special_leave')
export function groupForType(type: LeaveType): LeaveGroup {
  return type === 'veteran_special_leave' || type === 'chernobyl_special_leave' ? 'other' : type
}
export function matchesLeaveGroup(type: LeaveType, group: string) { return !group || groupForType(type) === group }
export function selectedLeaveType(group: LeaveGroup, subtype: string): LeaveType | null {
  if (group !== 'other') return group
  return subtype === 'veteran_special_leave' || subtype === 'chernobyl_special_leave' ? subtype : null
}
