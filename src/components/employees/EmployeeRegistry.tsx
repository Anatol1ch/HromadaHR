import { useId } from 'react'
import { FilterX, Plus, SlidersHorizontal } from 'lucide-react'
import type { EmployeeCard, EmployeeType } from '../../../shared/personnel'
import { employeeStructure, employeeSummary, filterEmployees, registryOptions, withDirectoryNames } from '../../employees/registry.ts'
import type { RegistryDirectories, RegistryState } from '../../employees/registry.ts'
import Alert from '../Alert'
import InfoItem from '../InfoItem'
import InfoSection from '../InfoSection'
import SearchField from '../SearchField'
import Select from '../Select'
import EmployeeGroupTable from './EmployeeGroupTable'
import type { EmployeeActions } from './EmployeeGroupTable'

type Props = EmployeeActions & {
  employees: EmployeeCard[]; loading: boolean; error: string; state: RegistryState
  directories?: RegistryDirectories; directoriesLoading: boolean; directoriesError: string
  onState: (value: Partial<RegistryState>) => void; onRetryDirectories: () => void
  onClear: () => void; onRetry: () => void; onCreate: () => void
}
export default function EmployeeRegistry({ employees, loading, error, state, directories, directoriesLoading, directoriesError,
  onState, onClear, onRetry, onRetryDirectories, onCreate, ...actions }: Props) {
  const panelId = useId()
  const filteredRows = filterEmployees(employees, state)
  const matches = directories ? withDirectoryNames(filteredRows, directories) : filteredRows
  const groups = directories ? employeeStructure(matches, directories) : null
  const missingOrder = !!directories && !groups && !directoriesLoading
  const orderError = directoriesError || (missingOrder ? 'Довідники й кадрові дані не збігаються. Оновіть реєстр.' : '')
  const tableError = error || orderError
  const tableLoading = loading || (directoriesLoading && !groups)
  const activeFilters = Number(!!state.departmentId) + Number(!!state.positionId) + Number(!!state.employeeType)
  const filtered = !!state.query.trim() || activeFilters > 0
  const summary = employeeSummary(matches)
  return <section className="employee-registry" aria-labelledby="employees-title">
    <div className="page-heading employee-heading">
      <div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1 id="employees-title" tabIndex={-1}>Працівники</h1>
        <p className="subtitle">Реєстр працівників та особові картки громади</p></div>
    </div>
    <section className="dashboard-panel aid-registry-panel employee-registry-tools" aria-label="Пошук і фільтри працівників">
      <div className="aid-toolbar">
        <SearchField value={state.query} onChange={query => onState({ query })} label="Пошук за ПІБ" placeholder="Прізвище, ім’я або по батькові"/>
        <button type="button" className={`secondary-button aid-filter-toggle${state.filtersOpen ? ' expanded' : ''}`} aria-expanded={state.filtersOpen}
          aria-controls={panelId} onClick={() => onState({ filtersOpen: !state.filtersOpen })}><SlidersHorizontal size={18} aria-hidden="true"/>Фільтри
          {activeFilters > 0 && <span className="aid-filter-count" aria-label={`Застосовано фільтрів: ${activeFilters}`}>{activeFilters}</span>}
        </button>
        <button type="button" className="secondary-button aid-filter-reset" disabled={!filtered} onClick={onClear}><FilterX size={17} aria-hidden="true"/>Очистити фільтри</button>
        <button type="button" className="primary-button" disabled={loading} onClick={onCreate}><Plus size={18} aria-hidden="true"/>Додати працівника</button>
      </div>
      <div id={panelId} className="aid-filter-panel" hidden={!state.filtersOpen}><div className="aid-filter-grid">
        <div className="employee-field"><span>Підрозділ</span><Select label="Фільтр за підрозділом" value={state.departmentId} onChange={departmentId => onState({ departmentId })}
          options={registryOptions(directories?.department ?? [], 'department', state.departmentId)} disabled={!directories} advanceOnSelect={false}/></div>
        <div className="employee-field"><span>Посада</span><Select label="Фільтр за посадою" value={state.positionId} onChange={positionId => onState({ positionId })}
          options={registryOptions(directories?.position ?? [], 'position', state.positionId)} disabled={!directories} advanceOnSelect={false}/></div>
        <div className="employee-field"><span>Тип працівника</span><Select label="Фільтр за типом працівника" value={state.employeeType}
          onChange={value => onState({ employeeType: value as EmployeeType | '' })} advanceOnSelect={false}
          options={[{ value: '', label: 'Усі' }, { value: 'official', label: 'Посадові особи ОМС' }, { value: 'staff', label: 'Інші працівники' }]}/></div>
      </div></div>
    </section>
    {error && <Alert variant="error" action={<button type="button" onClick={onRetry}>Повторити завантаження</button>}>{error}</Alert>}
    {orderError && <Alert variant="error" action={<button type="button" onClick={missingOrder ? onRetry : onRetryDirectories}>Повторити завантаження довідників</button>}>{orderError}</Alert>}
    <EmployeeGroupTable groups={tableError ? [] : groups ?? []} loading={tableLoading}
      error={tableError} filtered={filtered} {...actions}/>
    {!tableLoading && !tableError && <InfoSection title="Підсумок реєстру">
      <dl className="info-grid employee-registry-summary" aria-live="polite">
        <InfoItem label="Усього працівників" value={summary.total} emphasis/>
        <InfoItem label="Посадових осіб ОМС" value={summary.officials}/>
        <InfoItem label="Інших працівників" value={summary.staff}/>
      </dl>
    </InfoSection>}
  </section>
}
