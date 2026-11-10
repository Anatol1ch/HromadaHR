import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, fullName } from '../../employees/model'
import type { EmployeeDepartmentGroup } from '../../employees/registry.ts'
import DictionaryTable from '../DictionaryTable'
import { TableSkeleton } from '../Skeleton'

export interface EmployeeActions {
  onOpen: (employee: EmployeeCard) => void
  onEdit: (employee: EmployeeCard) => void
  onDelete: (employee: EmployeeCard) => void
}

const columns = [
  { label: 'ПІБ' }, { label: 'Посада', width: '25%' }, { label: 'Тип', width: '126px' },
  { label: 'Дата прийняття', width: '116px' }, { label: 'Дії', width: '104px', className: 'employee-actions-heading' },
]
const plural = new Intl.PluralRules('uk')

export default function EmployeeGroupTable({ groups, loading, error, filtered, ...actions }: EmployeeActions & {
  groups: EmployeeDepartmentGroup[]
  loading: boolean; error: string; filtered: boolean
}) {
  const title = 'Реєстр працівників'
  const renderRow = (employee: EmployeeCard) => {
    const name = fullName(employee)
    const editId = 'employee-edit-' + employee.id
    return <tr key={employee.id}>
      <td><strong className="employee-name">{name}</strong></td>
      <td>{employee.position.name}</td>
      <td>{employee.employeeType === 'official' ? 'Посадова особа' : 'Інший працівник'}</td>
      <td className="employee-date">{displayDate(employee.hireDate)}</td>
      <td className="dictionary-actions-cell"><div className="registry-row-actions">
        <button type="button" className="table-action" title="Переглянути" aria-label={`Переглянути: ${name}`} onClick={() => actions.onOpen(employee)}><Eye size={17} aria-hidden="true"/></button>
        <button id={editId} data-registry-action={editId} type="button" className="table-action" title="Редагувати" aria-label={`Редагувати: ${name}`} onClick={() => actions.onEdit(employee)}><Pencil size={16} aria-hidden="true"/></button>
        <button type="button" className="table-action danger-action" title="Видалити" aria-label={`Видалити: ${name}`} onClick={() => actions.onDelete(employee)}><Trash2 size={16} aria-hidden="true"/></button>
      </div></td>
    </tr>
  }
  return <section className="dashboard-panel employee-register-panel">
    <header className="employee-group-heading"><h2>{title}</h2></header>
    {loading ? <TableSkeleton columns={columns.length} label={title}/> :
      <DictionaryTable label={title} className="hr-employee-table personnel-registry-table" filtered={filtered}
        empty={error ? 'Дані недоступні' : groups.length ? undefined : filtered ? 'Нічого не знайдено' : 'Працівників ще немає'}
        columns={columns}
        rowGroups={groups.map(group => {
          const count = group.rows.length
          const category = plural.select(count)
          return <tbody key={group.id}>
            <tr><th className="employee-department-heading" colSpan={columns.length} scope="rowgroup">
              <strong>{group.name}</strong><span> · {count} {category === 'one' ? 'працівник' : category === 'few' ? 'працівники' : 'працівників'}</span>
            </th></tr>
            {group.rows.map(renderRow)}
          </tbody>
        })}/>}
  </section>
}
