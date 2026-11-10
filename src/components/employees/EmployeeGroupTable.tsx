import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, fullName } from '../../employees/model'
import type { EmployeeDepartmentGroup, EmployeeSort, SortKey } from '../../employees/registry.ts'
import DictionaryTable from '../DictionaryTable'
import { TableSkeleton } from '../Skeleton'

export interface EmployeeActions {
  onOpen: (employee: EmployeeCard) => void
  onEdit: (employee: EmployeeCard) => void
  onDelete: (employee: EmployeeCard) => void
}

const sortableColumns: { key: SortKey; label: string; width?: string }[] = [
  { key: 'fullName', label: 'ПІБ', width: '28%' }, { key: 'department', label: 'Підрозділ' },
  { key: 'position', label: 'Посада', width: '24%' }, { key: 'hireDate', label: 'Дата прийняття', width: '112px' },
]
const plural = new Intl.PluralRules('uk')

export default function EmployeeGroupTable({ rows, groups, total, sort, onSort, loading, error, filtered, ...actions }: EmployeeActions & {
  rows: EmployeeCard[]; groups?: EmployeeDepartmentGroup[]; total: number; sort: EmployeeSort; onSort: (key: SortKey) => void
  loading: boolean; error: string; filtered: boolean
}) {
  const structured = groups !== undefined
  const title = 'Реєстр працівників'
  const columns = structured ? [
    { label: 'ПІБ' }, { label: 'Посада', width: '27%' }, { label: 'Тип', width: '112px' },
    { label: 'Дата прийняття', width: '112px' },
  ] : sortableColumns.map(column => ({
    width: column.width, sort: sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' as const : 'descending' as const) : undefined,
    label: <button type="button" className="registry-sort-button" title={`Сортувати: ${column.label}`} onClick={() => onSort(column.key)}
      aria-label={`${column.label}. Сортувати ${sort.key === column.key && sort.direction === 'asc' ? 'за спаданням' : 'за зростанням'}`}>
      <span className="registry-sort-label">{column.label}</span><span aria-hidden="true">{sort.key === column.key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
    </button>,
  }))
  const renderRow = (employee: EmployeeCard) => {
    const name = fullName(employee)
    const editId = 'employee-edit-' + employee.id
    return <tr key={employee.id}>
      <td><strong className="employee-name">{name}</strong></td>
      {!structured && <td>{employee.department.name}</td>}
      <td>{employee.position.name}</td>
      {structured && <td>{employee.employeeType === 'official' ? 'Посадова особа' : 'Інший працівник'}</td>}
      <td className="employee-date">{displayDate(employee.hireDate)}</td>
      <td className="dictionary-actions-cell"><div className="registry-row-actions">
        <button type="button" className="table-action" title="Переглянути" aria-label={`Переглянути: ${name}`} onClick={() => actions.onOpen(employee)}><Eye size={17} aria-hidden="true"/></button>
        <button id={editId} data-registry-action={editId} type="button" className="table-action" title="Редагувати" aria-label={`Редагувати: ${name}`} onClick={() => actions.onEdit(employee)}><Pencil size={16} aria-hidden="true"/></button>
        <button type="button" className="table-action danger-action" title="Видалити" aria-label={`Видалити: ${name}`} onClick={() => actions.onDelete(employee)}><Trash2 size={16} aria-hidden="true"/></button>
      </div></td>
    </tr>
  }
  return <section className="dashboard-panel employee-register-panel">
    <header className="employee-group-heading"><h2>{title}</h2><span aria-live="polite">
      {loading ? 'Завантаження…' : error ? 'Дані недоступні' : `Записів: ${rows.length}${filtered ? ` із ${total}` : ''}`}
    </span></header>
    {loading ? <TableSkeleton columns={5} label={title}/> :
      <DictionaryTable label={title} className="hr-employee-table personnel-registry-table" filtered={filtered}
        empty={error ? 'Дані недоступні' : rows.length ? undefined : filtered ? 'Нічого не знайдено' : 'Працівників ще немає'}
        columns={[...columns, { label: 'Дії', width: '112px', className: 'employee-actions-heading' }]}
        rowGroups={groups?.map(group => {
          const count = group.rows.length
          const category = plural.select(count)
          return <tbody key={group.id}>
            <tr><th className="employee-department-heading" colSpan={columns.length + 1} scope="rowgroup">
              <strong>{group.name}</strong><span> · {count} {category === 'one' ? 'працівник' : category === 'few' ? 'працівники' : 'працівників'}</span>
            </th></tr>
            {group.rows.map(renderRow)}
          </tbody>
        })}>
        {!structured && rows.map(renderRow)}
      </DictionaryTable>}
  </section>
}
