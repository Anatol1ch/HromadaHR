import type { EmployeeCard } from '../../shared/personnel'
import { defaultSort, initialRegistry, nextSort } from './registry.ts'
import type { RegistryState, SortKey } from './registry.ts'

export type EmployeeFormTarget = { kind: 'create' } | { kind: 'edit'; employee: EmployeeCard }
export interface EmployeeWorkspaceState {
  registry: RegistryState
  cardId: string | null
  form: EmployeeFormTarget | null
  action: { kind: 'edit' | 'delete'; id: string } | null
  revision: number
}
export const initialWorkspace: EmployeeWorkspaceState = { registry: initialRegistry(), cardId: null, form: null, action: null, revision: 0 }
export type WorkspaceAction =
  { type: 'sort'; key: SortKey } | { type: 'resetSort' } | { type: 'clearFilters' } |
  { type: 'registry'; registry: Partial<EmployeeWorkspaceState['registry']> } |
  { type: 'card'; id: string | null } | { type: 'form'; form: EmployeeFormTarget | null } |
  { type: 'action'; action: EmployeeWorkspaceState['action'] } |
  { type: 'saved'; employee: EmployeeCard; created: boolean } | { type: 'deleted'; id: string }
export function workspaceReducer(state: EmployeeWorkspaceState, action: WorkspaceAction): EmployeeWorkspaceState {
  switch (action.type) {
    case 'sort': return { ...state, registry: { ...state.registry, sort: nextSort(state.registry.sort, action.key) } }
    case 'resetSort': return { ...state, registry: { ...state.registry, sort: defaultSort() } }
    case 'clearFilters': return { ...state, registry: { ...state.registry, query: '', departmentId: '', positionId: '', employeeType: '' } }
    case 'registry': return { ...state, registry: { ...state.registry, ...action.registry } }
    case 'card': return { ...state, cardId: action.id }
    case 'form': return { ...state, form: action.form }
    case 'action': return { ...state, action: action.action }
    case 'saved': return { ...state, form: null, action: null, cardId: action.created ? action.employee.id : state.cardId, revision: state.revision + 1 }
    case 'deleted': return { ...state, cardId: state.cardId === action.id ? null : state.cardId, action: null, revision: state.revision + 1 }
  }
}
export function mergeEmployee(rows: EmployeeCard[], saved: EmployeeCard) {
  return rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved]
}
