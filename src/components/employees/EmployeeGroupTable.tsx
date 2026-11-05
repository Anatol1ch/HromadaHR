import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { EmployeeCard } from '../../../shared/personnel'
import { displayDate, fullName } from '../../employees/model'
import type { EmployeeSort, SortKey } from '../../employees/registry.ts'
import DictionaryTable from '../DictionaryTable'
import { TableSkeleton } from '../Skeleton'

export interface EmployeeActions {
  onOpen: (employee: EmployeeCard) => void
  onEdit: (employee: EmployeeCard) => void
  onDelete: (employee: EmployeeCard) => void
}
export default function EmployeeGroupTable({ title, rows, total, sort, onSort, loading, error, filtered, ...actions }: EmployeeActions & {
  title: string; rows: EmployeeCard[]; total: number; sort: EmployeeSort; onSort: (key: SortKey) => void
  loading: boolean; error: string; filtered: boolean
}) {
  const columns: { key: SortKey; label: string; width: string }[] = [
    { key: 'fullName', label: 'ПІБ', width: '28%' }, { key: 'department', label: 'Підрозділ', width: '24%' },
    { key: 'position', label: 'Посада', width: '26%' }, { key: 'hireDate', label: 'Дата прийняття', width: '130px' },
  ]
  return <section className="dashboard-panel employee-register-panel">
    <header className="employee-group-heading"><h2>{title}</h2><span aria-live="polite">
      {loading ? 'Завантаження…' : error ? 'Дані недоступні' : `Записів: ${rows.length}${filtered ? ` із ${total}` : ''}`}
    </span></header>
    {loading ? <TableSkeleton columns={5} label={`Завантаження: ${title}`}/> :
      <DictionaryTable label={title} className="hr-employee-table" filtered={filtered}
        empty={error ? 'Дані недоступні' : rows.length ? undefined : filtered ? 'Нічого не знайдено' : 'Працівників цієї групи ще немає'}
        columns={[...columns.map(column => ({
          width: column.width, sort: sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' as const : 'descending' as const) : undefined,
          label: <button type="button" className="registry-sort-button" title={`Сортувати: ${column.label}`} onClick={() => onSort(column.key)}
            aria-label={`${title}: ${column.label}. Сортувати ${sort.key === column.key && sort.direction === 'asc' ? 'за спаданням' : 'за зростанням'}`}>
            <span className="registry-sort-label">{column.label}</span><span aria-hidden="true">{sort.key === column.key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
          </button>,
        })), { label: 'Дії', width: '124px', className: 'employee-actions-heading' }]}>
        {rows.map(employee => <tr key={employee.id}>
          <td><strong className="employee-name">{fullName(employee)}</strong></td>
          <td>{employee.department.name}</td><td>{employee.position.name}</td>
          <td className="employee-date">{displayDate(employee.hireDate)}</td>
          <td className="dictionary-actions-cell"><div className="registry-row-actions">
            <button type="button" className="table-action" title="Переглянути" aria-label={`Переглянути: ${fullName(employee)}`} onClick={() => actions.onOpen(employee)}><Eye size={17} aria-hidden="true"/></button>
            <button type="button" className="table-action" title="Редагувати" aria-label={`Редагувати: ${fullName(employee)}`} onClick={() => actions.onEdit(employee)}><Pencil size={16} aria-hidden="true"/></button>
            <button type="button" className="table-action danger-action" title="Видалити" aria-label={`Видалити: ${fullName(employee)}`} onClick={() => actions.onDelete(employee)}><Trash2 size={16} aria-hidden="true"/></button>
          </div></td>
        </tr>)}
      </DictionaryTable>}
  </section>
}
