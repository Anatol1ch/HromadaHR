import { useId } from 'react'
import { FilterX, ListRestart, Plus, SlidersHorizontal } from 'lucide-react'
import type { EmployeeCard, EmployeeType } from '../../../shared/personnel'
import { employeeCounts, employeeGroups, registryOptions } from '../../employees/registry.ts'
import type { RegistryState, SortKey } from '../../employees/registry.ts'
import Alert from '../Alert'
import SearchField from '../SearchField'
import Select from '../Select'
import EmployeeGroupTable from './EmployeeGroupTable'
import type { EmployeeActions } from './EmployeeGroupTable'

type Props = EmployeeActions & {
  employees: EmployeeCard[]; loading: boolean; error: string; state: RegistryState
  onState: (value: Partial<RegistryState>) => void; onSort: (type: EmployeeType, key: SortKey) => void
  onResetSort: () => void; onClear: () => void; onRetry: () => void; onCreate: () => void
}
export default function EmployeeRegistry({ employees, loading, error, state, onState, onSort, onResetSort, onClear, onRetry, onCreate, ...actions }: Props) {
  const panelId = useId()
  const groups = employeeGroups(employees, state)
  const counts = employeeCounts(employees)
  const activeFilters = Number(!!state.departmentId) + Number(!!state.positionId)
  const filtered = !!state.query.trim() || activeFilters > 0
  const sorted = Object.values(state.sorts).some(sort => sort.key !== 'fullName' || sort.direction !== 'asc')
  return <section className="employee-registry" aria-labelledby="employees-title">
    <div className="page-heading employee-heading">
      <div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="employees-title" tabIndex={-1}>Працівники</h1>
        <p className="subtitle">Реєстр працівників та особові картки громади</p></div>
      <button type="button" className="primary-button" onClick={onCreate}><Plus size={18} aria-hidden="true"/>Додати працівника</button>
    </div>
    <section className="dashboard-panel aid-registry-panel employee-registry-tools" aria-label="Пошук і фільтри працівників">
      <div className="aid-toolbar">
        <SearchField value={state.query} onChange={query => onState({ query })} label="Пошук за ПІБ" placeholder="Прізвище, ім’я або по батькові"/>
        <button type="button" className={`secondary-button aid-filter-toggle${state.filtersOpen ? ' expanded' : ''}`} aria-expanded={state.filtersOpen}
          aria-controls={panelId} onClick={() => onState({ filtersOpen: !state.filtersOpen })}><SlidersHorizontal size={18} aria-hidden="true"/>Фільтри
          {activeFilters > 0 && <span className="aid-filter-count" aria-label={`Застосовано фільтрів: ${activeFilters}`}>{activeFilters}</span>}
        </button>
        <button type="button" className="secondary-button aid-filter-reset" disabled={!filtered} onClick={onClear}><FilterX size={17} aria-hidden="true"/>Очистити фільтри</button>
        <button type="button" className="secondary-button aid-sort-reset" disabled={!sorted} onClick={onResetSort}><ListRestart size={17} aria-hidden="true"/>Скинути сортування</button>
      </div>
      <div id={panelId} className="aid-filter-panel" hidden={!state.filtersOpen}><div className="aid-filter-grid">
        <div className="employee-field"><span>Підрозділ</span><Select label="Фільтр за підрозділом" value={state.departmentId} onChange={departmentId => onState({ departmentId })}
          options={registryOptions(employees, 'department', state.departmentId)} advanceOnSelect={false}/></div>
        <div className="employee-field"><span>Посада</span><Select label="Фільтр за посадою" value={state.positionId} onChange={positionId => onState({ positionId })}
          options={registryOptions(employees, 'position', state.positionId)} advanceOnSelect={false}/></div>
      </div></div>
      <p className="employee-results" role="status">{loading ? 'Завантаження реєстру…' : error ? 'Дані реєстру недоступні' :
        `Усього працівників: ${counts.total}. Результатів: ${groups.official.length + groups.staff.length}.`}</p>
    </section>
    {error && <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити завантаження</button>}>{error}</Alert>}
    {(['official', 'staff'] as const).map(type => <EmployeeGroupTable key={type} title={type === 'official' ? 'Посадові особи місцевого самоврядування' : 'Інші працівники'}
      rows={error ? [] : groups[type]} total={counts[type]} loading={loading} error={error} filtered={filtered} sort={state.sorts[type]}
      onSort={key => onSort(type, key)} {...actions}/>)}
  </section>
}
