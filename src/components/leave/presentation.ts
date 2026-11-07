import { leaveTypes, periodLeaveTypes } from '../../../shared/leave.ts'
export const leaveLabels = {
  study_leave: 'Навчальна відпустка',
  veteran_special_leave: 'Додаткова за статтею 16-2 (зокрема УБД)',
  chernobyl_special_leave: 'Додаткова постраждалим унаслідок Чорнобильської катастрофи',
  annual_main: 'Щорічна основна',
  oms_service_additional: 'Додаткова за стаж служби в ОМС',
  children_social_additional: 'Додаткова соціальна на дітей',
}
export const periodLeaveOptions = periodLeaveTypes.map(value => ({ value, label: leaveLabels[value] }))
export const leaveOptions = leaveTypes.map(value => ({ value, label: leaveLabels[value] }))

export function overlapsYear(record: { startDate: string; endDate: string }, year: string) {
  return !year || (record.startDate <= year + '-12-31' && record.endDate >= year + '-01-01')
}
