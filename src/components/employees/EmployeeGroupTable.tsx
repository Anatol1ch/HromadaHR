import { Eye, Landmark, Pencil, Trash2, UserRound } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, fullName } from '../../employees/model'
import type { EmployeeDepartmentGroup } from '../../employees/registry.ts'
import GroupedEmployeeTable from './GroupedEmployeeTable'

export interface EmployeeActions {
  onOpen: (employee: EmployeeCard) => void
  onEdit: (employee: EmployeeCard) => void
  onDelete: (employee: EmployeeCard) => void
}

const columns = [
  { label: 'ПІБ', width: '32%' }, { label: 'Посада', width: '28%' }, { label: 'Тип', width: '15%' },
  { label: 'Дата прийняття', width: '128px' }, { label: 'Дії', width: '116px', className: 'employee-actions-heading' },
]

export default function EmployeeGroupTable({ groups, loading, error, filtered, ...actions }: EmployeeActions & {
  groups: EmployeeDepartmentGroup[]
  loading: boolean; error: string; filtered: boolean
}) {
  const renderRow = (employee: EmployeeCard) => {
    const name = fullName(employee)
    const editId = 'employee-edit-' + employee.id
    const TypeIcon = employee.employeeType === 'official' ? Landmark : UserRound
    return <tr key={employee.id}>
      <td><strong className="employee-name">{name}</strong></td>
      <td>{employee.position.name}</td>
      <td className="employee-type-cell"><span className={`employee-type employee-type-${employee.employeeType}`}><TypeIcon size={16} aria-hidden="true"/>{employee.employeeType === 'official' ? 'Посадова особа' : 'Інший працівник'}</span></td>
      <td className="employee-date">{displayDate(employee.hireDate)}</td>
      <td className="dictionary-actions-cell"><div className="registry-row-actions">
        <button type="button" className="table-action" title="Переглянути" aria-label={`Переглянути: ${name}`} onClick={() => actions.onOpen(employee)}><Eye size={17} aria-hidden="true"/></button>
        <button id={editId} data-registry-action={editId} type="button" className="table-action" title="Редагувати" aria-label={`Редагувати: ${name}`} onClick={() => actions.onEdit(employee)}><Pencil size={16} aria-hidden="true"/></button>
        <button type="button" className="table-action danger-action" title="Видалити" aria-label={`Видалити: ${name}`} onClick={() => actions.onDelete(employee)}><Trash2 size={16} aria-hidden="true"/></button>
      </div></td>
    </tr>
  }
  return <GroupedEmployeeTable groups={groups} loading={loading} error={error} filtered={filtered}
    columns={columns} renderRow={renderRow}/>
}
