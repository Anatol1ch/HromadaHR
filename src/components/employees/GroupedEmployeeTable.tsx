import type { ComponentProps, ReactNode } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import { Landmark, UserRound, UsersRound } from 'lucide-react'
import type { EmployeeDepartmentGroup } from '../../employees/registry'
import DictionaryTable from '../DictionaryTable'
import { TableSkeleton } from '../Skeleton'

const plural = new Intl.PluralRules('uk')

function pluralForm(count: number, one: string, few: string, many: string) {
  const category = plural.select(count)
  return category === 'one' ? one : category === 'few' ? few : many
}

/** Shared presentation only. Each registry supplies columns, ordered groups and row actions. */
export default function GroupedEmployeeTable({ groups, columns, renderRow, loading, error, filtered, count }: {
  groups: EmployeeDepartmentGroup[]
  columns: ComponentProps<typeof DictionaryTable>['columns']
  renderRow: (employee: EmployeeCard) => ReactNode
  loading: boolean; error: string; filtered: boolean; count?: number
}) {
  const title = 'Реєстр працівників'
  return <section className="dashboard-panel employee-register-panel">
    <header className="employee-group-heading"><h2>{title}</h2>{count !== undefined && !loading && !error && <span className="employee-muted" aria-live="polite">Знайдено: {count}</span>}</header>
    {loading ? <TableSkeleton columns={columns.length} label={title}/> :
      <DictionaryTable label={title} className="hr-employee-table personnel-registry-table" filtered={filtered}
        empty={error ? 'Дані недоступні' : groups.length ? undefined : filtered ? 'Нічого не знайдено' : 'Працівників ще немає'}
        columns={columns}
        rowGroups={groups.map(group => {
          const total = group.rows.length
          const officials = group.rows.filter(row => row.employeeType === 'official').length
          const staff = group.rows.filter(row => row.employeeType === 'staff').length
          return <tbody key={group.id}>
            <tr><th className="employee-department-heading" colSpan={columns.length} scope="rowgroup">
              <div className="employee-department-content">
                <strong>{group.name}</strong>
                <span className="employee-department-stat"><UsersRound size={14} aria-hidden="true"/>{total} {pluralForm(total, 'працівник', 'працівники', 'працівників')}</span>
                {officials > 0 && <span className="employee-department-stat"><Landmark size={14} aria-hidden="true"/>{officials} {pluralForm(officials, 'посадова особа', 'посадові особи', 'посадових осіб')}</span>}
                {staff > 0 && <span className="employee-department-stat"><UserRound size={14} aria-hidden="true"/>{staff} {pluralForm(staff, 'інший працівник', 'інші працівники', 'інших працівників')}</span>}
              </div>
            </th></tr>
            {group.rows.map(renderRow)}
          </tbody>
        })}/>}
  </section>
}
