import type { ComponentProps, ReactNode } from 'react'
import type { EmployeeCard } from '../../../shared/personnel'
import type { EmployeeDepartmentGroup } from '../../employees/registry'
import DictionaryTable from '../DictionaryTable'
import { TableSkeleton } from '../Skeleton'

const plural = new Intl.PluralRules('uk')

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
